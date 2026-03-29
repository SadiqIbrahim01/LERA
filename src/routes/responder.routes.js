const express = require('express')
const router = express.Router()
const responderController = require('../controllers/responder.controller')
const { protect, requireResponder } = require('../middleware/auth.middleware')

// All responder routes require JWT + responder role
router.use(protect, requireResponder)

router.get('/profile', responderController.getProfile)
router.patch('/availability', responderController.setAvailability)
router.patch('/location', responderController.updateLocation)

module.exports = router