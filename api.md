# Pick2Win API Reference

This document lists the API routes exposed by the Pick2Win backend.

Base URL for local development:

```text
http://localhost:5000
```

Main API prefix:

```text
/api
```

## Authentication

Most user routes require a bearer token:

```http
Authorization: Bearer <token>
```

Admin and employee routes use the admin authorization middleware and also expect an authenticated admin token.

## Common Responses

Most endpoints return JSON in this general shape:

```json
{
  "success": true,
  "message": "Operation completed",
  "data": {}
}
```

Error responses generally use:

```json
{
  "success": false,
  "message": "Error message"
}
```

## Public and Utility Routes

### Health Check

Available only when `NODE_ENV` is not `production`.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/test` | Confirms the server is running. |

### Stripe Webhook

This route is registered before JSON parsing so Stripe can verify the raw request body.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/user/payment/webhook/stripe` | Stripe signature | Handles Stripe payment webhook events. |

## Auth Routes

Base path:

```text
/api/auth
```

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/signup` | Public | Creates a new user and sends signup OTP. |
| POST | `/verify-signup` | Public | Verifies signup OTP. |
| POST | `/resend-otp` | Public | Resends signup OTP. |
| POST | `/login/send-otp` | Public | Sends OTP for login. |
| POST | `/login` | Public | Logs a user in and returns a token. |
| POST | `/admin/login` | Public | Logs an admin or employee in. |
| PATCH | `/update-profile` | User | Updates the authenticated user's profile. |
| GET | `/verify-email` | Public | Verifies an email link. |
| POST | `/request-contact-change` | User | Starts a contact change flow. |
| POST | `/verify-old-contact` | User | Verifies the current contact during contact change. |
| POST | `/verify-new-contact` | User | Verifies the new contact during contact change. |
| POST | `/logout` | User | Logs out the authenticated user. |

## User Routes

Base path:

```text
/api/user
```

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/userprofile` | User | Gets the authenticated user's profile. |
| POST | `/reduce-limit` | User, active account | Reduces the user's monthly limit. |
| POST | `/create-feedback` | User, active account | Creates user feedback. |
| GET | `/get-feedback` | User | Gets feedback submitted by the user. |
| POST | `/pause-account` | User, active account | Pauses the user's account. |
| DELETE | `/delete-account` | User, active account | Deletes the user's account. |
| POST | `/save-fcm-token` | User | Saves a Firebase Cloud Messaging token. |
| POST | `/test-notification` | User | Sends a test notification. |

## Wallet Routes

Base path:

```text
/api/user/wallet
```

The parent router applies user authentication and active account checks to wallet routes. Some route handlers also apply their own authentication middleware.

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/add-money` | Adds money to the user's wallet. |
| GET | `/my-wallet` | Gets the user's wallet balance/details. |
| GET | `/my-transactions` | Gets the user's wallet transactions. |
| GET | `/my-transactions/:year` | Gets wallet transactions for a specific year. |
| DELETE | `/:userid` | Deletes transactions for a user. |
| GET | `/analytics/:type` | Gets wallet analytics by type. |
| GET | `/analytics/statement` | Downloads an analytics statement. |

## Subscription Routes

Base path:

```text
/api/user/subscription
```

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/buy` | Buys a subscription. |
| GET | `/status` | Gets the authenticated user's subscription status. |

## Contest Routes

Base path:

```text
/api/user/contest
```

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/join` | Joins a contest. |
| GET | `/my-contests/:match_id` | Gets the user's contests for a match. |
| GET | `/leaderboard/:contest_id` | Gets contest leaderboard data. |
| POST | `/leaderboard/compare/:contest_id` | Compares teams on a contest leaderboard. |
| GET | `/my-rank/:contest_id/:teamId` | Gets the user's rank for a team in a contest. |
| GET | `/breakdown/:contestId/:userTeamId` | Gets score breakdown details. |
| GET | `/` | Gets all contests. |
| GET | `/:match_id` | Gets contests for a match. |

## Series Routes

Base path:

```text
/api/user/series
```

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/` | Gets all active series. |
| GET | `/:seriesid` | Gets a series by ID. |

