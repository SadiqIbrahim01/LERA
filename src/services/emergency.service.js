const prisma = require('../lib/prisma')
const AppError = require('../utils/AppError')
const notificationService = require('./notification.service')

// ─────────────────────────────────────────────────────────────────
// STATUS TRANSITION MAP — The Finite State Machine
//
// This object defines which status changes are ALLOWED.
// Key = current status, Value = array of statuses it can move TO.
//
// Example: an emergency that is "pending" can become "dispatched"
// or "cancelled" — but it can NEVER jump straight to "resolved".
//
// Any transition NOT in this map gets rejected with a 400 error.
// This is your single source of truth for status logic.
// ─────────────────────────────────────────────────────────────────
const VALID_TRANSITIONS = {
  pending: ['dispatched', 'cancelled'],
  dispatched: ['resolved', 'cancelled'],
  resolved: [],    // terminal state — no further changes allowed
  cancelled: [],   // terminal state — no further changes allowed
}

const validateTransition = (currentStatus, newStatus) => {
  const allowed = VALID_TRANSITIONS[currentStatus]

  if (!allowed || !allowed.includes(newStatus)) {
    throw new AppError(
      `Cannot change status from "${currentStatus}" to "${newStatus}"`,
      400
    )
  }
}

// ─────────────────────────────────────────────────────────────────
// findOnlineResponders
// Returns all responders currently set to "online"
// These are the people who will receive the alert
// ─────────────────────────────────────────────────────────────────
const findOnlineResponders = async () => {
  // We join from User through their responderProfile
  // to check the availability field
  const responders = await prisma.user.findMany({
    where: {
      role: 'responder',
      responderProfile: {
        availability: 'online',
      },
    },
    include: {
      responderProfile: true,
    },
  })

  return responders
}

// ─────────────────────────────────────────────────────────────────
// CREATE EMERGENCY
// Called when a citizen taps the big button.
// ─────────────────────────────────────────────────────────────────
const createEmergency = async (citizenId, data) => {
  const { type, incidentLat, incidentLng, district } = data

  // 1. Check if this citizen already has an active emergency
  // We don't want them creating multiple emergencies at once
  const existingActive = await prisma.emergency.findFirst({
    where: {
      citizenId,
      status: { in: ['pending', 'dispatched'] },
    },
  })

  if (existingActive) {
    throw new AppError(
      'You already have an active emergency. Please wait for it to be resolved or cancel it first.',
      400
    )
  }

  // 2. Save the emergency to the database
  const emergency = await prisma.emergency.create({
    data: {
      citizenId,
      type,
      incidentLat,
      incidentLng,
      district: district || 'Unknown location',
      status: 'pending',
    },
  })

  // 3. Find all online responders
  const onlineResponders = await findOnlineResponders()

  if (onlineResponders.length === 0) {
    // Still save the emergency — a responder might come online soon.
    // Just log it and inform the citizen through the response.
    console.log(`[WARNING] Emergency ${emergency.id} created but NO responders are online`)
  }

  // 4. Notify all online responders
  if (onlineResponders.length > 0) {
    await notificationService.notifyResponders(onlineResponders, emergency)
  }

  // 5. Return the emergency with the count of notified responders
  return {
    emergency,
    respondersNotified: onlineResponders.length,
  }
}

