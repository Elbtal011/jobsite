# Headline Agentur Clone + Lead Backend

## Stack
- Node.js + Express
- EJS templates
- PostgreSQL (Railway-ready)

## Features
- Public pages matching original route structure:
  - `/index.php`
  - `/Unternehmen`
  - `/Fachgebiete`
  - `/Bewerbung`
  - `/Kontakt`
  - `/Datenschutz`
  - `/Impressum`
- Lead capture forms (Kontakt + Bewerbung)
- Persistent lead storage in Postgres
- Admin panel:
  - Login at `/admin666/login`
  - List/filter leads
  - Lead detail + status updates
  - Notes
  - CSV export (`/admin666/leads-export.csv`)

## Setup
1. Copy `.env.example` to `.env` and fill values.
2. Ensure PostgreSQL is running and `DATABASE_URL` is valid.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start app:
   ```bash
   npm run dev
   ```

## Important Environment Variables
- `DATABASE_URL`
- `SESSION_SECRET`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `PORT`

## Railway Notes
- Create one web service for this app.
- Add PostgreSQL service/plugin.
- Set environment variables in Railway.
- Start command: `npm start`
- Healthcheck endpoint: `/health`

## Security Included
- Basic rate limiting for lead submission
- CSRF protection for form posts
- Honeypot anti-spam field
- Helmet + session hardening defaults
