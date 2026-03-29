const express = require('express')
const router = express.Router()
const notificationController = require('../controllers/notification.controller')
const { protect } = require('../middleware/auth.middleware')

router.use(protect)

// Important: /read-all must come before /:id
// otherwise Express treats "read-all" as an ID param
router.patch('/read-all', notificationController.markAllAsRead)
router.get('/', notificationController.getNotifications)
router.patch('/:id/read', notificationController.markAsRead)

module.exports = router