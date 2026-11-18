import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  ALLOWED_BASE_PRICES,
  ALLOWED_PAYMENT_METHODS,
  ALLOWED_ROLES,
  checkRateLimit,
  corsHeaders,
  evaluateRegistrationOpen,
  isValidIndianMobile,
  isValidPlayerId,
  isValidUuid,
  jsonResponse,
  sanitizeText,
} from '../_shared/validation.ts';

const AUTH_FAILED_MSG = 'No matching rejected application found for correction.';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    const allowed = await checkRateLimit(adminClient, 'resubmit_application', req, 10, 15);
    if (!allowed) {
      return jsonResponse({ error: 'Too many correction attempts. Please wait a few minutes.' }, 429);
    }

    const body = await req.json();

    // Authenticate correction with CURRENT Player ID + CURRENT mobile number
    const playerId = String(body.player_id ?? '').trim().toUpperCase();
    const currentMobile = String(body.current_mobile_number ?? '').trim();

    if (!isValidPlayerId(playerId) || !isValidIndianMobile(currentMobile)) {
      return jsonResponse({ error: AUTH_FAILED_MSG }, 404);
    }

    const [{ data: existing }, { data: settings }] = await Promise.all([
      adminClient
        .from('applications')
        .select('*')
        .eq('player_id', playerId)
        .eq('mobile_number', currentMobile)
        .maybeSingle(),
      adminClient.from('website_settings').select('*').eq('id', 1).single(),
    ]);

    if (!existing || !settings) {
      return jsonResponse({ error: AUTH_FAILED_MSG }, 404);
    }

    if (existing.application_status !== 'rejected') {
      return jsonResponse({ error: 'Only rejected applications can be corrected and resubmitted.' }, 400);
    }

    const registrationOpen = evaluateRegistrationOpen(settings);
    if (!registrationOpen && existing.allow_closed_correction !== true) {
      return jsonResponse(
        { error: 'Registration is closed. Admin permission is required before resubmitting.' },
        403,
      );
    }

    // Validate new application fields
    const playerName = sanitizeText(body.player_name, 100);
    const playerRole = String(body.player_role ?? '');
    const address = sanitizeText(body.address, 220);
    const newMobile = String(body.mobile_number ?? '').trim();
    const basePrice = Number(body.base_price);
    const paymentMethod = String(body.payment_method ?? '');
    const transactionId = sanitizeText(body.transaction_id, 80) || null;
    const newPhotoToken = body.photo_upload_token ? String(body.photo_upload_token).trim() : null;
    const newScreenshotToken = body.screenshot_upload_token ? String(body.screenshot_upload_token).trim() : null;

    if (playerName.length < 2) return jsonResponse({ error: 'Please enter a valid player name.' }, 400);
    if (!ALLOWED_ROLES.includes(playerRole as (typeof ALLOWED_ROLES)[number])) {
      return jsonResponse({ error: 'Player role must be Batsman, Bowler, or All-rounder.' }, 400);
    }
    if (address.length < 3) return jsonResponse({ error: 'Please enter a valid one-line address.' }, 400);
    if (!isValidIndianMobile(newMobile)) {
      return jsonResponse({ error: 'Please enter a valid 10-digit Indian mobile number.' }, 400);
    }
    if (!ALLOWED_BASE_PRICES.includes(basePrice as (typeof ALLOWED_BASE_PRICES)[number])) {
      return jsonResponse({ error: 'Selected Base Price must be ₹20 or ₹30.' }, 400);
    }
    if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod as (typeof ALLOWED_PAYMENT_METHODS)[number])) {
      return jsonResponse({ error: 'Payment method must be UPI or Cash.' }, 400);
    }

    let nextPhotoPath = existing.photo_path;
    const consumedTokenIds: string[] = [];

    if (newPhotoToken) {
      if (!isValidUuid(newPhotoToken)) return jsonResponse({ error: 'Invalid player photo upload token.' }, 400);
      const { data: photoUpload } = await adminClient
        .from('upload_tokens')
        .select('*')
        .eq('id', newPhotoToken)
        .eq('purpose', 'player_photo')
        .eq('consumed', false)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (!photoUpload) {
        return jsonResponse({ error: 'New player photo expired or invalid. Please upload again.' }, 400);
      }
      nextPhotoPath = photoUpload.storage_path;
      consumedTokenIds.push(newPhotoToken);
    }

    let nextScreenshotPath: string | null = existing.payment_screenshot_path;
    if (newScreenshotToken) {
      if (!isValidUuid(newScreenshotToken)) return jsonResponse({ error: 'Invalid screenshot upload token.' }, 400);
      const { data: ssUpload } = await adminClient
        .from('upload_tokens')
        .select('*')
        .eq('id', newScreenshotToken)
        .eq('purpose', 'payment_screenshot')
        .eq('consumed', false)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (!ssUpload) {
        return jsonResponse({ error: 'New payment screenshot expired or invalid. Please upload again.' }, 400);
      }
      nextScreenshotPath = ssUpload.storage_path;
      consumedTokenIds.push(newScreenshotToken);
    }

    if (paymentMethod === 'Cash') {
      nextScreenshotPath = null;
    } else if (!nextScreenshotPath) {
      return jsonResponse({ error: 'Payment screenshot upload is mandatory for UPI payments.' }, 400);
    }

    const paymentChanged =
      existing.base_price !== basePrice ||
      existing.payment_method !== paymentMethod ||
      Boolean(newScreenshotToken) ||
      (paymentMethod === 'UPI' && (existing.transaction_id ?? null) !== transactionId);

    // Invalidate prior payment verification if any payment detail changed OR if payment was rejected
    const nextPaymentStatus =
      paymentChanged || existing.payment_status === 'rejected'
        ? 'pending_verification'
        : existing.payment_status;

    const nextRevision = Number(existing.revision_count) + 1;

    // Update atomically; consume closed-window permission if registration is closed
    let updateQuery = adminClient
      .from('applications')
      .update({
        player_name: playerName,
        player_role: playerRole,
        address,
        mobile_number: newMobile,
        photo_path: nextPhotoPath,
        base_price: basePrice,
        payment_method: paymentMethod,
        payment_amount: basePrice,
        payment_screenshot_path: nextScreenshotPath,
        transaction_id: paymentMethod === 'UPI' ? transactionId : null,
        historical_upi_id: paymentChanged
          ? (paymentMethod === 'UPI' ? settings.upi_id : null)
          : existing.historical_upi_id,
        historical_receiver_name: paymentChanged
          ? settings.upi_receiver_name
          : existing.historical_receiver_name,
        historical_cash_instructions: paymentChanged
          ? (paymentMethod === 'Cash' ? settings.cash_instructions_en : null)
          : existing.historical_cash_instructions,
        application_status: 'pending_review',
        payment_status: nextPaymentStatus,
        rejection_reason: null,
        allow_closed_correction: registrationOpen ? existing.allow_closed_correction : false,
        revision_count: nextRevision,
      })
      .eq('id', existing.id)
      .eq('application_status', 'rejected');

    if (!registrationOpen) {
      updateQuery = updateQuery.eq('allow_closed_correction', true);
    }

    const { data: updated, error: updateErr } = await updateQuery
      .select('player_id, player_name, player_role, address, mobile_number, base_price, payment_method, payment_amount, transaction_id, application_status, payment_status, allow_closed_correction, revision_count, updated_at')
      .single();

    if (updateErr || !updated) {
      return jsonResponse({ error: 'Correction could not be saved. Please check your status and retry.' }, 409);
    }

    if (consumedTokenIds.length > 0) {
      await adminClient.from('upload_tokens').update({ consumed: true }).in('id', consumedTokenIds);
    }

    if (paymentChanged) {
      await adminClient.from('payment_records').insert({
        application_id: existing.id,
        revision_number: nextRevision,
        payment_method: paymentMethod,
        amount: basePrice,
        upi_id_used: paymentMethod === 'UPI' ? settings.upi_id : null,
        receiver_name_snapshot: settings.upi_receiver_name,
        screenshot_path: nextScreenshotPath,
        transaction_id: paymentMethod === 'UPI' ? transactionId : null,
        status: 'pending_verification',
      });
    }

    await adminClient.from('application_history').insert({
      application_id: existing.id,
      action: 'player_resubmitted',
      actor_type: 'player',
      previous_values: {
        player_name: existing.player_name,
        player_role: existing.player_role,
        address: existing.address,
        mobile_number: existing.mobile_number,
        base_price: existing.base_price,
        payment_method: existing.payment_method,
        payment_status: existing.payment_status,
        rejection_reason: existing.rejection_reason,
      },
      new_values: {
        player_name: playerName,
        player_role: playerRole,
        address,
        mobile_number: newMobile,
        base_price: basePrice,
        payment_method: paymentMethod,
        payment_status: nextPaymentStatus,
        closed_permission_consumed: !registrationOpen,
      },
      note: paymentChanged
        ? 'Player corrected and resubmitted application; payment verification reset.'
        : 'Player corrected and resubmitted application.',
    });

    return jsonResponse({ application: updated });
  } catch {
    return jsonResponse({ error: 'Correction processing error.' }, 500);
  }
});
