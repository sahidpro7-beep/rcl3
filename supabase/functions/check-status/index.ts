import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  checkRateLimit,
  corsHeaders,
  evaluateRegistrationOpen,
  isValidIndianMobile,
  isValidPlayerId,
  jsonResponse,
} from '../_shared/validation.ts';

const GENERIC_NOT_FOUND = 'No matching application found. Please verify your Player ID and 10-digit mobile number.';

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

    const allowed = await checkRateLimit(adminClient, 'check_status', req, 25, 10);
    if (!allowed) {
      return jsonResponse({ error: 'Too many status lookup attempts. Please wait a few minutes.' }, 429);
    }

    const body = await req.json();
    const playerId = String(body.player_id ?? '').trim().toUpperCase();
    const mobileNumber = String(body.mobile_number ?? '').trim();

    if (!isValidPlayerId(playerId) || !isValidIndianMobile(mobileNumber)) {
      return jsonResponse({ error: GENERIC_NOT_FOUND }, 404);
    }

    const [{ data: app }, { data: settings }] = await Promise.all([
      adminClient
        .from('applications')
        .select('id, player_id, player_name, player_role, address, mobile_number, base_price, payment_method, payment_amount, transaction_id, historical_upi_id, historical_receiver_name, historical_cash_instructions, application_status, payment_status, rejection_reason, allow_closed_correction, revision_count, created_at, updated_at')
        .eq('player_id', playerId)
        .eq('mobile_number', mobileNumber)
        .maybeSingle(),
      adminClient.from('website_settings').select('registration_mode, registration_open_at, registration_close_at').eq('id', 1).single(),
    ]);

    if (!app || !settings) {
      return jsonResponse({ error: GENERIC_NOT_FOUND }, 404);
    }

    const registrationOpen = evaluateRegistrationOpen(settings);
    const canResubmit =
      app.application_status === 'rejected' &&
      (registrationOpen || app.allow_closed_correction === true);

    return jsonResponse({
      application: {
        player_id: app.player_id,
        player_name: app.player_name,
        player_role: app.player_role,
        address: app.address,
        mobile_number: app.mobile_number,
        base_price: app.base_price,
        payment_method: app.payment_method,
        payment_amount: app.payment_amount,
        transaction_id: app.transaction_id,
        historical_upi_id: app.historical_upi_id,
        historical_receiver_name: app.historical_receiver_name,
        historical_cash_instructions: app.historical_cash_instructions,
        application_status: app.application_status,
        payment_status: app.payment_status,
        rejection_reason: app.application_status === 'rejected' ? app.rejection_reason : null,
        allow_closed_correction: app.allow_closed_correction,
        revision_count: app.revision_count,
        created_at: app.created_at,
        updated_at: app.updated_at,
      },
      is_registration_open: registrationOpen,
      can_resubmit: canResubmit,
    });
  } catch {
    return jsonResponse({ error: 'Unable to check status right now.' }, 500);
  }
});
