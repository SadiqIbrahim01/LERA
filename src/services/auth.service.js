const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')
const AppError = require('../utils/AppError')

// bcrypt "salts" a password before hashing it.
// A salt is random data added to the password before hashing,
// so even if two users have the same password, their hashes differ.
// The number 12 is the "cost factor" — how many rounds of hashing.
// Higher = more secure but slower. 12 is the industry standard.
const SALT_ROUNDS = 12

// ─────────────────────────────────────────────
// REGISTER
// Creates a new user in the database.
// Returns the new user object and a JWT token.
// ─────────────────────────────────────────────
const register = async (data) => {
  const { fullName, email, phoneNumber, password, role, certificationId, responderType } = data

  // 1. Check if this email is already taken
  const existingUser = await prisma.user.findUnique({
    where: { email },
  })

  if (existingUser) {
    // AppError(message, httpStatusCode)
    // 409 = Conflict — the resource already exists
    throw new AppError('An account with this email already exists', 409)
  }

  // 2. Check if this phone number is already taken
  const existingPhone = await prisma.user.findUnique({
    where: { phoneNumber },
  })

  if (existingPhone) {
    throw new AppError('An account with this phone number already exists', 409)
  }

  // 3. Hash the password
  // bcrypt.hash() is async — it takes time to compute deliberately.
  // We NEVER store plain-text passwords. Ever.
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

  // 4. Save the user to the database
  // We use a Prisma transaction for responders — this means BOTH the user
  // AND the responder profile are created together. If one fails, neither
  // is saved. This prevents half-created accounts.
  let newUser

  if (role === 'responder') {
    // Responders need a profile row in the responder_profiles table too
    if (!certificationId || !responderType) {
      throw new AppError('Responders must provide a certification ID and responder type', 400)
    }

    // prisma.$transaction runs multiple DB operations as one atomic unit
    newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName,
          email,
          phoneNumber,
          passwordHash,
          role,
        },
      })

      await tx.responderProfile.create({
        data: {
          userId: user.id,
          certificationId,
          type: responderType,   // police | ambulance | fire
          availability: 'offline',
        },
      })

      return user
    })
  } else {
    // Citizens just need a user row
    newUser = await prisma.user.create({
      data: {
        fullName,
        email,
        phoneNumber,
        passwordHash,
        role,
      },
    })
  }

  // 5. Generate a JWT token for this user
  const token = generateToken(newUser.id)

  // 6. Return the user (without the password hash) and the token
  // We never send the passwordHash back in any response
  const { passwordHash: _, ...userWithoutPassword } = newUser

  return { token, user: userWithoutPassword }
}

// ─────────────────────────────────────────────
// LOGIN
// Checks credentials, returns token if valid.
// ─────────────────────────────────────────────
const login = async (email, password) => {
  // 1. Find the user by email
  // We explicitly select passwordHash here because by default
  // we will exclude it from all other queries
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      responderProfile: true, // also fetch their profile if they are a responder
    },
  })

  // 2. If no user found, don't say "email not found" — that leaks information.
  // Always say the same vague message for both wrong email and wrong password.
  if (!user) {
    throw new AppError('Invalid email or password', 401)
    // 401 = Unauthorized
  }

  // 3. Compare the password they sent with the stored hash
  // bcrypt.compare() hashes the plain password and checks if it matches
  const isPasswordCorrect = await bcrypt.compare(password, user.passwordHash)

  if (!isPasswordCorrect) {
    throw new AppError('Invalid email or password', 401)
  }

  // 4. Generate token
  const token = generateToken(user.id)

  // 5. Return user without passwordHash
  const { passwordHash: _, ...userWithoutPassword } = user

  return { token, user: userWithoutPassword }
}

// ─────────────────────────────────────────────
// GET ME
// Returns the currently logged-in user's profile.
// ─────────────────────────────────────────────
const getMe = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      responderProfile: true,
    },
  })

  if (!user) {
    throw new AppError('User not found', 404)
  }

  const { passwordHash: _, ...userWithoutPassword } = user
  return userWithoutPassword
}

// ─────────────────────────────────────────────
// UPDATE ME
// Updates the current user's profile fields.
// ─────────────────────────────────────────────
const updateMe = async (userId, data) => {
  // Only allow updating these specific fields.
  // We never let users update their own role or passwordHash this way.
  const { fullName, phoneNumber } = data

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(fullName && { fullName }),
      ...(phoneNumber && { phoneNumber }),
    },
  })

  const { passwordHash: _, ...userWithoutPassword } = updatedUser
  return userWithoutPassword
}

// ─────────────────────────────────────────────
// UPDATE FCM TOKEN
// Saves the device's push notification token.
// Called by the app after the user logs in and
// the device gets a fresh FCM token from Firebase.
// ─────────────────────────────────────────────
const updateFcmToken = async (userId, fcmToken) => {
  await prisma.user.update({
    where: { id: userId },
    data: { fcmToken },
  })

  return { message: 'FCM token updated' }
}

// ─────────────────────────────────────────────
// HELPERS
// These are used internally and not exported
// ─────────────────────────────────────────────

// Generates a JWT token.
// A JWT has 3 parts: header.payload.signature
// The payload contains the userId.
// The signature is created using your JWT_SECRET — only your server
// can create or verify it. If anyone tampers with the token, the
// signature won't match and it gets rejected.
const generateToken = (userId) => {
  return jwt.sign(
    { userId },                          // payload — what's inside the token
    process.env.JWT_SECRET,              // secret — used to sign it
    { expiresIn: process.env.JWT_EXPIRES_IN }  // when it expires
  )
}

module.exports = {
  register,
  login,
  getMe,
  updateMe,
  updateFcmToken,
}