-- RCL 2027 Migration 004: Past Champions, Video Gallery Carousel, and Final Social Links
-- Non-destructive migration: preserves all existing applications, payments, teams, notices, and sponsors.

-- 1. Past Champions table (replaces public 6-team grid while preserving `teams` table intact)
CREATE TABLE IF NOT EXISTS public.past_champions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_order integer NOT NULL UNIQUE CHECK (slot_order IN (1, 2)),
  champion_year integer NOT NULL CHECK (champion_year BETWEEN 2000 AND 2100),
  team_name_en text NOT NULL CHECK (char_length(trim(team_name_en)) BETWEEN 1 AND 120),
  team_name_bn text NOT NULL CHECK (char_length(trim(team_name_bn)) BETWEEN 1 AND 120),
  logo_path text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_past_champions_updated_at ON public.past_champions;
CREATE TRIGGER trg_past_champions_updated_at
  BEFORE UPDATE ON public.past_champions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.past_champions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "past_champions_public_read" ON public.past_champions;
CREATE POLICY "past_champions_public_read"
  ON public.past_champions FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "past_champions_admin_write" ON public.past_champions;
CREATE POLICY "past_champions_admin_write"
  ON public.past_champions FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.past_champions (slot_order, champion_year, team_name_en, team_name_bn, logo_path)
VALUES
  (1, 2025, 'Ali Knight Rider', 'আলি নাইট রাইডার', '/assets/aistudio/46268acd-fe51-4ad3-8e33-91df8e030b1b_a2aa34e5.JPG'),
  (2, 2026, 'SRCB', 'এস.আরসিবি (SRCB)', '/assets/aistudio/08539d34-2e37-4005-a23b-d0c1d568e8e5_9c9a0e78.JPG')
ON CONFLICT (slot_order) DO NOTHING;

-- 2. Video Gallery table (allowlisted YouTube & Facebook video URLs only; no arbitrary iframe HTML)
CREATE TABLE IF NOT EXISTS public.video_gallery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('youtube', 'facebook')),
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  caption_en text NOT NULL DEFAULT 'RCL Tournament Highlight',
  caption_bn text NOT NULL DEFAULT 'আরসিএল টুর্নামেন্ট হাইলাইটস',
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_video_gallery_updated_at ON public.video_gallery;
CREATE TRIGGER trg_video_gallery_updated_at
  BEFORE UPDATE ON public.video_gallery
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.video_gallery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "video_gallery_public_read" ON public.video_gallery;
CREATE POLICY "video_gallery_public_read"
  ON public.video_gallery FOR SELECT
  TO anon, authenticated
  USING (is_published = true OR public.is_admin());

DROP POLICY IF EXISTS "video_gallery_admin_write" ON public.video_gallery;
CREATE POLICY "video_gallery_admin_write"
  ON public.video_gallery FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.video_gallery (provider, source_url, caption_en, caption_bn, sort_order, is_published)
SELECT * FROM (
  VALUES
    ('facebook', 'https://www.facebook.com/reel/1118360820808949/', 'RCL Tournament Reel', 'আরসিএল টুর্নামেন্ট রিল', 1, true),
    ('youtube', 'https://www.youtube.com/watch?v=7XJIGX0qSnI', 'RCL Match Highlight 1', 'আরসিএল ম্যাচ হাইলাইটস ১', 2, true),
    ('youtube', 'https://www.youtube.com/watch?v=_bebjalkgvM', 'RCL Match Highlight 2', 'আরসিএল ম্যাচ হাইলাইটস ২', 3, true)
) AS seed(provider, source_url, caption_en, caption_bn, sort_order, is_published)
WHERE NOT EXISTS (SELECT 1 FROM public.video_gallery);

-- 3. Populate official social links ONLY if not already configured
UPDATE public.website_settings
SET
  whatsapp_channel_url = COALESCE(NULLIF(trim(whatsapp_channel_url), ''), 'https://whatsapp.com/channel/0029Vb9Ex6jFcovxPAg4go27'),
  facebook_url = COALESCE(NULLIF(trim(facebook_url), ''), 'https://www.facebook.com/share/19hcdyNMri/'),
  instagram_url = COALESCE(NULLIF(trim(instagram_url), ''), 'https://www.instagram.com/rcl_26_?psln=emp0aGV4OHowa2t4')
WHERE id = 1;
