# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this service is

`sms-hub-backend` ("Colegio Hub API") is a small NestJS control-plane service. It used to provision and
own per-school tenants (a `school` table, per-school service tokens, `SCHOOL_OWNER` accounts), but that
was trimmed in migration `1778000100000-TrimHubSchema`: the canonical `school` table and school-admin
accounts now live in `sms-backend`. What remains here is:

- Auth for a single platform role, `SYSTEM_ADMIN` (`HubUserRole` — only one enum value), backed by the
  `hub_user` table.
- An **AI admin proxy** (`modules/ai-admin`) that forwards system-admin operations (plans, credits, LLM
  tiers/pricing, feature-role config, settings) to the `school-ai` FastAPI service's
  `/api/v1/internal/hub/*` endpoints, authenticated with a shared `X-Internal-Api-Key` header
  (`AI_INTERNAL_KEY`) rather than a JWT. This service never holds an admin session with school-ai — it's
  a thin authenticated pass-through, translating FastAPI 422 validation errors into NestJS
  `BadRequestException`s.
- S3 access via `@sologence/nest-js-aws-s3` (global `S3Module`).

`JWT_SECRET` is intentionally shared with `sms-backend`: the `hub_user.role` enum was re-cased to
uppercase `SYSTEM_ADMIN` specifically so tokens issued by this hub validate directly against
`UserRole.SYSTEM_ADMIN` in `sms-backend` with no role-translation layer. Keep the two services' JWT
secrets in sync when rotating.

## Commands

```bash
npm run start:dev          # nest start --watch (local dev, port from .env/PORT, default 3002)
npm run build               # nest build -> dist/
npm run start:prod          # node dist/main (post-build)
npm run lint                 # eslint --fix across src/apps/libs/test
npm run format               # prettier --write src/**/*.ts

# TypeORM (all commands go through ts-node against src/database/data-source.ts)
npm run migration:generate   # diff entities vs DB, write to src/database/migrations/Migration<ts>.ts
npm run migration:create     # blank migration file
npm run migration:run        # apply pending migrations (dev, ts-node)
npm run migration:revert     # revert last migration
npm run migration:prod       # apply migrations against compiled dist/ (used by CI/CD, not locally)
npm run schema:drop          # drop entire schema — destructive, dev only
```

There is no test runner configured in this repo (no Jest config, no test scripts, no `*.spec.ts` files) —
don't assume `npm test` exists.

`AWS_SSM` param loading (`src/common/config/setup-aws-ssm.ts`) is skipped automatically when
`NODE_ENV` is unset/`local`/`development` unless `FORCE_AWS_SSM=true` is set, so local dev reads
straight from `.env`. In non-local `NODE_ENV`, both `main.ts` bootstrap and `data-source.ts` (for
migrations) pull params from AWS SSM Parameter Store at `/sms-hub/<NODE_ENV>/` before anything else runs.

## Local dev over Cloudflare tunnel (mobile testing)

Local dev is exposed to the internet through a named Cloudflare tunnel (`home-app`) so the stack can be
tested on real phones/tablets, not just a desktop browser. Config lives at `~/.cloudflared/config.yml`;
the PowerShell profile provides `c-tunnel` (run the tunnel) and `cloudflared-config` (open the config in
VS Code). Ingress map (specific hostnames must stay ABOVE the `*.appme.in` wildcard — cloudflared matches
in order):

| Hostname | Local service |
|---|---|
| `hub-api.appme.in` | **sms-hub-backend (this API)** — `localhost:5001` |
| `hub.appme.in` | sms-hub-frontend — `localhost:3001` |
| `myapp.appme.in` | sms-backend API — `localhost:5000` |
| `ai-api.appme.in` | school-ai — `localhost:8001` (long keep-alive for slow AI generations) |
| `*.appme.in` wildcard (e.g. `edusphere.appme.in`), also `myrealapp.appme.in` | sms-frontend — `localhost:3000` (subdomain doubles as the tenant slug) |

The frontends are installable PWAs required to be responsive on mobile, tablet, laptop, and large
screens; the responsive requirement itself is enforced in the frontend repos.

