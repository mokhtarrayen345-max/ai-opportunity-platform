# AI Opportunity Platform — V1 + Persistence & Authentication

## Stack
Next.js + React + TypeScript, PostgreSQL, Prisma, custom server-side email/password sessions, Zod, Vitest.

## Local setup
1. Install Node.js 22+ and PostgreSQL 16+.
2. Create a local PostgreSQL database named `ai_opportunity_platform`.
3. Copy `.env.example` to `.env.local`.
4. Set `DATABASE_URL` to your local PostgreSQL connection string.
5. Optionally configure `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL`.
6. Run `npm install`.
7. Run `npm run db:generate`.
8. Run `npm run db:migrate -- --name init`.
9. Run `npm test`, `npm run typecheck`, `npm run build`.
10. Run `npm run dev`.

## Database
PostgreSQL is the persistent store and Prisma provides typed queries and migrations. The schema contains User, Session, AnalysisRecord and SolverRecord. Every user-owned record has a foreign key to User and history queries are scoped by the authenticated user id.

## Authentication
Passwords are never stored plaintext: Node scrypt uses a random per-password salt. Sessions use random opaque tokens; only SHA-256 token hashes are persisted. The browser receives the token only in an httpOnly, sameSite=lax cookie. Protected server routes/pages resolve the current user from that session.

The auth service is deliberately isolated so future OAuth/social login can be added without changing the AI history models.

## Persistence behavior
Public users can keep using Analyze and Problem Solver. Authenticated users automatically get successful results saved to their own history. Dashboard/history requires authentication.

## Security
- No hardcoded secrets.
- Database and AI credentials are server-only environment variables.
- No plaintext passwords.
- Session tokens are hashed in the database.
- Dashboard and history require server-side authentication.
- User-owned queries always use the authenticated user id.
- Inputs are validated with Zod.
- Existing mock/OpenAI provider and fallback behavior remain intact.

## Quality checks
`npm test`
`npm run typecheck`
`npm run build`

No deployment is required.

## Opportunity Engine V1
The Opportunity Engine turns a user-provided problem, idea, or opportunity statement into a structured assessment. V1 does not perform external market research and does not present unverified market claims as facts.

The output separates user-provided facts, AI-generated hypotheses, assumptions, and unknowns. A deterministic scoring layer calculates seven transparent dimensions: problem severity (18%), demand potential (17%), market potential (16%), competition position (10%), technical feasibility (14%), monetization potential (15%), and execution-risk score (10%). All dimensions and the final score are normalized to 0–100. Confidence is calculated separately from evidence and unknowns; it is not a profitability prediction.

Use /opportunities for the UI or POST /api/opportunities with an input string and optional save flag. Saving requires an authenticated session and always uses the server-side session user id. GET /api/opportunities/history returns only the current user’s saved assessments.

The existing mock/OpenAI provider selection and fallback remain the single AI provider architecture. Opportunity analysis is an additional capability on that abstraction, with Zod validation of structured output.


## Secure GitHub Authorization V1

GitHub repository authorization uses a GitHub App installation flow with server-side verification. Users never paste a personal access token, password, or private key into the platform. The server creates a short-lived cryptographically random state bound to the authenticated platform user, receives the GitHub OAuth callback, verifies the user's GitHub App installations, and only then allows selection from repositories returned by GitHub.

Configure a GitHub App with **Request user authorization (OAuth) during installation**, a callback URL matching `GITHUB_APP_CALLBACK_URL`, and only the minimum repository permissions required by the next execution stage (Metadata read; Contents write is required only for future repair-branch writes). Set `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_APP_SLUG` only as server-side environment variables. Never put these values in Prisma, browser code, AI prompts, logs, or audit events.

The existing `GITHUB_ALLOWED_REPOSITORIES` allowlist remains an additional boundary. Revocation changes the owned `AuthorizedRepository` to `REVOKED` and blocks future execution while preserving historical records.

Real GitHub repair writes remain **disabled by default**: `GITHUB_REPAIR_EXECUTION_ENABLED=false`. This feature does not enable writes, automatic merge, or deployment. The existing QA + Security Review gate remains mandatory.
