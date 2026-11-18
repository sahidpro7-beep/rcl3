-- RCL 2027 Migration 001: Schema, Sequences, Constraints, Indexes, and Seed Defaults
-- Run in Supabase SQL Editor or via `supabase db push` in exact numerical order.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Single Main Admin authorization table
-- Only an explicitly inserted auth.users(id) has admin privileges.
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  singleton_guard boolean NOT NULL DEFAULT true CHECK (singleton_guard = true),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_users_single_main_admin UNIQUE (singleton_guard)
);

-- 2. Sequential Player ID sequence: RCL27-0001, RCL27-0002, ...
CREATE SEQUENCE IF NOT EXISTS public.rcl27_player_seq
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  CACHE 1;

-- 3. Singleton Website & Tournament Settings
CREATE TABLE IF NOT EXISTS public.website_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  tournament_name text NOT NULL DEFAULT 'Raghunathpur Cricket League',
  short_name text NOT NULL DEFAULT 'RCL 2027',
  season integer NOT NULL DEFAULT 3,
  tagline_en text NOT NULL DEFAULT '6 TEAMS. ONE TROPHY. ONE CHAMPION!',
  tagline_bn text NOT NULL DEFAULT '৬ দল। এক ট্রফি। এক চ্যাম্পিয়ন!',
  contact_name text NOT NULL DEFAULT 'Samir Khan',
  contact_phone text NOT NULL DEFAULT '+91 8509044325',
  whatsapp_number text NOT NULL DEFAULT '918509044325',
  upi_id text NOT NULL DEFAULT '9732865882@ybl',
  upi_receiver_name text NOT NULL DEFAULT 'Samir Khan',
  cash_instructions_en text NOT NULL DEFAULT 'For cash payment, contact Samir Khan: +91 8509044325.',
  cash_instructions_bn text NOT NULL DEFAULT 'নগদ অর্থ প্রদানের জন্য সামির খানের সাথে যোগাযোগ করুন: +91 8509044325।',
  registration_mode text NOT NULL DEFAULT 'auto'
    CHECK (registration_mode IN ('auto', 'force_open', 'force_closed')),
  registration_open_at timestamptz NOT NULL DEFAULT '2026-11-05T00:00:00+05:30',
  registration_close_at timestamptz NULL,
  whatsapp_channel_url text NULL,
  facebook_url text NULL,
  instagram_url text NULL,
  logo_path text NULL,
  hero_image_path text NULL,
  about_en text NOT NULL DEFAULT 'Raghunathpur Cricket League (RCL 2027) enters Season 3 with six competitive franchises battling under floodlights for one championship trophy. Open player registration allows local batsmen, bowlers, and all-rounders to enter the official Season 3 player pool at a transparent base price of ₹20 or ₹30.',
  about_bn text NOT NULL DEFAULT 'রঘুনাথপুর ক্রিকেট লিগ (আরসিএল ২০২৭) সিজন ৩-এ ছয়টি দল একটি শিরোপার জন্য লড়াই করবে। স্থানীয় ব্যাটসম্যান, বোলার এবং অলরাউন্ডাররা মাত্র ₹২০ বা ₹৩০ বেস প্রাইসে অফিসিয়াল প্লেয়ার তালিকায় নিবন্ধন করতে পারবেন।',
  rules_en text NOT NULL DEFAULT E'1. Players must submit accurate name, role, one-line address, 10-digit Indian mobile number, and clear photograph.\n2. The selected Base Price (₹20 or ₹30) is the full registration payment amount. There is no ₹500 fee or extra charge.\n3. UPI payments require a valid payment screenshot upload; cash payments remain pending until verified by the organizer.\n4. Only applications with verified payment and admin approval appear in the public RCL 2027 player directory.\n5. Approved players’ names, photos, roles, and Base Prices will be displayed publicly on the tournament portal.',
  rules_bn text NOT NULL DEFAULT E'১. খেলোয়াড়দের সঠিক নাম, ভূমিকা, এক লাইনের ঠিকানা, ১০-অঙ্কের ভারতীয় মোবাইল নম্বর এবং স্পষ্ট ছবি জমা দিতে হবে।\n২. নির্বাচিত বেস প্রাইস (₹২০ বা ₹৩০)-ই সম্পূর্ণ নিবন্ধন ফি। কোনো অতিরিক্ত ৫০০ টাকা ফি নেই।\n৩. UPI পেমেন্টের ক্ষেত্রে পেমেন্ট স্ক্রিনশট আপলোড করা বাধ্যতামূলক; নগদ পেমেন্ট অ্যাডমিন যাচাই না করা পর্যন্ত পেন্ডিং থাকবে।\n৪. কেবল পেমেন্ট যাচাই ও অ্যাডমিন অনুমোদনের পরই খেলোয়াড়দের নাম পাবলিক তালিকায় প্রকাশিত হবে।\n৫. অনুমোদিত খেলোয়াড়দের নাম, ছবি, ভূমিকা এবং বেস প্রাইস ওয়েবসাইটে সবার জন্য প্রদর্শিত হবে।',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Six Fixed Team Slots
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_number integer NOT NULL UNIQUE CHECK (slot_number BETWEEN 1 AND 6),
  name_en text NOT NULL DEFAULT 'Team name to be announced',
  name_bn text NOT NULL DEFAULT 'দলের নাম শীঘ্রই ঘোষণা করা হবে',
  captain_name text NULL,
  logo_path text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Player Applications (Strictly private; never allow anonymous SELECT)
