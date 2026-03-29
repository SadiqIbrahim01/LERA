const admin = require('firebase-admin')
const path = require('path')

// ─────────────────────────────────────────────────────────────────
// Load the service account JSON file directly.
//
// This avoids the Windows .env private key formatting problem
// entirely. The JSON file preserves the key exactly as Firebase
// needs it — no escaping, no newline conversion issues.
//
// path.join(__dirname, ...) builds the correct file path
// regardless of which operating system you are on.
// __dirname = the directory of the current file (src/services/)
// We go up two levels (../../) to reach the project root,
// then into config/firebase-service-account.json
// ─────────────────────────────────────────────────────────────────

let serviceAccount

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  console.log('[FCM] Loading Firebase credentials from environment variable')
} else {
  serviceAccount = require(
    path.join(__dirname, '../../config/firebase-service-account.json')
  )
  console.log('[FCM] Loading Firebase credentials from local file')
}
// ─────────────────────────────────────────────────────────────────
// sendPush
// Sends a push notification to a single device.
// ─────────────────────────────────────────────────────────────────
const sendPush = async (fcmToken, title, body, data = {}) => {
  if (!fcmToken) {
    console.log('[FCM] No FCM token — skipping push notification')
    return
  }

  try {
    const message = {
      token: fcmToken,
      notification: {
        title,
        body,
      },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'emergency_alerts',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
        headers: {
          'apns-priority': '10',
        },
      },
    }

    const response = await admin.messaging().send(message)
    console.log(`[FCM] Push sent successfully: ${response}`)
    return response
  } catch (err) {
    // Failed push never crashes the server — it is best-effort
    console.error(
      `[FCM] Push failed for token ${fcmToken?.slice(0, 20)}...:`,
      err.message
    )
  }
}

// ─────────────────────────────────────────────────────────────────
// sendPushToMany
// Sends the same notification to multiple devices.
// ─────────────────────────────────────────────────────────────────
const sendPushToMany = async (fcmTokens, title, body, data = {}) => {
  const validTokens = fcmTokens.filter(Boolean)

  if (validTokens.length === 0) {
    console.log('[FCM] No valid FCM tokens — skipping bulk push')
    return
  }

  const results = await Promise.allSettled(
    validTokens.map((token) => sendPush(token, title, body, data))
  )

  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length
  console.log(`[FCM] Bulk push: ${succeeded} sent, ${failed} failed`)
}

module.exports = { sendPush, sendPushToMany }