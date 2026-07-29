# Let's Go Green! Repository Guidance

## Product and language

Let's Go Green! is a calm, safety-aware wellness, meal-planning, and habit-tracking application. It is not a medical product and must not diagnose, guarantee outcomes, shame a user, or escalate restriction automatically.

Write all source code, filenames, database identifiers, migrations, seed content, UI text, error messages, comments, documentation, test names, and configuration in English.

## Architecture

- Keep one full-stack TypeScript repository.
- Use Next.js App Router for pages, layouts, Route Handlers, and server-only operations.
- Prefer Server Components. Add Client Components only for browser interaction.
- Use local Supabase PostgreSQL and Auth in development; use `@supabase/ssr` for cookie-aware clients.
- Treat `supabase/migrations/*.sql` as the database source of truth.
- Keep generated database types at `src/types/database.ts`.
- Keep OpenAI calls on the server behind the provider abstraction.
- Keep deterministic calculations in application code, never in model output.

## Preserve work and local data

- Inspect `git status` before editing and preserve unrelated or uncommitted work.
- Use version-controlled migrations for schema changes. Never edit a shared or production database manually.
- Seed data must be deterministic and safe to apply repeatedly.
- Never run `npm run db:reset` automatically. It deletes user-created local development records and requires explicit confirmation.
- Routine bootstrap, start, test, and migration commands must not reset the database.
- Never point local reset or test utilities at a hosted database.

## Safe development commands

- `npm run bootstrap` installs the lockfile, starts or reuses local Supabase, applies pending migrations and the idempotent seed, generates `.env.local` without replacing existing values, generates database types, installs Chromium, and performs health checks.
- `npm run services:start` starts or reuses local Supabase and waits on a health endpoint.
- `npm run db:sync` applies pending migrations and the idempotent catalog seed without resetting local data.
- `npm run dev:all` starts local services, safely synchronizes the database, and starts Next.js. The VS Code task `Start Let's Go Green!` runs this command.
- `npm run doctor` diagnoses the runtime, Docker, Supabase, database, migration, port, configuration, application, and Playwright state.
- `npm run down` stops local Supabase while preserving its development data.
- `npm run db:reset` is destructive to local data. Run it only when the user explicitly intends to reconstruct a disposable local database.

Use Node.js `22.23.1`, npm `10.9.8`, `npm ci`, and the committed lockfile. Use project-local CLIs through npm or `npx --no-install`; do not require global Supabase or Playwright installations.

## Database and authorization

- Add schema changes only through a new, immutable migration. Do not rewrite a migration that may already have been applied.
- After a migration, regenerate `src/types/database.ts` and run `npm run db:types:check`.
- Enable Row Level Security on every private table.
- Every private policy must restrict reads and mutations to the authenticated owner.
- Public catalog data may be readable by authenticated users; private user-defined foods must remain owner-only.
- Resolve and validate the current user independently in every protected Route Handler or Server Action.
- Use the user-scoped Supabase client for ordinary requests so RLS remains active.
- Reserve privileged credentials for narrow, reviewed administrative operations. Never use a service-role client as a shortcut for user CRUD.
- Test unauthenticated access and cross-user denial against the real local database.

## Authentication and secrets

- Never store plaintext passwords or raw OTP codes outside Supabase Auth.
- Never log or commit API keys, access tokens, database passwords, SMTP credentials, service-role keys, sessions, or generated environment files.
- Never put a server secret in a `NEXT_PUBLIC_*` variable.
- `.env.example` documents names only. `.env.local` is generated and ignored.
- Local captured email is development infrastructure, not proof that production email delivery works.
- Production credentials require deliberate one-time configuration in the relevant provider secret stores.

## AI boundary

- Mock AI is the default for local development and CI.
- Real OpenAI use requires `AI_PROVIDER=openai`, `ENABLE_REAL_AI=true`, a valid server-side `OPENAI_API_KEY`, and a configured supported model.
- Never silently spend API credits merely because a key is present.
- The browser must never call OpenAI directly or receive its key.
- Load trusted generation inputs from the authenticated database, validate structured output, reject unknown foods and unsafe content, recalculate nutrients deterministically, and save only a fully valid plan version.
- Keep an accepted plan until the user explicitly accepts a replacement.
- Never describe mock output as a live OpenAI result or an untested adapter as verified.

## Deterministic and safety boundaries

Application code, not AI, owns unit conversion, date math, progress, completion, trends, nutrition aggregation, safety flags, and all chart totals. Preserve measurement bases and verification states; do not invent nutrition values.

Apply safety screening before plan generation. Use neutral language, label estimates and projections, provide the wellness disclaimer, and keep safe non-restrictive tracking available where appropriate. Do not infer diagnoses.

## Accessibility and interface quality

- Meet WCAG 2.2 AA expectations.
- Preserve keyboard operation, visible focus, labels and descriptions, associated errors, logical headings, live announcements, reduced motion, adequate contrast, and 44-by-44-pixel touch targets.
- Pair icons and colors with text. Drag-and-drop must always have button and keyboard alternatives.
- Check layouts at approximately 375, 768, 1280, and 1440 pixels.
- Provide honest loading, empty, insufficient-data, session-expired, retry, success, and optimistic-rollback states.
- Never represent missing weight data as zero or incomplete check-ins as failure.

## Required verification

Run checks proportional to each change. Before declaring a broad change ready, run:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:db
npm run db:types:check
npm run build
npm run test:e2e
```

Use `npm run verify` for the full gate, including database/RLS, generated-type drift, and Playwright. Use `npm run verify:app` only when local database services are unavailable; it is an application-only check and does not replace the full gate. The default suites must remain mock-backed and spend no OpenAI credits.

Report commands and real outcomes accurately. Do not call the application complete when required checks are unrun or failing, do not call local Supabase production infrastructure, and do not claim an external integration was tested when it was mocked.
