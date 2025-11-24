# PIMS Backend Setup Guide

This is a NestJS backend application with Prisma ORM, Swagger documentation, and PostgreSQL database.

## Prerequisites

- Node.js (version 18 or higher)
- npm or yarn
- PostgreSQL (version 12 or higher)

## Installation

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables:
   - Copy `env.example` to `.env`
   - Update the `DATABASE_URL` with your PostgreSQL credentials:

   ```
   DATABASE_URL="postgresql://username:password@localhost:5432/pims_db?schema=public"
   ```

3. Set up the database:

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# (Optional) Seed the database
npx prisma db seed
```

## Running the Application

```bash
# Development mode
npm run start:dev

# Production mode
npm run start:prod
```

The application will be available at:

- API: http://localhost:3000
- Swagger Documentation: http://localhost:3000/api

## Database Management

```bash
# View database in Prisma Studio
npx prisma studio

# Reset database
npx prisma migrate reset

# Deploy migrations to production
npx prisma migrate deploy
```

## Project Structure

```
src/
├── prisma/           # Prisma service and module
├── users/            # Users module (example)
│   ├── dto/          # Data Transfer Objects
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── users.module.ts
├── app.module.ts     # Main application module
└── main.ts          # Application entry point

prisma/
└── schema.prisma    # Database schema
```

## API Endpoints

### Users

- `GET /users` - Get all users
- `GET /users/:id` - Get user by ID
- `POST /users` - Create new user
- `PATCH /users/:id` - Update user
- `DELETE /users/:id` - Delete user

## Development

```bash
# Run tests
npm run test

# Run e2e tests
npm run test:e2e

# Lint code
npm run lint

# Format code
npm run format
```
