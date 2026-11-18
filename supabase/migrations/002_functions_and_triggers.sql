-- RCL 2027 Migration 002: Secure Functions, Triggers, and Server-Side Window Calculation

-- 1. Updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_website_settings_updated_at ON public.website_settings;
CREATE TRIGGER trg_website_settings_updated_at
  BEFORE UPDATE ON public.website_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_teams_updated_at ON public.teams;
CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_applications_updated_at ON public.applications;
CREATE TRIGGER trg_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_notices_fixtures_updated_at ON public.notices_fixtures;
CREATE TRIGGER trg_notices_fixtures_updated_at
  BEFORE UPDATE ON public.notices_fixtures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Strict Admin Authorization Helper (fixed search_path)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- 3. Authoritative Server-Side Registration Window Evaluator
CREATE OR REPLACE FUNCTION public.is_registration_open()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.website_settings%ROWTYPE;
  now_ts timestamptz := now();
BEGIN
  SELECT * INTO s FROM public.website_settings WHERE id = 1;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF s.registration_mode = 'force_open' THEN
    RETURN true;
  ELSIF s.registration_mode = 'force_closed' THEN
    RETURN false;
  END IF;

  -- Auto mode: check opening date (and optional closing date)
  IF now_ts < s.registration_open_at THEN
    RETURN false;
  END IF;

  IF s.registration_close_at IS NOT NULL AND now_ts > s.registration_close_at THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.is_registration_open() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_registration_open() TO anon, authenticated, service_role;

-- 4. Guard against approving applications without verified payment
CREATE OR REPLACE FUNCTION public.guard_application_transitions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.application_status = 'approved' AND NEW.payment_status <> 'verified' THEN
    RAISE EXCEPTION 'Cannot approve application until payment is verified.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.application_status = 'rejected' AND (NEW.rejection_reason IS NULL OR char_length(trim(NEW.rejection_reason)) = 0) THEN
    RAISE EXCEPTION 'Rejection reason is required when rejecting an application.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.payment_amount <> NEW.base_price THEN
    RAISE EXCEPTION 'Payment amount must equal selected base price.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_application_transitions ON public.applications;
CREATE TRIGGER trg_guard_application_transitions
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.guard_application_transitions();

-- 5. Safe Public Approved Players Projection (exposes ONLY the 5 required public fields)
CREATE OR REPLACE FUNCTION public.get_approved_players()
RETURNS TABLE (
  player_id text,
  player_name text,
  public_photo_path text,
  player_role text,
  base_price integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.player_id,
    a.player_name,
    a.public_photo_path,
    a.player_role,
    a.base_price
  FROM public.applications a
  WHERE a.application_status = 'approved'
  ORDER BY a.player_id ASC;
$$;

REVOKE ALL ON FUNCTION public.get_approved_players() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_approved_players() TO anon, authenticated, service_role;

-- 6. Public Bootstrap RPC (safe public settings + effective registration status)
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tournament_name', s.tournament_name,
    'short_name', s.short_name,
    'season', s.season,
    'tagline_en', s.tagline_en,
    'tagline_bn', s.tagline_bn,
    'contact_name', s.contact_name,
    'contact_phone', s.contact_phone,
    'whatsapp_number', s.whatsapp_number,
    'upi_id', s.upi_id,
    'upi_receiver_name', s.upi_receiver_name,
    'cash_instructions_en', s.cash_instructions_en,
    'cash_instructions_bn', s.cash_instructions_bn,
    'registration_mode', s.registration_mode,
    'registration_open_at', s.registration_open_at,
    'registration_close_at', s.registration_close_at,
    'is_registration_open', public.is_registration_open(),
    'whatsapp_channel_url', s.whatsapp_channel_url,
    'facebook_url', s.facebook_url,
    'instagram_url', s.instagram_url,
    'logo_path', s.logo_path,
    'hero_image_path', s.hero_image_path,
    'about_en', s.about_en,
    'about_bn', s.about_bn,
    'rules_en', s.rules_en,
    'rules_bn', s.rules_bn
  )
  FROM public.website_settings s
  WHERE s.id = 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated, service_role;
