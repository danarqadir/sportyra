# Sportyra News

Production-ready sports news website and newsroom foundation.

## Included

- Responsive React + Vite editorial frontend
- English / Arabic UI with RTL support
- News, categories, tags, search, pagination and related stories
- Protected newsroom CRUD, publishing and featured-story controls
- PostgreSQL + Drizzle ORM
- Secure admin token authentication with constant-time comparison
- Public user registration/login with httpOnly session cookies
- Password hashing with Node.js `scrypt`
- Newsletter subscriptions with duplicate protection and rate limiting
- Upload URL flow for editorial images
- Privacy-conscious first-party analytics and admin summary
- SEO metadata, canonical URLs, JSON-LD, sitemap, robots.txt and RSS
- Open Graph / Twitter metadata
- Optional Google AdSense integration via environment variables
- PWA manifest + offline shell service worker
- Live new-story browser notifications while the site is open
- Security headers, CORS configuration, body-size limits and rate limiting
- Error boundary and production error handling
- Unit test coverage for password hashing
- Production build scripts and database push command

## Production setup

1. Create a PostgreSQL database.
2. Copy `.env.example` to `.env`.
3. Set a **long random** `SPORTYRA_ADMIN_TOKEN`.
4. Set `DATABASE_URL` and `NODE_ENV=production`.
5. Run `pnpm install`.
6. Run `pnpm run db:push` to create/update the database schema.
7. Run `pnpm run build:production`.
8. Run `pnpm start`.

The API server serves `/api/*` and the built Sportyra frontend from the same service.

## Optional monetization

The code contains an opt-in AdSense integration. Keep `VITE_ADS_ENABLED=false` until the publisher account is approved. Then provide the publisher client and ad-slot IDs through environment variables. No payment credentials or publisher secrets are stored in the repository.

Subscriptions/payments are intentionally not enabled by default because they are not required for the initial sports-news product; the account/session architecture leaves room to add paid features later.

## Security notes

- Never commit `.env` or real credentials.
- The browser stores the newsroom admin token only in `sessionStorage` and sends it as a bearer token.
- Public user authentication uses an httpOnly, SameSite session cookie.
- Admin access is unavailable when `SPORTYRA_ADMIN_TOKEN` is missing.
- Do not reuse development secrets in production.

## Deployment

Recommended architecture is a single Node service with PostgreSQL. A reverse proxy/managed platform should terminate TLS and forward `X-Forwarded-Proto` correctly. If frontend and API are separated, set both `VITE_API_BASE_URL` and `CORS_ORIGIN`.
