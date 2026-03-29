// A custom error class that carries an HTTP status code.
// When something goes wrong (404 Not Found, 400 Bad Request, etc.),
// we throw one of these instead of a plain Error.
// Our global error handler will catch it and send the right response.

class AppError extends Error {
  constructor(message, statusCode) {
    super(message)           // calls the built-in Error constructor
    this.statusCode = statusCode
    this.isOperational = true // marks it as a known, expected error
  }
}

module.exports = AppError