## Match Routes

Base path:

```text
/api/user/matches
```

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/past` | Gets past matches. |
| GET | `/all` | Gets all matches. |
| GET | `/:id` | Gets full match details by ID. |
| GET | `/matches/:type` | Gets matches by type. |

Note: `/:id` is declared before `/matches/:type`, so requests to `/matches/:type` may be captured by the `/:id` route unless route order is adjusted.

## Team Routes

Base path:

```text
/api/user/teams
```

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/get-teams` | Gets all teams. |
| GET | `/get-teams/:id` | Gets a team by ID. |
| GET | `/team-players` | Gets all players. |
| GET | `/team-players/team/:id` | Gets players by team ID. |
| GET | `/team-players/:id` | Gets a player by ID. |
| POST | `/create` | Creates a user team. |
| POST | `/generateTeams` | Generates teams automatically. |
| PATCH | `/update-team/:teamId` | Updates a user team. |
| GET | `/user-my-teams/:matchId` | Gets the user's teams for a match. |
| GET | `/players/:teamId` | Gets players for a user team. |
| GET | `/my-teams-with-players` | Gets user teams with player details. |
| GET | `/my-teams/xi-status/:matchId/:homeTeamId` | Gets playing XI status for user teams. |
| GET | `/playing-xi/:match_id` | Gets playing XI data for a match. |
| GET | `/team-comparison/:team_id` | Gets team comparison data. |

## Payment Routes

Base path:

```text
/api/user/payment
```

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/deposit` | Creates a Stripe deposit payment. |
| GET | `/test-stripe` | Tests Stripe configuration. |
| GET | `/stripe/config` | Returns Stripe publishable configuration. |

## UCT Routes

Base path:

```text
/api/user/uct
```

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/generate` | Generates UCT teams. |
| GET | `/my-teams` | Gets the user's generated UCT teams. |

## KYC Routes

Base path:

```text
/api/user/kyc
```

The parent user router does not apply authentication to the whole KYC router. Individual endpoints may apply their own auth checks.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/token` | Public | Creates or returns a Sumsub KYC access token. |
| POST | `/webhook` | Sumsub webhook | Handles Sumsub webhook events. |
| GET | `/kyc-status/:mobile` | Public | Gets KYC status by mobile number. |
| POST | `/kyc-completed` | Public | Marks or processes KYC completion. |
| GET | `/address-kyc` | User | Starts address verification. |

## Withdraw Routes

Base path:

```text
/api/user/withdraw
```

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/request` | User, active account | Requests a withdrawal. |
| GET | `/history` | User | Gets withdrawal request history. |
| POST | `/approve` | Admin | Approves a withdrawal. |
| POST | `/reject` | Admin | Rejects a withdrawal. |

## Bank Routes

Base path:

```text
/api/user/bank
```

The parent router applies user authentication and active account checks.

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/verify-bank` | Starts bank verification. |
| POST | `/stripe-webhook` | Handles Stripe bank verification webhook events. |

## Notification Routes

Base path:

```text
/api/user/notification
```

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/push-token` | Saves a push notification token. |
| GET | `/test` | Sends or triggers a notification test. |

## Employee/Admin Routes

Base path:

```text
/api/employee
```

All routes in this group are protected by the admin rate limiter. Most routes require admin authentication. Employee CRUD routes require the `super_admin` role.

### Employee Management

| Method | Endpoint | Role | Description |
| --- | --- | --- | --- |
| POST | `/createemployee` | super_admin | Creates an employee/admin. |
| GET | `/getemployee` | super_admin | Lists employees/admins. |
| GET | `/getemployeebyid/:id` | super_admin | Gets an employee/admin by ID. |
| PUT | `/updateemployee/:id` | super_admin | Updates an employee/admin. |

