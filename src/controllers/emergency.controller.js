const { z } = require('zod')
const emergencyService = require('../services/emergency.service')
const AppError = require('../utils/AppError')

// Validation schema for creating an emergency
const createEmergencySchema = z.object({
  type: z.enum(['injury', 'fire', 'medical', 'other'], {
    errorMap: () => ({ message: 'Type must be one of: robbery, injury, fire, medical, other' }),
  }),
  incidentLat: z
    .number({ invalid_type_error: 'incidentLat must be a number' })
    .min(-90)
    .max(90),
  incidentLng: z
    .number({ invalid_type_error: 'incidentLng must be a number' })
    .min(-180)
    .max(180),
  district: z.string().optional(),
})

// ── Controller functions ───────────────────────────────────────────

const createEmergency = async (req, res, next) => {
  try {
    const validation = createEmergencySchema.safeParse(req.body)

    if (!validation.success) {
      const message = validation.error.issues[0].message
      return next(new AppError(message, 400))
    }

    const result = await emergencyService.createEmergency(
      req.user.id,
      validation.data
    )

    res.status(201).json({
      status: 'success',
      data: result,
    })
  } catch (err) {
    next(err)
  }
}

const acceptEmergency = async (req, res, next) => {
  try {
    const emergency = await emergencyService.acceptEmergency(
      req.params.id,
      req.user.id
    )

    res.status(200).json({
      status: 'success',
      data: { emergency },
    })
  } catch (err) {
    next(err)
  }
}

const declineEmergency = async (req, res, next) => {
  try {
    const result = await emergencyService.declineEmergency(
      req.params.id,
      req.user.id
    )

    res.status(200).json({
      status: 'success',
      data: result,
    })
  } catch (err) {
    next(err)
  }
}

const resolveEmergency = async (req, res, next) => {
  try {
    const emergency = await emergencyService.resolveEmergency(
      req.params.id,
      req.user.id
    )

    res.status(200).json({
      status: 'success',
      data: { emergency },
    })
  } catch (err) {
    next(err)
  }
}

const cancelEmergency = async (req, res, next) => {
  try {
    const emergency = await emergencyService.cancelEmergency(
      req.params.id,
      req.user.id
    )

    res.status(200).json({
      status: 'success',
      data: { emergency },
    })
  } catch (err) {
    next(err)
  }
}

const getEmergencyById = async (req, res, next) => {
  try {
    const emergency = await emergencyService.getEmergencyById(
      req.params.id,
      req.user.id
    )

    res.status(200).json({
      status: 'success',
      data: { emergency },
    })
  } catch (err) {
    next(err)
  }
}

const getHistory = async (req, res, next) => {
  try {
    const emergencies = await emergencyService.getHistory(
      req.user.id,
      req.user.role
    )

    res.status(200).json({
      status: 'success',
      results: emergencies.length,
      data: { emergencies },
    })
  } catch (err) {
    next(err)
  }
}

const getActiveEmergency = async (req, res, next) => {
  try {
    const emergency = await emergencyService.getActiveEmergency(
      req.user.id,
      req.user.role
    )

    res.status(200).json({
      status: 'success',
      data: { emergency },
      // emergency will be null if there is no active one — that's fine
    })
  } catch (err) {
    next(err)
  }
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