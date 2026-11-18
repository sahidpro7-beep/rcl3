-- RCL 2027 Migration 005: Facebook-first Vertical Video Gallery Order
-- Non-destructive migration: preserves all existing records and updates display order only for the seeded videos.

UPDATE public.video_gallery
SET sort_order = 1,
    caption_en = CASE WHEN caption_en = 'RCL Facebook Reel' THEN 'RCL Tournament Reel' ELSE caption_en END,
    caption_bn = CASE WHEN caption_bn = 'আরসিএল ফেসবুক রিল' THEN 'আরসিএল টুর্নামেন্ট রিল' ELSE caption_bn END
WHERE source_url = 'https://www.facebook.com/reel/1118360820808949/';

UPDATE public.video_gallery
SET sort_order = 2
WHERE source_url = 'https://www.youtube.com/watch?v=7XJIGX0qSnI';

UPDATE public.video_gallery
SET sort_order = 3
WHERE source_url = 'https://www.youtube.com/watch?v=_bebjalkgvM';
