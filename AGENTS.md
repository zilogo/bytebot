# Repository Guidelines

## Project Structure & Module Organization
Bytebot is a multi-package TypeScript workspace. Core services live in `packages/`: `bytebot-agent` (NestJS API + `prisma/` schema), `bytebotd` (desktop daemon and socket bridge), `bytebot-ui` (Next.js task console run via `server.ts`), `bytebot-agent-cc` (Claude Code integration), and `shared` (build-first utilities exported from `dist`). Deployment assets sit in `docker/` and `helm/`; user-facing guides belong in `docs/`; static branding lives in `static/`. Tests for backend packages sit under each package's `src` with `*.spec.ts`.

## Build, Test, and Development Commands
Install dependencies per package with `npm install` before building. Compile shared types once: `cd packages/shared && npm run build`. For the API run `npm run start:dev` inside `packages/bytebot-agent`; use `npm run prisma:dev` whenever the schema changes. Launch the desktop daemon with `npm run start:dev` from `packages/bytebotd`, and start the Next.js UI via `npm run dev` in `packages/bytebot-ui`. Use `npm run build` in the same directories for production bundles.

## Coding Style & Naming Conventions
This codebase relies on Prettier (single quotes, trailing commas, 2-space tabs) and package-local `eslint.config.mjs` presets. Run `npm run format` before committing and keep ESLint clean with `npm run lint`. Prefer TypeScript strictness, camelCase for variables/functions, PascalCase for classes/providers, and SCREAMING_SNAKE_CASE for environment keys. Co-locate UI components under `packages/bytebot-ui/src/app` and keep NestJS modules feature-scoped.

## Testing Guidelines
Backend services ship with Jest; favor fast unit specs named `*.spec.ts` alongside the modules they cover. Use `npm run test`, `npm run test:watch`, or `npm run test:cov` within each service package; strive to keep coverage trending upward when touching critical flows (task orchestration, desktop control). Snapshot or visual testing is not yet wired in, so include manual verification notes in PRs that affect the UI.

## Commit & Pull Request Guidelines
Existing history uses short, imperative subjects (for example, `Add prisma dev dependency`). Follow that style and scope the prefix with the package when helpful (`bytebot-ui: fix task stream`). Keep PRs focused, describe the change, list manual or automated test evidence, and link GitHub issues or Discord threads when applicable. Attach screenshots or terminal recordings for UI or CLI-facing changes, and call out any config updates (`docker/.env`, Helm values) in the PR body.

## Security & Configuration Tips
Secrets belong in local `.env` files or managed stores—never commit keys. When adjusting deployment defaults, mirror changes in both `docker/docker-compose.yml` and `helm/values.yaml`. Review new dependencies for desktop permissions (nut-js, uiohook) and document any OS-level requirements in `docs/`.
