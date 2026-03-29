const { z } = require('zod')
const prisma = require('../lib/prisma')
const AppError = require('../utils/AppError')

const availabilitySchema = z.object({
  availability: z.enum(['online', 'offline'], {
    errorMap: () => ({ message: 'Availability must be either online or offline' }),
  }),
})

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

// PATCH /api/v1/responders/availability
// Responder toggles themselves online or offline
const setAvailability = async (req, res, next) => {
  try {
    const validation = availabilitySchema.safeParse(req.body)

    if (!validation.success) {
      const message = validation.error.issues[0].message
      return next(new AppError(message, 400))
    }

    const { availability } = validation.data

    // Find the responder's profile and update it
    const profile = await prisma.responderProfile.update({
      where: { userId: req.user.id },
      data: {
        availability,
        lastSeenAt: new Date(),
      },
    })

    res.status(200).json({
      status: 'success',
      data: { profile },
    })
  } catch (err) {
    next(err)
  }
}

// PATCH /api/v1/responders/location
// Responder sends their current GPS position while navigating
const updateLocation = async (req, res, next) => {
  try {
    const validation = locationSchema.safeParse(req.body)

    if (!validation.success) {
      const message = validation.error.issues[0].message
      return next(new AppError(message, 400))
    }

    const { lat, lng } = validation.data

    await prisma.responderProfile.update({
      where: { userId: req.user.id },
      data: {
        currentLat: lat,
        currentLng: lng,
        lastSeenAt: new Date(),
      },
    })

    // We also want to emit the location via Socket.IO so the
    // citizen can see the responder moving on a map in real time.
    // That Socket.IO call will be wired here in the next step.
    console.log(`[LOCATION] Responder ${req.user.id} → lat:${lat} lng:${lng}`)

    res.status(200).json({
      status: 'success',
      data: { message: 'Location updated' },
    })
  } catch (err) {
    next(err)
  }
}

// GET /api/v1/responders/profile
// Returns the responder's own profile
const getProfile = async (req, res, next) => {
  try {
    const profile = await prisma.responderProfile.findUnique({
      where: { userId: req.user.id },
    })

    if (!profile) {
      return next(new AppError('Responder profile not found', 404))
    }

    res.status(200).json({
      status: 'success',
      data: { profile },
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { setAvailability, updateLocation, getProfile }