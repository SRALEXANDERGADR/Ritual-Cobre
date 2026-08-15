# Project Guide

## Architecture

Ritual Cobre is a TanStack Start ecommerce application deployed on Cloudflare Workers. Public storefront data and admin operations use TanStack server functions. Structured records persist in Postgres on Neon (via Drizzle's `neon-http` driver), uploaded images are committed to a GitHub repo via the Contents API and served from `raw.githubusercontent.com`, admin authentication is a single shared ADMIN_PASSWORD secret with a signed session cookie, and new orders optionally trigger an email notification via Resend.

## Key Directories

- `src/routes/`: File-based routes for the storefront, policies, admin panel, and the `/api/upload` server route.
- `src/components/`: Main interactive storefront and admin interfaces.
- `src/lib/store.ts`: Server functions, initial seed content, and database operations.
- `src/lib/auth.ts`: ADMIN_PASSWORD check and signed session cookie helpers.
- `src/lib/github.ts`: Uploads images to GitHub via the Contents API.
- `src/lib/email.ts`: Sends the "new order" notification email via Resend.
- `db/`: Drizzle Postgres schema and Neon client.
- `db/migrations/`: Generated via `pnpm db:generate`, applied via `pnpm db:migrate` (needs `DATABASE_URL` in the environment).
- `wrangler.jsonc`: Cloudflare Worker config. No bindings are needed — DB and image storage are reached over HTTP using secrets (`DATABASE_URL`, `GITHUB_TOKEN`, `GITHUB_REPO`, `RESEND_API_KEY`).

## Conventions

- Use TypeScript and functional React components.
- Keep prices as integer cents in the database and application state.
- Keep user-facing copy in Spanish.
- Use Neon Postgres for queryable records and GitHub (Contents API) for uploaded files.
- Protect every administrative server mutation with `requireAdmin()` / `verifySession()`.
- Generate a migration after every schema change with `pnpm db:generate`.
- Preserve the terracotta, dusty rose, lavender, and ink visual direction unless the product owner requests a redesign.

## Non-obvious Decisions

- Checkout creates an internal order instead of processing card payments. Payment and delivery are coordinated after submission, matching the requested order workflow.
- Default products and editable content are inserted lazily on first data access, keeping a fresh deployment immediately usable.
- Admin login is a single shared password stored as the `ADMIN_PASSWORD` Worker secret, verified server-side, backed by an HMAC-signed session cookie (`SESSION_SECRET` secret). There is no per-user account system.
- Uploaded images are limited to image MIME types and 8 MB, and are committed straight to the app's GitHub repo (`GITHUB_UPLOAD_PATH`, default `public/uploads`) rather than an object store — no bucket to provision.
- Customers can be created automatically at checkout, or added/edited manually from the admin panel (unlike checkout, manual entries don't require an email).
- The order notification email is only sent if `RESEND_API_KEY` is set AND a destination address is saved in the content editor's "Notificaciones" group (`notificationEmail`). Missing configuration never blocks order creation.
