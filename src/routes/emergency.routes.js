const express = require('express')
const router = express.Router()
const rateLimit = require('express-rate-limit')
const emergencyController = require('../controllers/emergency.controller')
const { protect, requireCitizen, requireResponder } = require('../middleware/auth.middleware')

// Extra rate limit specifically on creating emergencies
// Applied only to POST / — not to accept, resolve, etc.
const emergencyCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    status: 'error',
    message: 'Too many emergency requests. Please wait before trying again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// All emergency routes require a valid JWT
router.use(protect)

// These two must be defined before /:id to avoid
// Express treating "active" or "history" as an ID value
router.get('/active', emergencyController.getActiveEmergency)
router.get('/history', emergencyController.getHistory)

// emergencyCreateLimiter runs before requireCitizen and the controller
router.post('/', emergencyCreateLimiter, requireCitizen, emergencyController.createEmergency)

router.get('/:id', emergencyController.getEmergencyById)
router.patch('/:id/accept', requireResponder, emergencyController.acceptEmergency)
router.patch('/:id/decline', requireResponder, emergencyController.declineEmergency)
router.patch('/:id/resolve', requireResponder, emergencyController.resolveEmergency)
router.patch('/:id/cancel', requireCitizen, emergencyController.cancelEmergency)

module.exports = router