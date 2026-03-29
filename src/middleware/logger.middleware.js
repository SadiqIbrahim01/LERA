// A simple request logger.
// Every request that hits your server gets one clean log line.
// Format: [METHOD] /path/here — timestamp
//
// This is invaluable when debugging — you can see exactly
// what the frontend is sending and in what order.

const logger = (req, res, next) => {
  const timestamp = new Date().toISOString()
  console.log(`[${req.method}] ${req.path} — ${timestamp}`)
  next()
}

module.exports = logger