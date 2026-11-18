import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  checkRateLimit,
  corsHeaders,
  detectImageMimeFromBytes,
  extForMime,
  jsonResponse,
  MAX_IMAGE_BYTES,
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

    const allowed = await checkRateLimit(adminClient, 'upload_media', req, 20, 15);
    if (!allowed) {
      return jsonResponse({ error: 'Too many uploads. Please wait a few minutes and try again.' }, 429);
    }

    const formData = await req.formData();
    const purpose = String(formData.get('purpose') ?? '');
    const file = formData.get('file');

    if (purpose !== 'player_photo' && purpose !== 'payment_screenshot') {
      return jsonResponse({ error: 'Invalid upload purpose.' }, 400);
    }

    if (!(file instanceof File)) {
      return jsonResponse({ error: 'Image file is required.' }, 400);
    }

    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return jsonResponse({ error: 'Image must be between 1 byte and 5 MB.' }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const detectedMime = detectImageMimeFromBytes(bytes);

    if (!detectedMime) {
      return jsonResponse({ error: 'Only valid JPG, PNG, and WebP images are accepted. SVG and executables are blocked.' }, 400);
    }

    const ext = extForMime(detectedMime);
    const objectId = crypto.randomUUID();
    const storagePath = `${purpose}/${new Date().toISOString().slice(0, 10)}/${objectId}.${ext}`;

    const { error: uploadErr } = await adminClient.storage
      .from('rcl-private-uploads')
      .upload(storagePath, bytes, {
        contentType: detectedMime,
        upsert: false,
      });

    if (uploadErr) {
      return jsonResponse({ error: 'Upload failed. Please try again.' }, 500);
    }

    const { data: tokenRow, error: tokenErr } = await adminClient
      .from('upload_tokens')
      .insert({
        purpose,
        storage_path: storagePath,
        mime_type: detectedMime,
        size_bytes: file.size,
      })
      .select('id, storage_path')
      .single();

    if (tokenErr || !tokenRow) {
      // Clean up orphaned storage object immediately
      await adminClient.storage.from('rcl-private-uploads').remove([storagePath]);
      return jsonResponse({ error: 'Could not register upload token.' }, 500);
    }

    return jsonResponse({
      upload_token: tokenRow.id,
      storage_path: tokenRow.storage_path,
      mime_type: detectedMime,
      size_bytes: file.size,
    });
  } catch {
    return jsonResponse({ error: 'Upload processing error.' }, 500);
  }
});