### Series Management

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/createseries` | Creates a series. |
| GET | `/getseries` | Lists series. |
| GET | `/getseriesbyid/:id` | Gets a series by ID. |
| PUT | `/updateseries/:id` | Updates a series. |

### Match Management

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/creatematches` | Creates a match. |
| GET | `/getmatches` | Lists matches. |
| GET | `/getmatchesbyid/:id` | Gets a match by ID. |
| GET | `/getmatchesbyseriesid/:id` | Gets matches by series ID. |
| PUT | `/updatematches/:id` | Updates a match. |
| GET | `/match-live/:match_id` | Marks or sets a match as live. |
| GET | `/match-result/:match_id` | Processes match results, ranks, winnings, and wallet credits. |

### Team and Player Management

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/createteams` | Creates a team. |
| GET | `/getteams` | Lists teams. |
| GET | `/getteamsbyid/:id` | Gets a team by ID. |
| PUT | `/updateteams/:id` | Updates a team. |
| POST | `/createplayers` | Creates a player. |
| GET | `/getplayers` | Lists players. |
| GET | `/getplayersbyid/:id` | Gets a player by ID. |
| GET | `/getplayersbyteam/:id` | Gets players by team ID. |
| PUT | `/updateplayers/:id` | Updates a player. |

### Contest Management

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/createcontest` | Creates a contest. |
| GET | `/getcontests` | Lists contests. |
| GET | `/getcontestbyid/:id` | Gets a contest by ID. |
| PUT | `/updatecontest/:id` | Updates a contest. |
| GET | `/getcontestbymatch/:matchId` | Gets contests by match ID. |
| GET | `/getcontestbyseries/:seriesId` | Gets contests by series ID. |
| GET | `/getcontestbyteam/:teamId` | Gets contests by team ID. |
| POST | `/createcontestcategory` | Creates a contest category. |
| GET | `/getcontestcategory` | Lists contest categories. |

### Dashboard

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/getdashboard` | Gets admin dashboard data. |

### Deposits

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/getalldeposits` | Lists all deposits. |
| POST | `/fetchdeposits` | Fetches or filters deposits. |
| GET | `/fetchdepositssummary` | Gets deposit summary data. |

### Withdrawals

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/getallwithdraws` | Lists all withdrawals. |
| POST | `/fetchwithdraws` | Fetches or filters withdrawals. |
| GET | `/fetchwithdraws summary` | Gets withdrawal summary data. |
| POST | `/withdraw/:withdrawId/approve` | Approves a withdrawal by ID. |
| POST | `/withdraw/:withdrawId/reject` | Rejects a withdrawal by ID. |
| GET | `/withdraw/list` | Lists withdrawal requests. |
| GET | `/withdraw/:withdrawId` | Gets withdrawal details. |

Note: `/fetchwithdraws summary` contains a space in the route path as currently defined in code.

### Users

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/getallusers` | Lists all users. |
| POST | `/fetchusers` | Fetches or filters users. |
| POST | `/fetchusersbykyc` | Fetches users by KYC status. |
| POST | `/fetchusersbyaccount` | Fetches users by account status. |

## SportMonks Admin Routes

Base path:

```text
/api/employee/sportmonks
```

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/series/available` | Gets available SportMonks series. |
| POST | `/series/toggle` | Toggles a series active/inactive. |
| GET | `/series/active` | Gets active SportMonks series. |
| GET | `/matches/available/:seriesid` | Gets available matches for a series. |
| POST | `/matches/toggle` | Toggles a match active/inactive. |
| GET | `/matches/:seriesid` | Gets matches for a series. |
| GET | `/sync-playingxi/:match_id` | Syncs playing XI for a match. |
| GET | `/sync-points/:match_id` | Syncs player points for a match. |
| POST | `/fixtures` | Gets fixtures by date range. |

## Admin Test Routes

Base path:

```text
/api/employee/test
```

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/matches/playing-xi/manual` | Manually updates playing XI data. |
| POST | `/matches/points/manual` | Manually updates player points. |

## Route Notes

- `/api/user/*` routes commonly require an active account through `checkAccountActive`.
- Some child routers also apply `authenticate`, even when the parent router already applies it.
- The EntitySport routes exist in the codebase but are not currently mounted in the main router.
- The scoring routes exist in the codebase but are not currently mounted in the main router.
- Request body schemas are implemented in service, controller, and validation files. This document focuses on mounted endpoint paths and high-level purpose.
