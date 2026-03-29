const express = require('express')
const cors = require('cors')
const http = require('http')
const dotenv = require('dotenv')
const rateLimit = require('express-rate-limit')

dotenv.config()

const authRoutes = require('./routes/auth.routes')
const emergencyRoutes = require('./routes/emergency.routes')
const responderRoutes = require('./routes/responder.routes')
const notificationRoutes = require('./routes/notification.routes')
const socketService = require('./services/socket.service')

const app = express()

// ── Global middleware ──────────────────────────────────────────────
app.use(cors())
app.use(express.json())
const logger = require('./middleware/logger.middleware')

// ── Rate Limiters ──────────────────────────────────────────────────
// A rate limiter is a middleware that counts requests from each IP
// address within a time window. If the count exceeds the limit,
// it blocks that IP and returns a 429 error automatically.
// You do not need to add any checks inside your route handlers.

// Auth limiter — strict
// Protects register and login from brute-force attacks.
// 20 requests per 15 minutes per IP is generous for real users
// but stops any automated attack cold.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes in milliseconds
  max: 20,                    // max requests per IP per window
  message: {
    status: 'error',
    message: 'Too many attempts from this device. Please try again in 15 minutes.',
  },
  // standardHeaders adds RateLimit-* headers to every response
  // so the client knows how many requests they have left
  standardHeaders: true,
  legacyHeaders: false,
})

// General API limiter — relaxed
// Covers all other endpoints. Stops DoS attacks while
// giving real users plenty of headroom.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 200,                   // 200 requests per 15 minutes per IP
  message: {
    status: 'error',
    message: 'Too many requests from this device. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// Emergency limiter — tightest of all
// A citizen should never need to create more than a handful of
// emergencies in any 15-minute window.
// This also prevents someone from flooding responders with fake alerts.
const emergencyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // 10 emergency creations per IP
  message: {
    status: 'error',
    message: 'Too many emergency requests. Please wait before trying again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// ── Apply limiters to routes ───────────────────────────────────────
// Auth routes get the strict limiter
app.use('/api/v1/auth', authLimiter, authRoutes)

// Emergency route gets both the general limiter AND the emergency
// limiter. The emergency limiter is applied directly on the POST
// route inside the router file (we will add that next).
app.use('/api/v1/emergencies', apiLimiter, emergencyRoutes)

app.use('/api/v1/responders', apiLimiter, responderRoutes)
app.use('/api/v1/notifications', apiLimiter, notificationRoutes)

// ── Health check ───────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'LERA server is running' })
})

// 404 handler — catches any request that didn't match a route above
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Cannot ${req.method} ${req.path} — route not found`,
  })
})


// ── Global error handler ───────────────────────────────────────────
// Must be defined after all routes.
// Express identifies this as an error handler because it has
// four parameters — (err, req, res, next).
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500
  const message = err.message || 'Something went wrong'

  // Log the full error in development so you can debug it.
  // In production you would send this to a logging service.
  if (process.env.NODE_ENV === 'development') {
    console.error(`[ERROR] ${statusCode} — ${message}`)
  }

  res.status(statusCode).json({ status: 'error', message })
})

// ── Server startup ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000
const server = http.createServer(app)

// Initialise Socket.IO — must pass the HTTP server, not the Express app
socketService.init(server)

server.listen(PORT, () => {
  console.log(`🚀 LERA server running on port ${PORT}`)
  console.log(`📡 Environment: ${process.env.NODE_ENV}`)
})