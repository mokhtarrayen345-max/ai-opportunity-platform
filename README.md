# AI Opportunity Platform — V1 Foundation

Production-oriented V1 foundation for discovering opportunities, analyzing an item with an AI-ready provider abstraction, and submitting a technical/business problem to a structured solver.

## Stack
- Next.js + React + TypeScript
- Server-side API routes for backend boundaries
- Zod for request validation
- Vitest for service and validation tests
- Plain CSS for a dependency-light responsive UI

## V1 scope
- Discover / Feed: realistic placeholder opportunities only.
- AI Analysis: mock provider behind an AnalysisProvider interface.
- Problem Solver: mock provider behind a SolverProvider interface.
- No external data collection, Telegram, X/Twitter, mobile app, payments, marketplace, or multi-agent orchestration.

## Architecture
- app/: pages and API boundaries
- components/: client UI
- services/ai.ts: provider contracts and current mock implementations
- lib/: V1 domain data
- tests/: backend/service and validation tests

The UI is mobile-first and responsive. AI integrations can be added by implementing the existing provider interfaces rather than changing the UI workflow.

## Setup
1. Install Node.js 20+.
2. Copy .env.example to .env.local when local configuration is needed.
3. Run npm install.
4. Run npm run dev.

## Quality checks
- npm test
- npm run typecheck
- npm run build

GitHub Actions runs these checks on pushes and pull requests.

## Security notes
Secrets are not stored in source code. API inputs are validated and bounded. API responses expose generic client-safe errors while server errors are logged. The V1 mock providers make no external network calls.

## Limitations
The feed is placeholder data, there is no persistence or authentication, and AI responses are deterministic mock responses. These are deliberate V1 boundaries.

## Recommended next step
Review V1 behavior first. Then add persistence for opportunities, analyses, and solver sessions, followed by authentication/authorization and a real AI provider behind the existing interfaces.
