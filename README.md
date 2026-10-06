# AI Opportunity Platform — V1 Foundation

V1 supports a real server-side AI provider without changing the existing UI contracts.

## AI provider architecture
The existing `AnalysisProvider` and `SolverProvider` interfaces are preserved.
- `AI_PROVIDER=mock`: deterministic local provider; default and safe offline mode.
- `AI_PROVIDER=openai`: OpenAI Responses API adapter with automatic mock fallback.

The API key is read only from the server-side `OPENAI_API_KEY` environment variable. It is never prefixed with `NEXT_PUBLIC_` and is not exposed to client components.

## Setup
1. Install Node.js 20+.
2. Copy `.env.example` to `.env.local`.
3. Keep `AI_PROVIDER=mock` for local/offline behavior, or set `AI_PROVIDER=openai`.
4. Set `OPENAI_API_KEY` in `.env.local` when using OpenAI.
5. Optionally set `OPENAI_MODEL`; V1 defaults to `gpt-6-luna`.
6. Run `npm install`, then `npm run dev`.

Never commit `.env.local` or API keys.

## Failure behavior
If OpenAI is selected without a key, mock providers are used.
If an OpenAI request fails, times out, or returns invalid output, the request falls back to the mock provider. Upstream error details are not returned to the browser.

## Security
- No secrets are hardcoded.
- AI provider code is marked server-only.
- API routes validate inputs with Zod.
- No AI secret is included in browser environment variables.
- Provider failures do not expose upstream error details.

## Quality checks
`npm test`
`npm run typecheck`
`npm run build`

## Scope
Still excluded: authentication, database, scraping, Telegram, X/Twitter, mobile app, payments, marketplace, and multi-agent orchestration.
