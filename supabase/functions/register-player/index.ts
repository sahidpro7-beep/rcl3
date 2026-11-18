import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  ALLOWED_BASE_PRICES,
  ALLOWED_PAYMENT_METHODS,
  ALLOWED_ROLES,
  checkRateLimit,
  corsHeaders,
  evaluateRegistrationOpen,
  isValidIndianMobile,
  isValidUuid,
  jsonResponse,
  sanitizeText,
} from '../_shared/validation.ts';

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

    const allowed = await checkRateLimit(adminClient, 'register_player', req, 15, 15);
    if (!allowed) {
      return jsonResponse({ error: 'Too many registration requests. Please wait a few minutes.' }, 429);
    }

    const body = await req.json();

    const idempotencyKey = String(body.idempotency_key ?? '').trim();
    if (!isValidUuid(idempotencyKey)) {
      return jsonResponse({ error: 'Invalid submission key. Please refresh and try again.' }, 400);
    }

    // Retry-safe idempotency check BEFORE checking window or consuming uploads
    const { data: existing } = await adminClient
      .from('applications')
      .select('player_id, player_name, base_price, payment_method, payment_amount, application_status, payment_status, created_at')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ application: existing, duplicate_prevented: true });
    }

    // Authoritative server-side registration window enforcement
    const { data: settings, error: settingsErr } = await adminClient
      .from('website_settings')
      .select('*')
      .eq('id', 1)
      .single();

    if (settingsErr || !settings) {
      return jsonResponse({ error: 'Tournament configuration unavailable.' }, 500);
    }

    if (!evaluateRegistrationOpen(settings)) {
      return jsonResponse({ error: 'Player registration is currently closed.' }, 403);
    }

    // Validate player fields
    const playerName = sanitizeText(body.player_name, 100);
    const playerRole = String(body.player_role ?? '');
    const address = sanitizeText(body.address, 220);
    const mobileNumber = String(body.mobile_number ?? '').trim();
    const basePrice = Number(body.base_price);
    const paymentMethod = String(body.payment_method ?? '');
    const transactionId = sanitizeText(body.transaction_id, 80) || null;
    const photoToken = String(body.photo_upload_token ?? '').trim();
    const screenshotToken = body.screenshot_upload_token ? String(body.screenshot_upload_token).trim() : null;
    const publicConsent = body.public_consent_accepted === true;

    if (playerName.length < 2) return jsonResponse({ error: 'Please enter a valid player name.' }, 400);
    if (!ALLOWED_ROLES.includes(playerRole as (typeof ALLOWED_ROLES)[number])) {
      return jsonResponse({ error: 'Player role must be Batsman, Bowler, or All-rounder.' }, 400);
    }
    if (address.length < 3) return jsonResponse({ error: 'Please enter a valid one-line address.' }, 400);
    if (!isValidIndianMobile(mobileNumber)) {
      return jsonResponse({ error: 'Please enter a valid 10-digit Indian mobile number.' }, 400);
    }
    if (!ALLOWED_BASE_PRICES.includes(basePrice as (typeof ALLOWED_BASE_PRICES)[number])) {
      return jsonResponse({ error: 'Selected Base Price must be ₹20 or ₹30.' }, 400);
    }
    if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod as (typeof ALLOWED_PAYMENT_METHODS)[number])) {
      return jsonResponse({ error: 'Payment method must be UPI or Cash.' }, 400);
    }
    if (!publicConsent) {
      return jsonResponse({ error: 'Please acknowledge the public display notice before submitting.' }, 400);
    }
    if (!isValidUuid(photoToken)) {
      return jsonResponse({ error: 'Player photo upload is required.' }, 400);
    }

    // Validate photo upload token
    const { data: photoUpload } = await adminClient
      .from('upload_tokens')
      .select('*')
      .eq('id', photoToken)
      .eq('purpose', 'player_photo')
      .eq('consumed', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (!photoUpload) {
      return jsonResponse({ error: 'Player photo upload expired or invalid. Please re-upload.' }, 400);
    }

    let screenshotPath: string | null = null;
    if (paymentMethod === 'UPI') {
      if (!screenshotToken || !isValidUuid(screenshotToken)) {
        return jsonResponse({ error: 'Payment screenshot upload is mandatory for UPI payments.' }, 400);
      }
      const { data: ssUpload } = await adminClient
        .from('upload_tokens')
        .select('*')
        .eq('id', screenshotToken)
        .eq('purpose', 'payment_screenshot')
        .eq('consumed', false)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (!ssUpload) {
        return jsonResponse({ error: 'Payment screenshot expired or invalid. Please re-upload.' }, 400);
      }
      screenshotPath = ssUpload.storage_path;
    }

    // Insert application (sequential RCL27-XXXX generated by Postgres sequence)
    const { data: inserted, error: insertErr } = await adminClient
      .from('applications')
      .insert({
        idempotency_key: idempotencyKey,
        player_name: playerName,
        player_role: playerRole,
        address,
        mobile_number: mobileNumber,
        photo_path: photoUpload.storage_path,
        base_price: basePrice,
        payment_method: paymentMethod,
        payment_amount: basePrice,
        payment_screenshot_path: screenshotPath,
        transaction_id: paymentMethod === 'UPI' ? transactionId : null,
        historical_upi_id: paymentMethod === 'UPI' ? settings.upi_id : null,
        historical_receiver_name: settings.upi_receiver_name,
        historical_cash_instructions:
          paymentMethod === 'Cash' ? settings.cash_instructions_en : null,
        application_status: 'pending_review',
        payment_status: 'pending_verification',
        public_consent_accepted: true,
      })
      .select('id, player_id, player_name, base_price, payment_method, payment_amount, application_status, payment_status, created_at')
      .single();

    if (insertErr || !inserted) {
      return jsonResponse({ error: 'Unable to save application. Please retry.' }, 500);
    }

    // Consume upload tokens
    const tokenIds =
      paymentMethod === 'UPI' && screenshotToken ? [photoToken, screenshotToken] : [photoToken];
    await adminClient.from('upload_tokens').update({ consumed: true }).in('id', tokenIds);

    // Record payment entry & initial audit trail
    await Promise.all([
      adminClient.from('payment_records').insert({
        application_id: inserted.id,
        revision_number: 1,
        payment_method: paymentMethod,
        amount: basePrice,
        upi_id_used: paymentMethod === 'UPI' ? settings.upi_id : null,
        receiver_name_snapshot: settings.upi_receiver_name,
        screenshot_path: screenshotPath,
        transaction_id: paymentMethod === 'UPI' ? transactionId : null,
        status: 'pending_verification',
      }),
      adminClient.from('application_history').insert({
        application_id: inserted.id,
        action: 'application_submitted',
        actor_type: 'player',
        new_values: {
          player_id: inserted.player_id,
          player_name: playerName,
          player_role: playerRole,
          base_price: basePrice,
          payment_method: paymentMethod,
        },
        note: 'Initial registration submitted.',
      }),
    ]);

    return jsonResponse({
      application: {
        player_id: inserted.player_id,
        player_name: inserted.player_name,
        base_price: inserted.base_price,
        payment_method: inserted.payment_method,
        payment_amount: inserted.payment_amount,
        application_status: inserted.application_status,
        payment_status: inserted.payment_status,
        created_at: inserted.created_at,
      },
    }, 201);
  } catch {
    return jsonResponse({ error: 'Registration processing error.' }, 500);
  }
});
