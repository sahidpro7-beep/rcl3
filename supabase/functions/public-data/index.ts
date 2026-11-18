import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, evaluateRegistrationOpen, jsonResponse } from '../_shared/validation.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const [
      { data: settings, error: settingsErr },
      { data: champions, error: championsErr },
      { data: notices, error: noticesErr },
      { data: videos, error: videosErr },
      { data: sponsors, error: sponsorsErr },
      { data: approvedPlayers, error: playersErr },
    ] = await Promise.all([
      adminClient.from('website_settings').select('*').eq('id', 1).single(),
      adminClient.from('past_champions').select('id, slot_order, champion_year, team_name_en, team_name_bn, logo_path').order('slot_order', { ascending: true }),
      adminClient.from('notices_fixtures').select('id, kind, title_en, title_bn, body_en, body_bn, event_date, venue, created_at').eq('is_published', true).order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
      adminClient.from('video_gallery').select('id, provider, source_url, caption_en, caption_bn, sort_order, created_at').eq('is_published', true).order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
      adminClient.from('sponsors').select('id, name, tier_en, tier_bn, website_url, logo_path').eq('is_published', true).order('sort_order', { ascending: true }),
      // Strictly project ONLY the 5 allowed public fields for approved players
      adminClient.from('applications').select('player_id, player_name, public_photo_path, player_role, base_price').eq('application_status', 'approved').order('player_id', { ascending: true }),
    ]);

    if (settingsErr || !settings) {
      return jsonResponse({ error: 'Unable to load tournament settings.' }, 500);
    }

    const toPublicUrl = (path: string | null) => {
      if (!path) return null;
      if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) return path;
      const { data } = adminClient.storage.from('rcl-public-media').getPublicUrl(path);
      return data.publicUrl;
    };

    const safeSettings = {
      tournament_name: settings.tournament_name,
      short_name: settings.short_name,
      season: settings.season,
      tagline_en: settings.tagline_en,
      tagline_bn: settings.tagline_bn,
      contact_name: settings.contact_name,
      contact_phone: settings.contact_phone,
      whatsapp_number: settings.whatsapp_number,
      upi_id: settings.upi_id,
      upi_receiver_name: settings.upi_receiver_name,
      cash_instructions_en: settings.cash_instructions_en,
      cash_instructions_bn: settings.cash_instructions_bn,
      registration_mode: settings.registration_mode,
      registration_open_at: settings.registration_open_at,
      registration_close_at: settings.registration_close_at,
      is_registration_open: evaluateRegistrationOpen(settings),
      whatsapp_channel_url: settings.whatsapp_channel_url,
      facebook_url: settings.facebook_url,
      instagram_url: settings.instagram_url,
      logo_url: toPublicUrl(settings.logo_path),
      hero_image_url: toPublicUrl(settings.hero_image_path),
      about_en: settings.about_en,
      about_bn: settings.about_bn,
      rules_en: settings.rules_en,
      rules_bn: settings.rules_bn,
    };

    const safeChampions = (champions ?? []).map((c) => ({
      ...c,
      logo_url: toPublicUrl(c.logo_path),
    }));

    const safeSponsors = (sponsors ?? []).map((s) => ({
      ...s,
      logo_url: toPublicUrl(s.logo_path),
    }));

    const safePlayers = (approvedPlayers ?? []).map((p) => ({
      player_id: p.player_id,
      player_name: p.player_name,
      player_role: p.player_role,
      base_price: p.base_price,
      photo_url: toPublicUrl(p.public_photo_path),
    }));

    if (championsErr || noticesErr || videosErr || sponsorsErr || playersErr) {
      return jsonResponse({ error: 'Partial data load failure.' }, 500);
    }

    return jsonResponse({
      settings: safeSettings,
      pastChampions: safeChampions,
      notices: notices ?? [],
      videos: videos ?? [],
      sponsors: safeSponsors,
      approvedPlayers: safePlayers,
    });
  } catch {
    return jsonResponse({ error: 'Internal server error.' }, 500);
  }
});