## Architecture

**Module graph** (`app.module.ts`): `ConfigModule` (global) → `GlobalConfigModule` → `DatabaseModule` →
`S3Module` → `AuthModule` → `HubUsersModule` → `SeederModule` → `AiAdminModule`. `DatabaseModule` and
`S3Module` are `@Global()`.

**Config**: there are two parallel env-validation paths that both wrap `EnvDto`
(`src/common/dto/env.dto.ts`, a class-validator DTO with defaults) — `GlobalConfigService`
(`common/config/global-config.service.ts`, injected as `config.env.X`, used by `AiAdminService` for
`AI_BACKEND_URL`/`AI_INTERNAL_KEY`) and a bare `validate()` function (`env.validation.ts`). Most modules
instead just use Nest's `ConfigService.get<T>('X')` directly against `process.env` — there's no single
enforced access pattern, so check how the surrounding module already reads config before introducing a
new variable, and add it to `EnvDto` regardless of which path reads it.

**Auth flow**: `POST /auth/login` (public) checks `hub_user` by email + bcrypt, issues a JWT with
`{ sub, email, role }`. If `HubUser.isFirstLogin` is true, the token instead carries
`isChangePasswordOnly: true` with a 15-minute expiry; `JwtAuthGuard` (`modules/auth/jwt-auth.guard.ts`)
special-cases such tokens to only allow `AuthController.changePassword` and `.me` — every other
`@UseGuards(JwtAuthGuard)` route 403s until the password is changed. Routes opt out of auth entirely with
`@Public()` (checked via `IS_PUBLIC_KEY` reflector metadata). `RolesGuard` + `@Roles(HubUserRole.X)` layer
on top for role checks, but there's currently only one role so it mostly guards against unauthenticated
service accounts.

**Seeding**: `SeederService.onApplicationBootstrap()` runs on every boot and creates the `SYSTEM_ADMIN`
row from `HUB_SYSTEM_ADMIN_EMAIL`/`HUB_SYSTEM_ADMIN_PASSWORD` env vars if no user with that email exists
yet — idempotent, safe to leave running in prod.

**Database**: single Postgres connection (`DatabaseModule`), `autoLoadEntities: true`, `synchronize`
controlled by `DB_SYNCHRONIZE` (should stay `false` outside scratch/local work — use migrations). SSL is
gated on `DB_SSL=true` (RDS enforces SSL in managed envs; local Postgres needs none). Migrations directory
is `src/database/migrations/`; `data-source.ts` is the CLI entry point and independently loads dotenv +
SSM params since it runs outside the Nest app context.

**AI admin proxy pattern** (`modules/ai-admin/`): every method on `AiAdminService` is a thin
`call(method, path, body)` wrapper hitting `${AI_BACKEND_URL}/api/v1/internal${path}` with the internal
API key header. When adding a new admin capability, mirror an existing school-ai `/internal/hub/*`
endpoint here rather than adding new business logic — this module intentionally has none; validation and
storage live in `school-ai`.

## Deployment

CI/CD is GitHub Actions (`.github/workflows/deploy-ec2.yml`): pushes to `development` deploy the
`development` environment, pushes to `main` deploy `production`. The workflow builds, SCPs `dist/` +
`package.json` + `ecosystem.config.js` to the EC2 host, runs `npm ci --omit=dev`, runs
`npm run migration:prod` (against compiled JS, not ts-node), then starts/restarts PM2 in cluster mode
(`ecosystem.config.js`, `instances: 'max'`) under a per-environment PM2 process name
(`sms-hub-backend-development` / `sms-hub-backend-production`, ports 3011 / 3010 respectively — see
`DEPLOYMENT_VARIABLES.md`). Non-local environments load their env vars from AWS SSM Parameter Store
(`/sms-hub/<env>/...`) rather than a committed `.env` — the deploy step only writes `NODE_ENV`,
`FORCE_AWS_SSM` (dev only), and `AWS_REGION` into `.env` on the box. `DEPLOYMENT_VARIABLES.md` documents
the full SSM parameter list and the corresponding `scripts/provision-ssm.ps1` helper for populating them.
