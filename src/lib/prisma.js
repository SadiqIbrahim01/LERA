const { PrismaClient } = require('@prisma/client')

// We create one single instance and reuse it everywhere.
// Creating a new PrismaClient on every request would open too many
// database connections and crash your server.
const prisma = new PrismaClient()

module.exports = prisma