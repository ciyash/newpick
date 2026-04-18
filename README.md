# Pick2Win Backend

Pick2Win is a Node.js/Express backend for a fantasy sports platform. It provides APIs for authentication, user profiles, wallets, subscriptions, contests, teams, match data, KYC, bank verification, withdrawals, payments, notifications, and employee/admin operations.

## Tech Stack

- Node.js with ES modules
- Express 5
- MySQL/TiDB via `mysql2`
- Upstash Redis
- Stripe payments and webhooks
- Sumsub KYC
- Firebase/Expo push notifications
- SportMonks and EntitySport integrations
- Nodemailer for transactional email

## Requirements

- Node.js 18 or newer
- npm
- MySQL/TiDB database access
- Redis credentials, if using Redis-backed features
- Stripe account credentials, if using payment flows
- Sumsub credentials, if using KYC flows

The database connection expects an SSL CA certificate at:

```text
src/config/tidb-ca.pem
```

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` file in the project root. The application validates several required values on startup and additional modules require integration-specific keys.

```env
NODE_ENV=development
PORT=5000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:4200

JWT_SECRET=replace_with_a_strong_secret
JWT_EXPIRES_IN=7d
BACKEND_URL=http://localhost:5000

DB_HOST=your_database_host
DB_PORT=4000
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=your_database_name

UPSTASH_REDIS_REST_URL=your_upstash_redis_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token

STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

SUMSUB_BASE_URL=https://api.sumsub.com
SUMSUB_APP_TOKEN=your_sumsub_app_token
SUMSUB_SECRET_KEY=your_sumsub_secret_key
SUMSUB_LEVEL=your_sumsub_level_name

SPORTMONKS_TOKEN=your_sportmonks_token
ENTITYSPORT_TOKEN=your_entitysport_token
ENTITY_TEAM_IMAGE_URL=your_entity_team_image_base_url
ENTITY_PLAYER_IMAGE_URL=your_entity_player_image_base_url

MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USER=your_mail_user
MAIL_PASS=your_mail_password
MAIL_FROM=no-reply@example.com

EMAIL_USER=your_email_user
EMAIL_PASS=your_email_password

FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Required at startup:

- `JWT_SECRET`
- `DB_HOST`
- `DB_USER`
- `DB_PASSWORD`
- `STRIPE_PUBLISHABLE_KEY`

## Running the App

Start the server:

```bash
npm start
```

Start in development mode with Nodemon:

```bash
npm run dev
```

By default, the API runs on:

```text
http://localhost:5000
```

In non-production environments, a simple health check is available:

```text
GET /test
```

## API Overview

All main routes are mounted under `/api`.

### Auth

Base path: `/api/auth`

- `POST /signup`
- `POST /verify-signup`
- `POST /resend-otp`
- `POST /login/send-otp`
- `POST /login`
- `POST /admin/login`
- `PATCH /update-profile`
- `GET /verify-email`
- `POST /request-contact-change`
- `POST /verify-old-contact`
- `POST /verify-new-contact`
- `POST /logout`

### User

Base path: `/api/user`

- `GET /userprofile`
- `POST /create-feedback`
- `GET /get-feedback`
- `POST /pause-account`
- `DELETE /delete-account`
- `POST /save-fcm-token`
- `POST /test-notification`

Nested user modules:

- `/api/user/wallet`
- `/api/user/subscription`
- `/api/user/contest`
- `/api/user/series`
- `/api/user/matches`
- `/api/user/teams`
- `/api/user/payment`
- `/api/user/uct`
- `/api/user/kyc`
- `/api/user/withdraw`
- `/api/user/bank`
- `/api/user/notification`

Stripe webhook endpoint:

```text
POST /api/user/payment/webhook/stripe
```

This route is registered before JSON parsing so Stripe can verify the raw request body.

### Employee/Admin

Base path: `/api/employee`

Includes protected routes for:

- Employee/admin CRUD
- Series management
- Match management
- Team and player management
- Contest and contest category management
- Dashboard metrics
- Deposits and withdrawals
- User filtering
- SportMonks integration tools
- Test utilities
- Match live/result processing

## Project Structure

```text
.
|-- server.js
|-- src
|   |-- app.js
|   |-- config
|   |   |-- db.js
|   |   |-- redis.js
|   |   |-- jwt.js
|   |   `-- strip.js
|   |-- middlewares
|   |-- modules
|   |   |-- admin
|   |   |-- auth
|   |   |-- bank
|   |   |-- contests
|   |   |-- entity-sport
|   |   |-- kyc
|   |   |-- match
|   |   |-- notification
|   |   |-- payment
|   |   |-- scoring
|   |   |-- sportmonks
|   |   |-- teams
|   |   |-- users
|   |   |-- wallet
|   |   `-- withdraw
|   |-- routes
|   `-- utils
|-- package.json
`-- README.md
```

## Notes for Development

- This project uses ES module syntax (`"type": "module"`).
- Most authenticated user routes require a bearer token in the `Authorization` header.
- Admin routes use a separate admin authorization middleware.
- Request validation is handled with Joi-based middleware in relevant modules.
- SportMonks cron jobs are started when the server starts.
- The app applies CORS, Helmet, JSON body limits, and request logging through Morgan.

## Available Scripts

```bash
npm start
```

Runs `node server.js`.

```bash
npm run dev
```

Runs `nodemon server.js`.

## Testing

No automated test script is currently defined in `package.json`.
