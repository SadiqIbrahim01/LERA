const prisma = require('../lib/prisma')
const AppError = require('../utils/AppError')

// GET /api/v1/notifications
// Returns all notifications for the logged-in user, newest first
const getNotifications = async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { sentAt: 'desc' },
    })

    res.status(200).json({
      status: 'success',
      results: notifications.length,
      data: { notifications },
    })
  } catch (err) {
    next(err)
  }
}

// PATCH /api/v1/notifications/:id/read
// Marks one notification as read
const markAsRead = async (req, res, next) => {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id },
    })

    if (!notification) {
      return next(new AppError('Notification not found', 404))
    }

    // Users can only mark their own notifications as read
    if (notification.userId !== req.user.id) {
      return next(new AppError('You cannot modify this notification', 403))
    }

    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    })

    res.status(200).json({
      status: 'success',
      data: { notification: updated },
    })
  } catch (err) {
    next(err)
  }
}

// PATCH /api/v1/notifications/read-all
// Marks ALL notifications for this user as read
const markAllAsRead = async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    })

    res.status(200).json({
      status: 'success',
      data: { message: 'All notifications marked as read' },
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { getNotifications, markAsRead, markAllAsRead }