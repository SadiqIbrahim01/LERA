const { z } = require('zod')
const authService = require('../services/auth.service')
const AppError = require('../utils/AppError')

// ── Zod validation schemas ─────────────────────────────────────────
// Zod checks the shape and type of the data BEFORE it touches your DB.
// Think of it as a contract: "I only accept data in this exact shape."

const registerSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please provide a valid email address'),
  phoneNumber: z.string().min(10, 'Phone number must be at least 10 digits'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['citizen', 'responder'], {
    errorMap: () => ({ message: 'Role must be either citizen or responder' }),
  }),
  // These are optional at the schema level — we validate them manually
  // in the service when role === 'responder'
  certificationId: z.string().optional(),
  responderType: z.enum(['police', 'ambulance', 'fire']).optional(),
})

const loginSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

const updateMeSchema = z.object({
  fullName: z.string().min(2).optional(),
  phoneNumber: z.string().min(10).optional(),
})

// ── Controller functions ───────────────────────────────────────────
// Each function follows the same pattern:
// 1. Validate input
// 2. Call service
// 3. Send response
// Any error thrown in the service is caught by the try/catch
// and passed to next(err) which routes it to our global error handler

const register = async (req, res, next) => {
  try {
    // Validate the request body against our schema
    // .safeParse() returns { success: true, data } or { success: false, error }
    // (unlike .parse() which throws directly)
    const validation = registerSchema.safeParse(req.body)

    if (!validation.success) {
      // Zod's error.issues is an array of all validation errors
      // We grab the first one's message to send back
      const message = validation.error.issues[0].message
      return next(new AppError(message, 400))
      // 400 = Bad Request — the client sent invalid data
    }

    const result = await authService.register(validation.data)

    res.status(201).json({
      status: 'success',
      data: result,
    })
    // 201 = Created — a new resource was successfully created

  } catch (err) {
    next(err)
  }
}

const login = async (req, res, next) => {
  try {
    const validation = loginSchema.safeParse(req.body)

    if (!validation.success) {
      const message = validation.error.issues[0].message
      return next(new AppError(message, 400))
    }

    const { email, password } = validation.data
    const result = await authService.login(email, password)

    res.status(200).json({
      status: 'success',
      data: result,
    })

  } catch (err) {
    next(err)
  }
}

const getMe = async (req, res, next) => {
  try {
    // req.user.id was attached by the protect middleware
    const user = await authService.getMe(req.user.id)

    res.status(200).json({
      status: 'success',
      data: { user },
    })

  } catch (err) {
    next(err)
  }
}

const updateMe = async (req, res, next) => {
  try {
    const validation = updateMeSchema.safeParse(req.body)

    if (!validation.success) {
      const message = validation.error.issues[0].message
      return next(new AppError(message, 400))
    }

    const user = await authService.updateMe(req.user.id, validation.data)

    res.status(200).json({
      status: 'success',
      data: { user },
    })

  } catch (err) {
    next(err)
  }
}

const updateFcmToken = async (req, res, next) => {
  try {
    const { fcmToken } = req.body

    if (!fcmToken) {
      return next(new AppError('FCM token is required', 400))
    }

    const result = await authService.updateFcmToken(req.user.id, fcmToken)

    res.status(200).json({
      status: 'success',
      data: result,
    })

  } catch (err) {
    next(err)
  }
}

module.exports = {
  register,
  login,
  getMe,
  updateMe,
  updateFcmToken,
}