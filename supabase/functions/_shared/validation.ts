// Shared server-side validation, magic-byte inspection, rate limiting, and window checks
// Used by all RCL 2027 Supabase Edge Functions (Deno runtime).

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export const ALLOWED_ROLES = ['Batsman', 'Bowler', 'All-rounder'] as const;
export const ALLOWED_BASE_PRICES = [20, 30] as const;
export const ALLOWED_PAYMENT_METHODS = ['UPI', 'Cash'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export function isValidIndianMobile(mobile: string): boolean {
  return /^[6-9]\d{9}$/.test(mobile.trim());
}

export function isValidPlayerId(playerId: string): boolean {
  return /^RCL27-\d{4,}$/.test(playerId.trim().toUpperCase());
}

export function isValidUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

export function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLen);
}

export function sanitizeHttpUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function parseAllowedVideoUrl(
  rawUrl: unknown,
): { provider: 'youtube' | 'facebook'; source_url: string } | null {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();
  if (trimmed.toLowerCase().includes('<iframe') || trimmed.toLowerCase().includes('javascript:')) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

  // YouTube allowlist
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    let videoId = '';
    if (host === 'youtu.be') {
      videoId = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    } else if (parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v') ?? '';
    } else if (parsed.pathname.startsWith('/embed/') || parsed.pathname.startsWith('/shorts/')) {
      videoId = parsed.pathname.split('/')[2] ?? '';
    }
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;
    return { provider: 'youtube', source_url: `https://www.youtube.com/watch?v=${videoId}` };
  }

  // Facebook allowlist
  if (host === 'facebook.com' || host === 'm.facebook.com' || host === 'fb.watch') {
    if (parsed.pathname.startsWith('/plugins/video.php')) {
      const inner = parsed.searchParams.get('href');
      if (!inner) return null;
      return parseAllowedVideoUrl(inner);
    }
    return { provider: 'facebook', source_url: `https://${host}${parsed.pathname}${parsed.search}` };
  }

  return null;
}

/**
 * Inspect actual file magic bytes to guarantee JPG, PNG, or WebP only.
 * Rejects SVG, HTML, executables, and spoofed extensions.
 */
export function detectImageMimeFromBytes(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

export function extForMime(mime: 'image/jpeg' | 'image/png' | 'image/webp'): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  return 'webp';
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') ?? 'unknown';
}

// deno-lint-ignore no-explicit-any
export async function checkRateLimit(
  // deno-lint-ignore no-explicit-any
  adminClient: any,
  action: string,
  req: Request,
  maxRequests: number,
  windowMinutes: number,
): Promise<boolean> {
  const ipHash = await sha256Hex(`${action}:${getClientIp(req)}`);
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const { count } = await adminClient
    .from('rate_limit_events')
    .select('id', { count: 'exact', head: true })
    .eq('action', action)
    .eq('ip_hash', ipHash)
    .gte('created_at', since);

  if ((count ?? 0) >= maxRequests) {
    return false;
  }

  await adminClient.from('rate_limit_events').insert({ action, ip_hash: ipHash });
  return true;
}

export function evaluateRegistrationOpen(settings: {
  registration_mode: string;
  registration_open_at: string;
  registration_close_at: string | null;
}): boolean {
  if (settings.registration_mode === 'force_open') return true;
  if (settings.registration_mode === 'force_closed') return false;

  const nowMs = Date.now();
  const openMs = new Date(settings.registration_open_at).getTime();
  if (Number.isNaN(openMs) || nowMs < openMs) return false;

  if (settings.registration_close_at) {
    const closeMs = new Date(settings.registration_close_at).getTime();
    if (!Number.isNaN(closeMs) && nowMs > closeMs) return false;
  }

  return true;
}
