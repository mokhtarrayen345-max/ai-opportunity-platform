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
