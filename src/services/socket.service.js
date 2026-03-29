const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')

// This will hold the Socket.IO server instance.
// We store it here so any other file can import and use it
// without creating a new instance.
let io

// connectedUsers maps userId → socketId
// When we want to send an event to a specific user,
// we look up their socketId here.
// Example: { "amara-uuid": "abc123", "emeka-uuid": "xyz789" }
const connectedUsers = new Map()

// ─────────────────────────────────────────────────────────────────
// init
// Called once when the server starts.
// Attaches Socket.IO to your existing HTTP server.
// ─────────────────────────────────────────────────────────────────
const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      // In production you would restrict this to your app's domain.
      // For development, * allows any origin.
      methods: ['GET', 'POST'],
    },
  })

  // ── Authentication middleware for Socket.IO ──────────────────
  // This runs before a socket connection is established.
  // The client must send a valid JWT token when connecting.
  // If the token is invalid, the connection is rejected.
  //
  // On the mobile app side, the connection will look like:
  // io('https://your-server.com', { auth: { token: 'Bearer eyJ...' } })
  io.use(async (socket, next) => {
  try {
    // Check both places the token might arrive from:
    // 1. socket.handshake.auth.token  — standard Socket.IO client
    // 2. socket.handshake.query.token — Postman and some other clients
    const token =
      socket.handshake.auth.token ||
      socket.handshake.query.token

    if (!token) {
      return next(new Error('Authentication token missing'))
    }

    // Strip "Bearer " prefix if present
    const rawToken = token.startsWith('Bearer ')
      ? token.split(' ')[1]
      : token

    // Verify the JWT
    const decoded = jwt.verify(rawToken, process.env.JWT_SECRET)

    // Look up the user in the database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { responderProfile: true },
    })

    if (!user) {
      return next(new Error('User not found'))
    }

    socket.user = user
    next()
  } catch (err) {
    next(new Error('Invalid token'))
  }
})

  // ── Connection handler ───────────────────────────────────────
  // This runs every time a new client successfully connects
  io.on('connection', (socket) => {
    const user = socket.user
    console.log(`[SOCKET] Connected: ${user.fullName} (${user.role}) — socket: ${socket.id}`)

    // Register this user in our connectedUsers map
    connectedUsers.set(user.id, socket.id)

    // If they are a responder, add them to the "responders" room.
    // A room is like a group chat — you can emit to everyone
    // in a room with one line: io.to('responders').emit(...)
    if (user.role === 'responder') {
      socket.join('responders')
      console.log(`[SOCKET] ${user.fullName} joined room: responders`)
    }

    // Each user also gets their own private room named after their ID.
    // This lets you send events to just one specific user:
    // io.to(userId).emit(...)
    socket.join(user.id)

    // ── Client events ────────────────────────────────────────
    // Listen for location updates from responders while navigating.
    // The app sends this every 5 seconds while en route.
    socket.on('responder:location', async (data) => {
      const { lat, lng, emergencyId } = data

      if (!lat || !lng || !emergencyId) return

      // Update the location in the database
      await prisma.responderProfile.update({
        where: { userId: user.id },
        data: { currentLat: lat, currentLng: lng, lastSeenAt: new Date() },
      })

      // Find the emergency to get the citizen's ID
      const emergency = await prisma.emergency.findUnique({
        where: { id: emergencyId },
      })

      if (emergency && emergency.citizenId) {
        // Emit the location update to the citizen's private room
        io.to(emergency.citizenId).emit('responder:location', {
          lat,
          lng,
          responderId: user.id,
          emergencyId,
        })
      }
    })

    // ── Disconnect handler ───────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[SOCKET] Disconnected: ${user.fullName}`)
      connectedUsers.delete(user.id)
    })
  })

  console.log('[SOCKET] Socket.IO initialised')
  return io
}

// ─────────────────────────────────────────────────────────────────
// emitToUser
// Sends an event to one specific user by their userId.
// Uses their private room (socket.join(user.id) above).
// Safe to call even if the user is not connected — nothing crashes,
// the event just gets dropped silently.
// ─────────────────────────────────────────────────────────────────
const emitToUser = (userId, event, data) => {
  if (!io) return
  io.to(userId).emit(event, data)
  console.log(`[SOCKET] Emitted "${event}" to user ${userId}`)
}

// ─────────────────────────────────────────────────────────────────
// emitToResponders
// Sends an event to everyone in the "responders" room.
// Used when a new emergency is created.
// ─────────────────────────────────────────────────────────────────
const emitToResponders = (event, data) => {
  if (!io) return
  io.to('responders').emit(event, data)
  console.log(`[SOCKET] Emitted "${event}" to all responders`)
}

// ─────────────────────────────────────────────────────────────────
// getIO
// Returns the Socket.IO instance for use in other files.
// ─────────────────────────────────────────────────────────────────
const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialised')
  return io
}

module.exports = { init, emitToUser, emitToResponders, getIO }