// ─────────────────────────────────────────────────────────────────
// ACCEPT EMERGENCY
// Called when a responder taps "Accept".
// ─────────────────────────────────────────────────────────────────
const acceptEmergency = async (emergencyId, responderId) => {
  // 1. Find the emergency
  const emergency = await prisma.emergency.findUnique({
    where: { id: emergencyId },
  })

  if (!emergency) {
    throw new AppError('Emergency not found', 404)
  }

  // 2. Validate the status transition
  // pending → dispatched is valid. dispatched → dispatched is NOT.
  validateTransition(emergency.status, 'dispatched')

  // 3. Check this responder is actually a responder
  const responder = await prisma.user.findUnique({
    where: { id: responderId },
    include: { responderProfile: true },
  })

  if (!responder || responder.role !== 'responder') {
    throw new AppError('Only responders can accept emergencies', 403)
  }

  if (responder.responderProfile.availability !== 'online') {
    throw new AppError(
      'You must be set to "online" to accept an emergency',
      400
    )
  }

  // 4. Use a transaction to update BOTH the emergency and the
  // responder profile atomically — either both succeed or neither does
  const [updatedEmergency] = await prisma.$transaction([
    // Update emergency: assign responder, change status
    prisma.emergency.update({
      where: { id: emergencyId },
      data: {
        responderId,
        status: 'dispatched',
      },
    }),
    // Update responder profile: mark as busy so they stop
    // receiving new emergency alerts
    prisma.responderProfile.update({
      where: { userId: responderId },
      data: { availability: 'busy' },
    }),
  ])

  // 5. Notify the citizen their responder is coming
  await notificationService.notifyCitizen(
    emergency.citizenId,
    updatedEmergency,
    responder.fullName
  )

  return updatedEmergency
}

// ─────────────────────────────────────────────────────────────────
// DECLINE EMERGENCY
// Called when a responder taps "Decline".
// Emergency stays "pending" and gets re-broadcast to other responders.
// ─────────────────────────────────────────────────────────────────
const declineEmergency = async (emergencyId, responderId) => {
  // 1. Find the emergency
  const emergency = await prisma.emergency.findUnique({
    where: { id: emergencyId },
  })

  if (!emergency) {
    throw new AppError('Emergency not found', 404)
  }

  // 2. Can only decline a pending emergency
  if (emergency.status !== 'pending') {
    throw new AppError('This emergency is no longer available to decline', 400)
  }

  // 3. Find other online responders (everyone EXCEPT the one who declined)
  const otherResponders = await prisma.user.findMany({
    where: {
      role: 'responder',
      id: { not: responderId },
      responderProfile: {
        availability: 'online',
      },
    },
    include: { responderProfile: true },
  })

  // 4. Re-broadcast to the other available responders
  if (otherResponders.length > 0) {
    await notificationService.notifyResponders(otherResponders, emergency)
    console.log(
      `[DECLINE] Responder ${responderId} declined. Re-broadcast to ${otherResponders.length} other(s)`
    )
  } else {
    console.log(
      `[DECLINE] Responder ${responderId} declined. No other responders available.`
    )
  }

  return { message: 'Emergency declined', rebroadcastTo: otherResponders.length }
}

// ─────────────────────────────────────────────────────────────────
// RESOLVE EMERGENCY
// Called when the responder marks the case as done.
// ─────────────────────────────────────────────────────────────────
const resolveEmergency = async (emergencyId, responderId) => {
  // 1. Find the emergency
  const emergency = await prisma.emergency.findUnique({
    where: { id: emergencyId },
  })

  if (!emergency) {
    throw new AppError('Emergency not found', 404)
  }

  // 2. Validate the FSM transition FIRST
  // If the status is wrong, it doesn't matter who is asking —
  // the operation is impossible regardless
  validateTransition(emergency.status, 'resolved')

  // 3. Now check if this responder is the assigned one
  // We only reach this line if the transition was valid
  if (emergency.responderId !== responderId) {
    throw new AppError('You are not the assigned responder for this emergency', 403)
  }

  // 4. Update both emergency and responder profile in one transaction
  const [updatedEmergency] = await prisma.$transaction([
    prisma.emergency.update({
      where: { id: emergencyId },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
      },
    }),
    prisma.responderProfile.update({
      where: { userId: responderId },
      data: { availability: 'online' },
    }),
  ])

  // 5. Notify both parties
  await notificationService.notifyResolved(
    emergency.citizenId,
    responderId,
    updatedEmergency
  )

  return updatedEmergency
}
// ─────────────────────────────────────────────────────────────────
// CANCEL EMERGENCY
// Called when the citizen cancels their own emergency.
// ─────────────────────────────────────────────────────────────────
const cancelEmergency = async (emergencyId, citizenId) => {
  // 1. Find the emergency
  const emergency = await prisma.emergency.findUnique({
    where: { id: emergencyId },
  })

  if (!emergency) {
    throw new AppError('Emergency not found', 404)
  }

  // 2. Only the citizen who created it can cancel it
  if (emergency.citizenId !== citizenId) {
    throw new AppError('You can only cancel your own emergencies', 403)
  }

  // 3. Validate the transition
  validateTransition(emergency.status, 'cancelled')

  // 4. Update emergency status
  const updatedEmergency = await prisma.emergency.update({
    where: { id: emergencyId },
    data: { status: 'cancelled' },
  })

  // 5. If a responder was already assigned, free them up
  if (emergency.responderId) {
    await prisma.responderProfile.update({
      where: { userId: emergency.responderId },
      data: { availability: 'online' },
    })

    // Notify the responder the citizen cancelled
    await notificationService.notifyCancelled(
      emergency.responderId,
      updatedEmergency
    )

    console.log(
      `[CANCEL] Emergency ${emergencyId} cancelled. Responder ${emergency.responderId} freed.`
    )
  }

  return updatedEmergency
}

