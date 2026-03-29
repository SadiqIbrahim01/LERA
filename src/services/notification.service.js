const prisma = require('../lib/prisma')
const socketService = require('./socket.service')
const pushService = require('./push.service')

// ─────────────────────────────────────────────────────────────────
// saveNotification — unchanged, always saves to DB
// ─────────────────────────────────────────────────────────────────
const saveNotification = async ({ userId, emergencyId, title, body }) => {
  return await prisma.notification.create({
    data: {
      userId,
      emergencyId: emergencyId || null,
      title,
      body,
    },
  })
}

// ─────────────────────────────────────────────────────────────────
// notifyResponders
// Called when a new emergency is created.
// Sends Socket.IO event + FCM push to every online responder.
// ─────────────────────────────────────────────────────────────────
const notifyResponders = async (responders, emergency) => {
  const title = '🚨 New Emergency Alert'
  const body = `${emergency.type} reported in ${emergency.district || 'your area'}. Tap to respond.`

  // The data payload is sent silently alongside the push.
  // The mobile app reads this to navigate directly to the emergency screen.
  const pushData = {
    emergencyId: emergency.id,
    type: emergency.type,
    district: emergency.district || '',
    screen: 'EmergencyAlert',
  }

  // Run all notifications in parallel
  await Promise.all(
    responders.map(async (responder) => {
      // 1. Save to database
      await saveNotification({
        userId: responder.id,
        emergencyId: emergency.id,
        title,
        body,
      })

      // 2. Socket.IO — instant in-app alert
      // The responder receives this if their app is open and connected
      socketService.emitToUser(responder.id, 'emergency:new', {
        emergency,
        title,
        body,
      })

      // 3. FCM push — delivered even if app is closed
      await pushService.sendPush(responder.fcmToken, title, body, pushData)
    })
  )

  console.log(
    `[NOTIFY] ${responders.length} responder(s) notified for emergency ${emergency.id}`
  )
}

// ─────────────────────────────────────────────────────────────────
// notifyCitizen
// Called when a responder accepts.
// Tells the citizen their help is coming.
// ─────────────────────────────────────────────────────────────────
const notifyCitizen = async (citizenId, emergency, responderName) => {
  const title = '✅ Responder is on the way'
  const body = `${responderName} has accepted your emergency and is heading to you now.`

  const pushData = {
    emergencyId: emergency.id,
    screen: 'EmergencyStatus',
  }

  // Fetch the citizen to get their FCM token
  const citizen = await prisma.user.findUnique({
    where: { id: citizenId },
    select: { fcmToken: true },
  })

  // 1. Save to database
  await saveNotification({
    userId: citizenId,
    emergencyId: emergency.id,
    title,
    body,
  })

  // 2. Socket.IO
  socketService.emitToUser(citizenId, 'emergency:accepted', {
    emergency,
    responderName,
    title,
    body,
  })

  // 3. FCM push
  await pushService.sendPush(citizen?.fcmToken, title, body, pushData)

  console.log(`[NOTIFY] Citizen ${citizenId} notified — responder accepted`)
}

// ─────────────────────────────────────────────────────────────────
// notifyResolved
// Called when the emergency is resolved.
// Notifies both citizen and responder.
// ─────────────────────────────────────────────────────────────────
const notifyResolved = async (citizenId, responderId, emergency) => {
  // Fetch both users' FCM tokens in one query
  const users = await prisma.user.findMany({
    where: { id: { in: [citizenId, responderId].filter(Boolean) } },
    select: { id: true, fcmToken: true },
  })

  const citizen = users.find((u) => u.id === citizenId)
  const responder = users.find((u) => u.id === responderId)

  const citizenTitle = '✅ Emergency Resolved'
  const citizenBody = 'Your emergency has been marked as resolved. Stay safe.'

  const responderTitle = '✅ Case Closed'
  const responderBody = 'You have successfully resolved this emergency. You are now available.'

  const pushData = {
    emergencyId: emergency.id,
    screen: 'EmergencyHistory',
  }

  // Notify citizen
  await saveNotification({
    userId: citizenId,
    emergencyId: emergency.id,
    title: citizenTitle,
    body: citizenBody,
  })
  socketService.emitToUser(citizenId, 'emergency:resolved', { emergency })
  await pushService.sendPush(citizen?.fcmToken, citizenTitle, citizenBody, pushData)

  // Notify responder
  if (responderId) {
    await saveNotification({
      userId: responderId,
      emergencyId: emergency.id,
      title: responderTitle,
      body: responderBody,
    })
    socketService.emitToUser(responderId, 'emergency:resolved', { emergency })
    await pushService.sendPush(responder?.fcmToken, responderTitle, responderBody, pushData)
  }

  console.log(`[NOTIFY] Both parties notified of resolution for ${emergency.id}`)
}

// ─────────────────────────────────────────────────────────────────
// notifyCancelled
// Called when a citizen cancels their emergency.
// Notifies the assigned responder if one exists.
// ─────────────────────────────────────────────────────────────────
const notifyCancelled = async (responderId, emergency) => {
  if (!responderId) return

  const title = '❌ Emergency Cancelled'
  const body = 'The citizen has cancelled this emergency. You are now available.'

  const responder = await prisma.user.findUnique({
    where: { id: responderId },
    select: { fcmToken: true },
  })

  await saveNotification({
    userId: responderId,
    emergencyId: emergency.id,
    title,
    body,
  })

  socketService.emitToUser(responderId, 'emergency:cancelled', { emergency })
  await pushService.sendPush(responder?.fcmToken, title, body, {
    emergencyId: emergency.id,
    screen: 'ResponderDashboard',
  })

  console.log(`[NOTIFY] Responder ${responderId} notified of cancellation`)
}

module.exports = {
  saveNotification,
  notifyResponders,
  notifyCitizen,
  notifyResolved,
  notifyCancelled,
}