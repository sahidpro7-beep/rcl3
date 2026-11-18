-- RCL 2027 Migration 003: Row Level Security (RLS) & Storage Buckets/Policies

-- Enable RLS on EVERY table
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upload_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

-- 1. admin_users: Only current admin can read own row; no public inserts/updates/deletes.
DROP POLICY IF EXISTS "admin_users_select_admin" ON public.admin_users;
CREATE POLICY "admin_users_select_admin"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2. applications: Strictly NO anonymous SELECT/INSERT/UPDATE/DELETE!
-- All public submissions, status lookups, and resubmissions go through Edge Functions (service_role)
-- with rate limiting, validation, and enumeration protection.
DROP POLICY IF EXISTS "applications_admin_all" ON public.applications;
CREATE POLICY "applications_admin_all"
  ON public.applications FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. payment_records & application_history & settings_audit_log: Admin read/write only
DROP POLICY IF EXISTS "payment_records_admin_all" ON public.payment_records;
CREATE POLICY "payment_records_admin_all"
  ON public.payment_records FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "application_history_admin_all" ON public.application_history;
CREATE POLICY "application_history_admin_all"
  ON public.application_history FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "settings_audit_log_admin_all" ON public.settings_audit_log;
CREATE POLICY "settings_audit_log_admin_all"
  ON public.settings_audit_log FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. website_settings: Public read via get_public_settings() RPC; Admin read/write directly
DROP POLICY IF EXISTS "website_settings_public_read" ON public.website_settings;
CREATE POLICY "website_settings_public_read"
  ON public.website_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "website_settings_admin_write" ON public.website_settings;
CREATE POLICY "website_settings_admin_write"
  ON public.website_settings FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. teams: Public read; Admin write
DROP POLICY IF EXISTS "teams_public_read" ON public.teams;
CREATE POLICY "teams_public_read"
  ON public.teams FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "teams_admin_write" ON public.teams;
CREATE POLICY "teams_admin_write"
  ON public.teams FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 6. notices_fixtures, gallery_items, sponsors: Public read ONLY when published; Admin full control
DROP POLICY IF EXISTS "notices_public_read" ON public.notices_fixtures;
CREATE POLICY "notices_public_read"
  ON public.notices_fixtures FOR SELECT
  TO anon, authenticated
  USING (is_published = true OR public.is_admin());

DROP POLICY IF EXISTS "notices_admin_write" ON public.notices_fixtures;
CREATE POLICY "notices_admin_write"
  ON public.notices_fixtures FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "gallery_public_read" ON public.gallery_items;
CREATE POLICY "gallery_public_read"
  ON public.gallery_items FOR SELECT
  TO anon, authenticated
  USING (is_published = true OR public.is_admin());

DROP POLICY IF EXISTS "gallery_admin_write" ON public.gallery_items;
CREATE POLICY "gallery_admin_write"
  ON public.gallery_items FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "sponsors_public_read" ON public.sponsors;
CREATE POLICY "sponsors_public_read"
  ON public.sponsors FOR SELECT
  TO anon, authenticated
  USING (is_published = true OR public.is_admin());

DROP POLICY IF EXISTS "sponsors_admin_write" ON public.sponsors;
CREATE POLICY "sponsors_admin_write"
  ON public.sponsors FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7. upload_tokens & rate_limit_events: No direct public or client access; Edge Function service_role only
DROP POLICY IF EXISTS "upload_tokens_admin_read" ON public.upload_tokens;
CREATE POLICY "upload_tokens_admin_read"
  ON public.upload_tokens FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 8. Storage Buckets
-- Private bucket for raw player photos & ALL payment screenshots
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rcl-private-uploads',
  'rcl-private-uploads',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Controlled public bucket for approved player photos, team logos, sponsors, gallery, site logo/hero
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rcl-public-media',
  'rcl-public-media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage RLS Policies:
-- Private bucket: ONLY Main Admin can read via authenticated storage API; Edge Functions use service_role
DROP POLICY IF EXISTS "rcl_private_admin_read" ON storage.objects;
CREATE POLICY "rcl_private_admin_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'rcl-private-uploads' AND public.is_admin());

-- Public bucket: Anyone can read; ONLY Main Admin can insert/update/delete
DROP POLICY IF EXISTS "rcl_public_read" ON storage.objects;
CREATE POLICY "rcl_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'rcl-public-media');

DROP POLICY IF EXISTS "rcl_public_admin_insert" ON storage.objects;
CREATE POLICY "rcl_public_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'rcl-public-media' AND public.is_admin());

DROP POLICY IF EXISTS "rcl_public_admin_update" ON storage.objects;
CREATE POLICY "rcl_public_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'rcl-public-media' AND public.is_admin());

DROP POLICY IF EXISTS "rcl_public_admin_delete" ON storage.objects;
CREATE POLICY "rcl_public_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'rcl-public-media' AND public.is_admin());