// ─────────────────────────────────────────────────────────────────
// GET EMERGENCY BY ID
// Returns full details of one emergency.
// Both citizen and their assigned responder can view it.
// ─────────────────────────────────────────────────────────────────
const getEmergencyById = async (emergencyId, requestingUserId) => {
  const emergency = await prisma.emergency.findUnique({
    where: { id: emergencyId },
    include: {
      // Include the citizen's basic info
      citizen: {
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
        },
      },
      // Include the responder's basic info if one is assigned
      responder: {
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          responderProfile: {
            select: {
              type: true,
              currentLat: true,
              currentLng: true,
            },
          },
        },
      },
    },
  })

  if (!emergency) {
    throw new AppError('Emergency not found', 404)
  }

  // Only the involved citizen or responder can view this emergency
  const isInvolved =
    emergency.citizenId === requestingUserId ||
    emergency.responderId === requestingUserId

  if (!isInvolved) {
    throw new AppError('You do not have permission to view this emergency', 403)
  }

  return emergency
}

// ─────────────────────────────────────────────────────────────────
// GET HISTORY
// Returns all past emergencies for the requesting user.
// Citizens see their own. Responders see the ones they handled.
// ─────────────────────────────────────────────────────────────────
const getHistory = async (userId, role) => {
  // Build the where clause based on the user's role
  const whereClause =
    role === 'citizen'
      ? { citizenId: userId }
      : { responderId: userId }

  const emergencies = await prisma.emergency.findMany({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
    include: {
      citizen: {
        select: { id: true, fullName: true, phoneNumber: true },
      },
      responder: {
        select: {
          id: true,
          fullName: true,
          responderProfile: { select: { type: true } },
        },
      },
    },
  })

  return emergencies
}

// ─────────────────────────────────────────────────────────────────
// GET ACTIVE EMERGENCY
// Returns the currently active emergency for a user if one exists.
// The app calls this on startup to resume a live emergency.
// ─────────────────────────────────────────────────────────────────
const getActiveEmergency = async (userId, role) => {
  const whereClause =
    role === 'citizen'
      ? { citizenId: userId, status: { in: ['pending', 'dispatched'] } }
      : { responderId: userId, status: 'dispatched' }

  const emergency = await prisma.emergency.findFirst({
    where: whereClause,
    include: {
      citizen: {
        select: { id: true, fullName: true, phoneNumber: true },
      },
      responder: {
        select: {
          id: true,
          fullName: true,
          responderProfile: {
            select: { type: true, currentLat: true, currentLng: true },
          },
        },
      },
    },
  })

  return emergency
}

module.exports = {
  createEmergency,
  acceptEmergency,
  declineEmergency,
  resolveEmergency,
  cancelEmergency,
  getEmergencyById,
  getHistory,
  getActiveEmergency,
}