CREATE TABLE IF NOT EXISTS public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id text NOT NULL UNIQUE DEFAULT ('RCL27-' || lpad(nextval('public.rcl27_player_seq')::text, 4, '0')),
  idempotency_key uuid NOT NULL UNIQUE,
  player_name text NOT NULL CHECK (char_length(trim(player_name)) BETWEEN 2 AND 100),
  player_role text NOT NULL CHECK (player_role IN ('Batsman', 'Bowler', 'All-rounder')),
  address text NOT NULL CHECK (char_length(trim(address)) BETWEEN 3 AND 220),
  -- Mobile number is intentionally NOT unique so multiple players can register using one mobile number.
  mobile_number text NOT NULL CHECK (mobile_number ~ '^[6-9][0-9]{9}$'),
  photo_path text NOT NULL,
  public_photo_path text NULL,
  base_price integer NOT NULL CHECK (base_price IN (20, 30)),
  payment_method text NOT NULL CHECK (payment_method IN ('UPI', 'Cash')),
  payment_amount integer NOT NULL CHECK (payment_amount IN (20, 30) AND payment_amount = base_price),
  payment_screenshot_path text NULL,
  transaction_id text NULL CHECK (transaction_id IS NULL OR char_length(transaction_id) <= 80),
  -- Snapshot of payment instructions shown at submission time so future settings edits never rewrite historical records
  historical_upi_id text NULL,
  historical_receiver_name text NOT NULL DEFAULT 'Samir Khan',
  historical_cash_instructions text NULL,
  application_status text NOT NULL DEFAULT 'pending_review'
    CHECK (application_status IN ('pending_review', 'approved', 'rejected')),
  payment_status text NOT NULL DEFAULT 'pending_verification'
    CHECK (payment_status IN ('pending_verification', 'verified', 'rejected')),
  rejection_reason text NULL,
  internal_notes text NULL,
  allow_closed_correction boolean NOT NULL DEFAULT false,
  public_consent_accepted boolean NOT NULL DEFAULT false CHECK (public_consent_accepted = true),
  revision_count integer NOT NULL DEFAULT 1 CHECK (revision_count >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applications_upi_requires_screenshot CHECK (
    payment_method <> 'UPI' OR (payment_screenshot_path IS NOT NULL AND char_length(trim(payment_screenshot_path)) > 0)
  ),
  CONSTRAINT applications_approval_requires_verified_payment CHECK (
    NOT (application_status = 'approved' AND payment_status <> 'verified')
  ),
  CONSTRAINT applications_rejected_requires_reason CHECK (
    application_status <> 'rejected' OR (rejection_reason IS NOT NULL AND char_length(trim(rejection_reason)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_applications_mobile ON public.applications (mobile_number);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications (application_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON public.applications (created_at DESC);

-- 6. Normalized Payment Records
CREATE TABLE IF NOT EXISTS public.payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  revision_number integer NOT NULL DEFAULT 1,
  payment_method text NOT NULL CHECK (payment_method IN ('UPI', 'Cash')),
  amount integer NOT NULL CHECK (amount IN (20, 30)),
  upi_id_used text NULL,
  receiver_name_snapshot text NOT NULL,
  screenshot_path text NULL,
  transaction_id text NULL,
  status text NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'verified', 'rejected')),
  verified_by uuid NULL REFERENCES auth.users(id),
  verification_note text NULL,
  verified_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_records_app ON public.payment_records (application_id, created_at DESC);

-- 7. Application Review & Correction History
CREATE TABLE IF NOT EXISTS public.application_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('player', 'admin', 'system')),
  actor_id uuid NULL,
  previous_values jsonb NULL,
  new_values jsonb NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_history_app ON public.application_history (application_id, created_at DESC);

-- 8. Announcements & Match Fixtures
CREATE TABLE IF NOT EXISTS public.notices_fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('notice', 'fixture')),
  title_en text NOT NULL,
  title_bn text NOT NULL,
  body_en text NOT NULL,
  body_bn text NOT NULL,
  event_date timestamptz NULL,
  venue text NULL,
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Tournament Gallery
CREATE TABLE IF NOT EXISTS public.gallery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en text NOT NULL,
  title_bn text NOT NULL,
  image_path text NOT NULL,
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Sponsors
CREATE TABLE IF NOT EXISTS public.sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tier_en text NOT NULL DEFAULT 'Official Partner',
  tier_bn text NOT NULL DEFAULT 'অফিশিয়াল পার্টনার',
  website_url text NULL,
  logo_path text NULL,
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. Website & Team Settings Audit Log
CREATE TABLE IF NOT EXISTS public.settings_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  changed_by uuid NULL REFERENCES auth.users(id),
  summary text NOT NULL,
  previous_values jsonb NULL,
  new_values jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 12. Short-lived Upload Tokens (prevents abandoned/unauthorized file hijacking)
CREATE TABLE IF NOT EXISTS public.upload_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('player_photo', 'payment_screenshot')),
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  consumed boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 13. Server-side Rate Limiting Events
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action text NOT NULL,
  ip_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup ON public.rate_limit_events (action, ip_hash, created_at DESC);

-- Seed initial safe singleton settings (id = 1)
INSERT INTO public.website_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Seed 6 initial team slots
INSERT INTO public.teams (slot_number, name_en, name_bn)
VALUES
  (1, 'Team name to be announced', 'দলের নাম শীঘ্রই ঘোষণা করা হবে'),
  (2, 'Team name to be announced', 'দলের নাম শীঘ্রই ঘোষণা করা হবে'),
  (3, 'Team name to be announced', 'দলের নাম শীঘ্রই ঘোষণা করা হবে'),
  (4, 'Team name to be announced', 'দলের নাম শীঘ্রই ঘোষণা করা হবে'),
  (5, 'Team name to be announced', 'দলের নাম শীঘ্রই ঘোষণা করা হবে'),
  (6, 'Team name to be announced', 'দলের নাম শীঘ্রই ঘোষণা করা হবে')
ON CONFLICT (slot_number) DO NOTHING;
