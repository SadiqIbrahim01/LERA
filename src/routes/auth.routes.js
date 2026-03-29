const express = require('express')
const router = express.Router()
const authController = require('../controllers/auth.controller')
const { protect } = require('../middleware/auth.middleware')

// Public routes — no token needed
// POST /api/v1/auth/register
router.post('/register', authController.register)

// POST /api/v1/auth/login
router.post('/login', authController.login)

// Protected routes — protect middleware runs first, then the controller
// If protect() calls next(error), the controller never runs
// GET /api/v1/auth/me
router.get('/me', protect, authController.getMe)

// PATCH /api/v1/auth/me
router.patch('/me', protect, authController.updateMe)

// PATCH /api/v1/auth/me/fcm-token
router.patch('/me/fcm-token', protect, authController.updateFcmToken)

module.exports = router