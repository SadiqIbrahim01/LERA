const jwt = require('jsonwebtoken')
const AppError = require('../utils/AppError')
const prisma = require('../lib/prisma')

const protect = async (req, res, next) => {
  // 1. Check the Authorization header exists and starts with "Bearer"
  // The frontend sends: Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('You are not logged in. Please log in to continue.', 401))
  }

  // 2. Extract the token (everything after "Bearer ")
  const token = authHeader.split(' ')[1]

  // 3. Verify the token using our secret
  // If the token is expired or tampered with, jwt.verify() throws an error
  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET)
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401))
    }
    return next(new AppError('Invalid token. Please log in again.', 401))
  }

  // 4. Check the user still exists in the database
  // (in case the account was deleted after the token was issued)
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
  })

  if (!user) {
    return next(new AppError('The user belonging to this token no longer exists.', 401))
  }

  // 5. Attach the user to the request object
  // Every route handler after this middleware can now access req.user
  req.user = user

  // 6. Call next() to pass control to the route handler
  next()
}

// A middleware that checks the user is a responder
// Used to protect routes that only responders should access
const requireResponder = (req, res, next) => {
  if (req.user.role !== 'responder') {
    return next(new AppError('This action is only available to responders', 403))
    // 403 = Forbidden — you are authenticated but not allowed
  }
  next()
}

// A middleware that checks the user is a citizen
const requireCitizen = (req, res, next) => {
  if (req.user.role !== 'citizen') {
    return next(new AppError('This action is only available to citizens', 403))
  }
  next()
}

module.exports = { protect, requireResponder, requireCitizen }