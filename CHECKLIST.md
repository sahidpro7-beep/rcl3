# RCL 2027 — Account-Specific Configuration Checklist

Before going live with real player registrations on `rcl.tinbin.in`, complete these account-specific items:

- [ ] **Supabase Project Created**: Create project in `ap-south-1` (Mumbai) and note your Project Reference ID.
- [ ] **Migrations Executed in Order**:
  - [ ] `supabase/migrations/001_schema_and_constraints.sql`
  - [ ] `supabase/migrations/002_functions_and_triggers.sql`
  - [ ] `supabase/migrations/003_rls_and_storage.sql`
  - [ ] `supabase/migrations/004_past_champions_videos_social.sql`
  - [ ] `supabase/migrations/005_video_gallery_facebook_first.sql`
- [ ] **Frontend `.env` Configured** (never commit `.env` to git):
  - [ ] `VITE_SUPABASE_URL` set to your Supabase project URL
  - [ ] `VITE_SUPABASE_ANON_KEY` set to your Supabase anon public key
- [ ] **Edge Functions Deployed**:
  - [ ] `public-data`
  - [ ] `upload-media`
  - [ ] `register-player`
  - [ ] `check-status`
  - [ ] `resubmit-application`
  - [ ] `admin-api`
- [ ] **Single Main Admin Bootstrapped**:
  - [ ] Auth user created in Supabase Authentication (Email + Password, auto-confirmed)
  - [ ] That exact `auth.users.id` inserted into `public.admin_users`
- [ ] **Optional Post-Setup Content via `/admin`**:
  - [ ] Review pre-seeded WhatsApp Channel, Facebook Page, and Instagram URLs
  - [ ] Review or update Past Champions (`2025: Ali Knight Rider`, `2026: SRCB`) and logos
  - [ ] Manage YouTube/Facebook highlight videos, fixtures, notices, and sponsors
- [ ] **Static Build & Hostinger Deployment (Later Stage)**:
  - [ ] Run `npm run build` after setting `.env`
  - [ ] Upload `dist/` contents (including `.htaccess` SPA fallback for `/register`, `/track`, `/players`, and `/admin`) ONLY to `rcl.tinbin.in` document root (leave `tinbin.in` WordPress files, database, and DNS untouched)
  - [ ] If deploying to Nginx/Cloudflare/Netlify instead of Apache/Hostinger, configure fallback to `/index.html` (`try_files $uri $uri/ /index.html;`)
