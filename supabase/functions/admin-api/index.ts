import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  ALLOWED_BASE_PRICES,
  ALLOWED_PAYMENT_METHODS,
  ALLOWED_ROLES,
  corsHeaders,
  detectImageMimeFromBytes,
  evaluateRegistrationOpen,
  extForMime,
  isValidIndianMobile,
  jsonResponse,
  MAX_IMAGE_BYTES,
  parseAllowedVideoUrl,
  sanitizeHttpUrl,
  sanitizeText,
} from '../_shared/validation.ts';

async function requireMainAdmin(req: Request, supabaseUrl: string, serviceKey: string) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: jsonResponse({ error: 'Unauthorized.' }, 401) };
  }

  const jwt = authHeader.replace('Bearer ', '').trim();
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: authData, error: authErr } = await adminClient.auth.getUser(jwt);
  if (authErr || !authData?.user) {
    return { error: jsonResponse({ error: 'Invalid or expired session.' }, 401) };
  }

  // Server-side Main Admin verification against admin_users table
  const { data: adminRow } = await adminClient
    .from('admin_users')
    .select('user_id, email')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (!adminRow) {
    return { error: jsonResponse({ error: 'Forbidden: Main Admin access required.' }, 403) };
  }

  return { adminClient, user: authData.user };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const auth = await requireMainAdmin(req, supabaseUrl, serviceKey);
  if ('error' in auth) return auth.error;

  const { adminClient, user } = auth;

  try {
    const contentType = req.headers.get('content-type') ?? '';

    // Handle multipart asset upload (team logos, site logo, hero asset, gallery, sponsor logos)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const folder = sanitizeText(formData.get('folder') ?? 'misc', 40).replace(/[^a-z0-9_-]/gi, '');
      const file = formData.get('file');

      if (!(file instanceof File) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
        return jsonResponse({ error: 'Valid image (<= 5 MB) is required.' }, 400);
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = detectImageMimeFromBytes(bytes);
      if (!mime) {
        return jsonResponse({ error: 'Only JPG, PNG, and WebP images are allowed.' }, 400);
      }

      const ext = extForMime(mime);
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await adminClient.storage
        .from('rcl-public-media')
        .upload(path, bytes, { contentType: mime, upsert: false });

      if (uploadErr) {
        return jsonResponse({ error: 'Failed to store public media asset.' }, 500);
      }

      const { data: pub } = adminClient.storage.from('rcl-public-media').getPublicUrl(path);
      return jsonResponse({ path, public_url: pub.publicUrl });
    }

    const body = await req.json();
    const action = String(body.action ?? '');

    if (action === 'verify_admin') {
      return jsonResponse({ ok: true, email: user.email });
    }

    if (action === 'get_dashboard') {
      const [
        { data: apps },
        { data: settings },
        { data: champions },
        { data: notices },
        { data: videos },
        { data: sponsors },
        { data: appHistory },
        { data: settingsAudit },
      ] = await Promise.all([
        adminClient.from('applications').select('*').order('created_at', { ascending: false }),
        adminClient.from('website_settings').select('*').eq('id', 1).single(),
        adminClient.from('past_champions').select('*').order('slot_order', { ascending: true }),
        adminClient.from('notices_fixtures').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
        adminClient.from('video_gallery').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
        adminClient.from('sponsors').select('*').order('sort_order', { ascending: true }),
        adminClient.from('application_history').select('id, application_id, action, actor_type, note, created_at').order('created_at', { ascending: false }).limit(60),
        adminClient.from('settings_audit_log').select('*').order('created_at', { ascending: false }).limit(60),
      ]);

      const list = apps ?? [];
      const counts = {
        total: list.length,
        pending: list.filter((a) => a.application_status === 'pending_review').length,
        approved: list.filter((a) => a.application_status === 'approved').length,
        rejected: list.filter((a) => a.application_status === 'rejected').length,
        paymentPending: list.filter((a) => a.payment_status === 'pending_verification').length,
        paymentVerified: list.filter((a) => a.payment_status === 'verified').length,
        upiTotal: list.filter((a) => a.payment_method === 'UPI').length,
        cashTotal: list.filter((a) => a.payment_method === 'Cash').length,
      };

      const toPub = (p: string | null) => {
        if (!p) return null;
        if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('/')) return p;
        return adminClient.storage.from('rcl-public-media').getPublicUrl(p).data.publicUrl;
      };

      return jsonResponse({
        counts,
        applications: list,
        settings: settings
          ? {
              ...settings,
              is_registration_open: evaluateRegistrationOpen(settings),
              logo_url: toPub(settings.logo_path),
              hero_image_url: toPub(settings.hero_image_path),
            }
          : null,
        pastChampions: (champions ?? []).map((c) => ({ ...c, logo_url: toPub(c.logo_path) })),
        notices: notices ?? [],
        videos: videos ?? [],
        sponsors: (sponsors ?? []).map((s) => ({ ...s, logo_url: toPub(s.logo_path) })),
        appHistory: appHistory ?? [],
        settingsAudit: settingsAudit ?? [],
      });
    }

    if (action === 'get_application_detail') {
      const id = String(body.application_id ?? '');
      const { data: app } = await adminClient.from('applications').select('*').eq('id', id).single();
      if (!app) return jsonResponse({ error: 'Application not found.' }, 404);

      const [{ data: history }, { data: payments }] = await Promise.all([
        adminClient.from('application_history').select('*').eq('application_id', id).order('created_at', { ascending: false }),
        adminClient.from('payment_records').select('*').eq('application_id', id).order('created_at', { ascending: false }),
      ]);

      const photoSigned = app.photo_path
        ? (await adminClient.storage.from('rcl-private-uploads').createSignedUrl(app.photo_path, 900)).data?.signedUrl ?? null
        : null;
      const screenshotSigned = app.payment_screenshot_path
        ? (await adminClient.storage.from('rcl-private-uploads').createSignedUrl(app.payment_screenshot_path, 900)).data?.signedUrl ?? null
        : null;

      return jsonResponse({
        application: app,
        photo_signed_url: photoSigned,
        screenshot_signed_url: screenshotSigned,
        history: history ?? [],
        payments: payments ?? [],
      });
    }

    if (action === 'verify_payment') {
      const id = String(body.application_id ?? '');
      const status = String(body.payment_status ?? '');
      const note = sanitizeText(body.note, 300) || null;

      if (status !== 'verified' && status !== 'rejected' && status !== 'pending_verification') {
        return jsonResponse({ error: 'Invalid payment status.' }, 400);
      }

      const { data: app } = await adminClient.from('applications').select('*').eq('id', id).single();
      if (!app) return jsonResponse({ error: 'Application not found.' }, 404);

      if (app.application_status === 'approved' && status !== 'verified') {
        return jsonResponse({ error: 'Cannot unverify payment on an approved application. Reject the application first.' }, 400);
      }

      const { data: updated, error: updErr } = await adminClient
        .from('applications')
        .update({ payment_status: status })
        .eq('id', id)
        .select('*')
        .single();

      if (updErr) return jsonResponse({ error: updErr.message }, 400);

      await Promise.all([
        adminClient
          .from('payment_records')
          .update({
            status,
            verified_by: user.id,
            verification_note: note,
            verified_at: new Date().toISOString(),
          })
          .eq('application_id', id)
          .eq('revision_number', app.revision_count),
        adminClient.from('application_history').insert({
          application_id: id,
          action: `payment_${status}`,
          actor_type: 'admin',
          actor_id: user.id,
          previous_values: { payment_status: app.payment_status },
          new_values: { payment_status: status },
          note: note ?? `Payment marked as ${status}.`,
        }),
      ]);

      return jsonResponse({ application: updated });
    }

    if (action === 'review_application') {
      const id = String(body.application_id ?? '');
      const nextStatus = String(body.application_status ?? '');
      const rejectionReason = sanitizeText(body.rejection_reason, 500) || null;

      if (nextStatus !== 'approved' && nextStatus !== 'rejected' && nextStatus !== 'pending_review') {
        return jsonResponse({ error: 'Invalid application status.' }, 400);
      }

      const { data: app } = await adminClient.from('applications').select('*').eq('id', id).single();
      if (!app) return jsonResponse({ error: 'Application not found.' }, 404);

      if (nextStatus === 'approved' && app.payment_status !== 'verified') {
        return jsonResponse({ error: 'Application cannot be approved until payment is verified.' }, 400);
      }

      if (nextStatus === 'rejected' && !rejectionReason) {
        return jsonResponse({ error: 'A rejection reason is required when rejecting an application.' }, 400);
      }

      let publicPhotoPath: string | null = app.public_photo_path;

      if (nextStatus === 'approved') {
        // Copy private photo to controlled public directory on approval
        const { data: fileBlob, error: dlErr } = await adminClient.storage
          .from('rcl-private-uploads')
          .download(app.photo_path);

        if (!dlErr && fileBlob) {
          const bytes = new Uint8Array(await fileBlob.arrayBuffer());
          const mime = detectImageMimeFromBytes(bytes) ?? 'image/jpeg';
          const ext = extForMime(mime);
          const targetPath = `approved-players/${app.player_id}.${ext}`;
          await adminClient.storage
            .from('rcl-public-media')
            .upload(targetPath, bytes, { contentType: mime, upsert: true });
          publicPhotoPath = targetPath;
        }
      } else {
        // Remove public copy if moving out of approved state
        if (app.public_photo_path) {
          await adminClient.storage.from('rcl-public-media').remove([app.public_photo_path]);
        }
        publicPhotoPath = null;
      }

      const { data: updated, error: updErr } = await adminClient
        .from('applications')
        .update({
          application_status: nextStatus,
          rejection_reason: nextStatus === 'rejected' ? rejectionReason : null,
          public_photo_path: publicPhotoPath,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (updErr) return jsonResponse({ error: updErr.message }, 400);

      await adminClient.from('application_history').insert({
        application_id: id,
        action: `application_${nextStatus}`,
        actor_type: 'admin',
        actor_id: user.id,
        previous_values: { application_status: app.application_status, rejection_reason: app.rejection_reason },
        new_values: { application_status: nextStatus, rejection_reason: nextStatus === 'rejected' ? rejectionReason : null },
        note: nextStatus === 'rejected' ? rejectionReason : `Application marked ${nextStatus}.`,
      });

      return jsonResponse({ application: updated });
    }

    if (action === 'edit_application') {
      const id = String(body.application_id ?? '');
      const { data: app } = await adminClient.from('applications').select('*').eq('id', id).single();
      if (!app) return jsonResponse({ error: 'Application not found.' }, 404);

      const playerName = sanitizeText(body.player_name, 100);
      const playerRole = String(body.player_role ?? '');
      const address = sanitizeText(body.address, 220);
      const mobileNumber = String(body.mobile_number ?? '').trim();
      const basePrice = Number(body.base_price);
      const paymentMethod = String(body.payment_method ?? '');
      const transactionId = sanitizeText(body.transaction_id, 80) || null;
      const internalNotes = sanitizeText(body.internal_notes, 500) || null;
      const auditNote = sanitizeText(body.audit_note, 300) || 'Admin edited player details.';

      if (playerName.length < 2) return jsonResponse({ error: 'Valid player name required.' }, 400);
      if (!ALLOWED_ROLES.includes(playerRole as (typeof ALLOWED_ROLES)[number])) return jsonResponse({ error: 'Invalid role.' }, 400);
      if (address.length < 3) return jsonResponse({ error: 'Valid address required.' }, 400);
      if (!isValidIndianMobile(mobileNumber)) return jsonResponse({ error: 'Valid 10-digit Indian mobile required.' }, 400);
      if (!ALLOWED_BASE_PRICES.includes(basePrice as (typeof ALLOWED_BASE_PRICES)[number])) return jsonResponse({ error: 'Base Price must be 20 or 30.' }, 400);
      if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod as (typeof ALLOWED_PAYMENT_METHODS)[number])) return jsonResponse({ error: 'Invalid payment method.' }, 400);

      const { data: updated, error: updErr } = await adminClient
        .from('applications')
        .update({
          player_name: playerName,
          player_role: playerRole,
          address,
          mobile_number: mobileNumber,
          base_price: basePrice,
          payment_amount: basePrice,
          payment_method: paymentMethod,
          transaction_id: transactionId,
          internal_notes: internalNotes,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (updErr) return jsonResponse({ error: updErr.message }, 400);

      await adminClient.from('application_history').insert({
        application_id: id,
        action: 'admin_edited',
        actor_type: 'admin',
        actor_id: user.id,
        previous_values: {
          player_name: app.player_name,
          player_role: app.player_role,
          address: app.address,
          mobile_number: app.mobile_number,
          base_price: app.base_price,
          payment_method: app.payment_method,
          transaction_id: app.transaction_id,
        },
        new_values: {
          player_name: playerName,
          player_role: playerRole,
          address,
          mobile_number: mobileNumber,
          base_price: basePrice,
          payment_method: paymentMethod,
          transaction_id: transactionId,
        },
        note: auditNote,
      });

      return jsonResponse({ application: updated });
    }

    if (action === 'toggle_closed_correction') {
      const id = String(body.application_id ?? '');
      const allow = body.allow_closed_correction === true;
      const { data: app } = await adminClient.from('applications').select('*').eq('id', id).single();
      if (!app) return jsonResponse({ error: 'Application not found.' }, 404);

      const { data: updated, error: updErr } = await adminClient
        .from('applications')
        .update({ allow_closed_correction: allow })
        .eq('id', id)
        .select('*')
        .single();

      if (updErr) return jsonResponse({ error: updErr.message }, 400);

      await adminClient.from('application_history').insert({
        application_id: id,
        action: allow ? 'closed_correction_granted' : 'closed_correction_revoked',
        actor_type: 'admin',
        actor_id: user.id,
        previous_values: { allow_closed_correction: app.allow_closed_correction },
        new_values: { allow_closed_correction: allow },
        note: allow ? 'Admin granted closed-window correction permission.' : 'Admin revoked closed-window correction permission.',
      });

      return jsonResponse({ application: updated });
    }

    if (action === 'update_team') {
      const slotNumber = Number(body.slot_number);
      const { data: existing } = await adminClient.from('teams').select('*').eq('slot_number', slotNumber).single();
      if (!existing) return jsonResponse({ error: 'Team slot not found.' }, 404);

      const nameEn = sanitizeText(body.name_en, 120) || 'Team name to be announced';
      const nameBn = sanitizeText(body.name_bn, 120) || 'দলের নাম শীঘ্রই ঘোষণা করা হবে';
      const captainName = sanitizeText(body.captain_name, 100) || null;
      const logoPath = body.logo_path !== undefined ? (sanitizeText(body.logo_path, 300) || null) : existing.logo_path;

      const { data: updated, error: updErr } = await adminClient
        .from('teams')
        .update({ name_en: nameEn, name_bn: nameBn, captain_name: captainName, logo_path: logoPath })
        .eq('slot_number', slotNumber)
        .select('*')
        .single();

      if (updErr) return jsonResponse({ error: updErr.message }, 400);

      await adminClient.from('settings_audit_log').insert({
        entity_type: 'team',
        entity_id: String(slotNumber),
        changed_by: user.id,
        summary: `Updated Team Slot #${slotNumber}: ${nameEn}`,
        previous_values: { name_en: existing.name_en, name_bn: existing.name_bn, logo_path: existing.logo_path },
        new_values: { name_en: nameEn, name_bn: nameBn, logo_path: logoPath },
      });

      return jsonResponse({ team: updated });
    }

    if (action === 'update_settings') {
      const { data: existing } = await adminClient.from('website_settings').select('*').eq('id', 1).single();
      if (!existing) return jsonResponse({ error: 'Settings not found.' }, 500);

      const regMode = ['auto', 'force_open', 'force_closed'].includes(String(body.registration_mode))
        ? String(body.registration_mode)
        : existing.registration_mode;

      const patch = {
        registration_mode: regMode,
        registration_open_at: body.registration_open_at || existing.registration_open_at,
        registration_close_at: body.registration_close_at === '' || body.registration_close_at === null ? null : body.registration_close_at,
        contact_name: sanitizeText(body.contact_name ?? existing.contact_name, 100),
        contact_phone: sanitizeText(body.contact_phone ?? existing.contact_phone, 30),
        whatsapp_number: sanitizeText(body.whatsapp_number ?? existing.whatsapp_number, 20).replace(/[^0-9]/g, ''),
        upi_receiver_name: sanitizeText(body.upi_receiver_name ?? existing.upi_receiver_name, 100),
        upi_id: sanitizeText(body.upi_id ?? existing.upi_id, 100),
        cash_instructions_en: sanitizeText(body.cash_instructions_en ?? existing.cash_instructions_en, 400),
        cash_instructions_bn: sanitizeText(body.cash_instructions_bn ?? existing.cash_instructions_bn, 400),
        whatsapp_channel_url: body.whatsapp_channel_url !== undefined ? sanitizeHttpUrl(body.whatsapp_channel_url) : existing.whatsapp_channel_url,
        facebook_url: body.facebook_url !== undefined ? sanitizeHttpUrl(body.facebook_url) : existing.facebook_url,
        instagram_url: body.instagram_url !== undefined ? sanitizeHttpUrl(body.instagram_url) : existing.instagram_url,
        about_en: typeof body.about_en === 'string' ? body.about_en.trim().slice(0, 3000) : existing.about_en,
        about_bn: typeof body.about_bn === 'string' ? body.about_bn.trim().slice(0, 3000) : existing.about_bn,
        rules_en: typeof body.rules_en === 'string' ? body.rules_en.trim().slice(0, 5000) : existing.rules_en,
        rules_bn: typeof body.rules_bn === 'string' ? body.rules_bn.trim().slice(0, 5000) : existing.rules_bn,
        logo_path: body.logo_path !== undefined ? (sanitizeText(body.logo_path, 300) || null) : existing.logo_path,
        hero_image_path: body.hero_image_path !== undefined ? (sanitizeText(body.hero_image_path, 300) || null) : existing.hero_image_path,
      };

      const { data: updated, error: updErr } = await adminClient
        .from('website_settings')
        .update(patch)
        .eq('id', 1)
        .select('*')
        .single();

      if (updErr) return jsonResponse({ error: updErr.message }, 400);

      await adminClient.from('settings_audit_log').insert({
        entity_type: 'website_settings',
        entity_id: '1',
        changed_by: user.id,
        summary: 'Updated website, registration window, payment, or social settings.',
        previous_values: {
          registration_mode: existing.registration_mode,
          registration_open_at: existing.registration_open_at,
          registration_close_at: existing.registration_close_at,
          upi_id: existing.upi_id,
          upi_receiver_name: existing.upi_receiver_name,
        },
        new_values: {
          registration_mode: patch.registration_mode,
          registration_open_at: patch.registration_open_at,
          registration_close_at: patch.registration_close_at,
          upi_id: patch.upi_id,
          upi_receiver_name: patch.upi_receiver_name,
        },
      });

      return jsonResponse({ settings: updated });
    }

    if (action === 'upsert_notice_fixture') {
      const kind = body.kind === 'fixture' ? 'fixture' : 'notice';
      const titleEn = sanitizeText(body.title_en, 160);
      const titleBn = sanitizeText(body.title_bn, 160) || titleEn;
      const bodyEn = typeof body.body_en === 'string' ? body.body_en.trim().slice(0, 2000) : '';
      const bodyBn = typeof body.body_bn === 'string' ? body.body_bn.trim().slice(0, 2000) : bodyEn;
      const eventDate = body.event_date ? String(body.event_date) : null;
      const venue = sanitizeText(body.venue, 160) || null;
      const isPublished = body.is_published !== false;

      if (!titleEn || !bodyEn) return jsonResponse({ error: 'Title and content are required.' }, 400);

      if (body.id) {
        const { data, error } = await adminClient
          .from('notices_fixtures')
          .update({ kind, title_en: titleEn, title_bn: titleBn, body_en: bodyEn, body_bn: bodyBn, event_date: eventDate, venue, is_published: isPublished })
          .eq('id', String(body.id))
          .select('*')
          .single();
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ item: data });
      }

      const { data, error } = await adminClient
        .from('notices_fixtures')
        .insert({ kind, title_en: titleEn, title_bn: titleBn, body_en: bodyEn, body_bn: bodyBn, event_date: eventDate, venue, is_published: isPublished })
        .select('*')
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ item: data });
    }

    if (action === 'delete_notice_fixture') {
      const { error } = await adminClient.from('notices_fixtures').delete().eq('id', String(body.id ?? ''));
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    if (action === 'update_past_champion') {
      const slotOrder = Number(body.slot_order);
      const championYear = Number(body.champion_year);
      const teamNameEn = sanitizeText(body.team_name_en, 120);
      const teamNameBn = sanitizeText(body.team_name_bn, 120) || teamNameEn;
      if (![1, 2].includes(slotOrder)) return jsonResponse({ error: 'Invalid champion slot.' }, 400);
      if (!Number.isInteger(championYear) || championYear < 2000 || championYear > 2100) {
        return jsonResponse({ error: 'Valid champion year required.' }, 400);
      }
      if (!teamNameEn) return jsonResponse({ error: 'Champion team name is required.' }, 400);

      const { data: existing } = await adminClient.from('past_champions').select('*').eq('slot_order', slotOrder).single();
      if (!existing) return jsonResponse({ error: 'Champion slot not found.' }, 404);

      const logoPath = body.logo_path !== undefined ? (sanitizeText(body.logo_path, 300) || null) : existing.logo_path;

      const { data: updated, error } = await adminClient
        .from('past_champions')
        .update({
          champion_year: championYear,
          team_name_en: teamNameEn,
          team_name_bn: teamNameBn,
          logo_path: logoPath,
        })
        .eq('slot_order', slotOrder)
        .select('*')
        .single();

      if (error) return jsonResponse({ error: error.message }, 400);

      await adminClient.from('settings_audit_log').insert({
        entity_type: 'past_champion',
        entity_id: String(slotOrder),
        changed_by: user.id,
        summary: `Updated Past Champion #${slotOrder}: ${championYear} ${teamNameEn}`,
        previous_values: { champion_year: existing.champion_year, team_name_en: existing.team_name_en, logo_path: existing.logo_path },
        new_values: { champion_year: championYear, team_name_en: teamNameEn, logo_path: logoPath },
      });

      return jsonResponse({ champion: updated });
    }

    if (action === 'upsert_video') {
      const parsed = parseAllowedVideoUrl(body.source_url);
      if (!parsed) {
        return jsonResponse({ error: 'Only valid YouTube or Facebook video URLs are allowed. Raw iframe HTML is not accepted.' }, 400);
      }
      const captionEn = sanitizeText(body.caption_en, 160) || 'RCL Video Highlight';
      const captionBn = sanitizeText(body.caption_bn, 160) || captionEn;
      const sortOrder = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
      const isPublished = body.is_published !== false;

      if (body.id) {
        const { data, error } = await adminClient
          .from('video_gallery')
          .update({
            provider: parsed.provider,
            source_url: parsed.source_url,
            caption_en: captionEn,
            caption_bn: captionBn,
            sort_order: sortOrder,
            is_published: isPublished,
          })
          .eq('id', String(body.id))
          .select('*')
          .single();
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ item: data });
      }

      const { data, error } = await adminClient
        .from('video_gallery')
        .insert({
          provider: parsed.provider,
          source_url: parsed.source_url,
          caption_en: captionEn,
          caption_bn: captionBn,
          sort_order: sortOrder,
          is_published: isPublished,
        })
        .select('*')
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ item: data });
    }

    if (action === 'delete_video') {
      const { error } = await adminClient.from('video_gallery').delete().eq('id', String(body.id ?? ''));
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    if (action === 'add_sponsor') {
      const name = sanitizeText(body.name, 140);
      const tierEn = sanitizeText(body.tier_en, 100) || 'Official Sponsor';
      const tierBn = sanitizeText(body.tier_bn, 100) || 'অফিশিয়াল স্পনসর';
      const websiteUrl = sanitizeHttpUrl(body.website_url);
      const logoPath = sanitizeText(body.logo_path, 300) || null;
      if (!name) return jsonResponse({ error: 'Sponsor name is required.' }, 400);
      const { data, error } = await adminClient
        .from('sponsors')
        .insert({ name, tier_en: tierEn, tier_bn: tierBn, website_url: websiteUrl, logo_path: logoPath, is_published: true })
        .select('*')
        .single();
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ item: data });
    }

    if (action === 'delete_sponsor') {
      const id = String(body.id ?? '');
      const { data: item } = await adminClient.from('sponsors').select('logo_path').eq('id', id).maybeSingle();
      if (item?.logo_path && !item.logo_path.startsWith('/')) {
        await adminClient.storage.from('rcl-public-media').remove([item.logo_path]);
      }
      const { error } = await adminClient.from('sponsors').delete().eq('id', id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Unknown admin action.' }, 400);
  } catch {
    return jsonResponse({ error: 'Admin operation failed.' }, 500);
  }
});
