import type {
  ApplicationStatus,
  BasePrice,
  PaymentMethod,
  PaymentStatus,
  RegistrationMode,
} from '../types/rcl';

export const DEFAULT_OFFICIAL_LOGO = '/assets/aistudio/IMG_5433_e89caf11.PNG';
export const DEFAULT_HERO_IMAGE = '/src/assets/images/hero_cricket_stadium_1794934674637.jpg';
export const DEFAULT_CHAMPION_2025_LOGO = '/assets/aistudio/46268acd-fe51-4ad3-8e33-91df8e030b1b_a2aa34e5.JPG';
export const DEFAULT_CHAMPION_2026_LOGO = '/assets/aistudio/08539d34-2e37-4005-a23b-d0c1d568e8e5_9c9a0e78.JPG';

export const DEFAULT_WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029Vb9Ex6jFcovxPAg4go27';
export const DEFAULT_FACEBOOK_PAGE_URL = 'https://www.facebook.com/share/19hcdyNMri/';
export const DEFAULT_INSTAGRAM_URL = 'https://www.instagram.com/rcl_26_?psln=emp0aGV4OHowa2t4';

export type AppRoute = '/' | '/register' | '/track' | '/players' | '/admin';

export function resolveAppRoute(pathname: string, hash: string): AppRoute {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  if (cleanPath === '/admin' || hash === '#/admin') return '/admin';
  if (cleanPath === '/register' || hash === '#/register') return '/register';
  if (cleanPath === '/track' || hash === '#/track') return '/track';
  if (cleanPath === '/players' || hash === '#/players') return '/players';
  return '/';
}

export interface ParsedVideoEmbed {
  provider: 'youtube' | 'facebook';
  embedUrl: string;
  externalUrl: string;
  isPortrait: boolean;
}

export function parseVideoEmbed(rawUrl: string | null | undefined): ParsedVideoEmbed | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();
  // Reject raw iframe HTML, javascript URIs, and literal placeholder strings
  if (
    trimmed.toLowerCase().includes('<iframe') ||
    trimmed.toLowerCase().includes('javascript:') ||
    /\[PASTE_/i.test(trimmed)
  ) {
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
  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtube-nocookie.com' ||
    host === 'youtu.be'
  ) {
    let videoId = '';
    if (host === 'youtu.be') {
      videoId = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
    } else if (parsed.pathname === '/watch') {
      videoId = parsed.searchParams.get('v') ?? '';
    } else if (parsed.pathname.startsWith('/embed/') || parsed.pathname.startsWith('/shorts/')) {
      videoId = parsed.pathname.split('/')[2] ?? '';
    }
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null;

    return {
      provider: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&autoplay=0`,
      externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      isPortrait: parsed.pathname.startsWith('/shorts/'),
    };
  }

  // Facebook allowlist
  if (host === 'facebook.com' || host === 'm.facebook.com' || host === 'fb.watch') {
    if (parsed.pathname.startsWith('/plugins/video.php')) {
      const inner = parsed.searchParams.get('href');
      if (!inner) return null;
      return parseVideoEmbed(inner);
    }
    const cleanExternal = `https://www.facebook.com${parsed.pathname}${parsed.search}`;
    const isReel = parsed.pathname.includes('/reel/');
    const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(cleanExternal)}&show_text=false&autoplay=0`;
    return {
      provider: 'facebook',
      embedUrl,
      externalUrl: cleanExternal,
      isPortrait: isReel,
    };
  }

  return null;
}

// FINAL OVERRIDE: Correct UPI ID is 9732865882@ybl (separate from WhatsApp/contact +91 8509044325)
export const OFFICIAL_UPI_ID = '9732865882@ybl';
export const OFFICIAL_RECEIVER_NAME = 'Samir Khan';
export const OFFICIAL_CONTACT_PHONE = '+91 8509044325';
export const OFFICIAL_WHATSAPP_DIGITS = '918509044325';
export const INITIAL_OPENING_DATE_IST = '2026-11-05T00:00:00+05:30';

export const ALLOWED_ROLES = ['Batsman', 'Bowler', 'All-rounder'] as const;
export const ALLOWED_BASE_PRICES: BasePrice[] = [20, 30];
export const ALLOWED_PAYMENT_METHODS: PaymentMethod[] = ['UPI', 'Cash'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function isValidIndianMobile(mobile: string): boolean {
  return /^[6-9]\d{9}$/.test(mobile.trim());
}

export function isValidPlayerId(playerId: string): boolean {
  return /^RCL27-\d{4,}$/.test(playerId.trim().toUpperCase());
}

export function normalizePlayerIdInput(val: string): string {
  return val.toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

export function sanitizeHttpUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function buildUpiPaymentUri(params: {
  upiId: string;
  receiverName: string;
  amount: number;
  note?: string;
}): string {
  const qs = new URLSearchParams({
    pa: params.upiId,
    pn: params.receiverName,
    am: String(params.amount),
    cu: 'INR',
    tn: params.note ?? 'RCL 2027 Season 3 Registration',
  });
  return `upi://pay?${qs.toString()}`;
}

export function buildWhatsAppUrl(phoneDigits: string, message: string): string {
  const digits = phoneDigits.replace(/[^0-9]/g, '');
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

export function evaluateRegistrationWindow(
  params: {
    registration_mode: RegistrationMode;
    registration_open_at: string;
    registration_close_at: string | null;
  },
  nowMs: number = Date.now(),
): boolean {
  if (params.registration_mode === 'force_open') return true;
  if (params.registration_mode === 'force_closed') return false;

  const openMs = new Date(params.registration_open_at).getTime();
  if (Number.isNaN(openMs) || nowMs < openMs) return false;

  if (params.registration_close_at) {
    const closeMs = new Date(params.registration_close_at).getTime();
    if (!Number.isNaN(closeMs) && nowMs > closeMs) return false;
  }

  return true;
}

export function canApproveApplication(paymentStatus: PaymentStatus): boolean {
  return paymentStatus === 'verified';
}

export function canPlayerResubmit(params: {
  applicationStatus: ApplicationStatus;
  isRegistrationOpen: boolean;
  allowClosedCorrection: boolean;
}): boolean {
  if (params.applicationStatus !== 'rejected') return false;
  return params.isRegistrationOpen || params.allowClosedCorrection;
}

export function formatPlayerIdFromSequence(seq: number): string {
  return `RCL27-${String(seq).padStart(4, '0')}`;
}

export async function validateImageFileClient(
  file: File,
): Promise<{ valid: true } | { valid: false; reason: 'type' | 'size' | 'magic' }> {
  const lowerName = file.name.toLowerCase();
  if (
    lowerName.endsWith('.svg') ||
    lowerName.endsWith('.exe') ||
    lowerName.endsWith('.html') ||
    lowerName.endsWith('.js')
  ) {
    return { valid: false, reason: 'type' };
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return { valid: false, reason: 'type' };
  }

  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return { valid: false, reason: 'size' };
  }

  const headerSlice = await file.slice(0, 16).arrayBuffer();
  const bytes = new Uint8Array(headerSlice);
  const isJpg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isWebp =
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  if (!isJpg && !isPng && !isWebp) {
    return { valid: false, reason: 'magic' };
  }

  return { valid: true };
}

/**
 * Protects Excel / spreadsheet CSV exports against formula injection (=, +, -, @, tab, CR).
 */
export function sanitizeCsvCell(value: string | number | boolean | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  const escaped = neutralized.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function buildApplicationsCsv(
  rows: Array<{
    player_id: string;
    player_name: string;
    player_role: string;
    address: string;
    mobile_number: string;
    base_price: number;
    payment_method: string;
    payment_amount: number;
    transaction_id?: string | null;
    payment_status: string;
    application_status: string;
    rejection_reason?: string | null;
    allow_closed_correction?: boolean;
    created_at: string;
  }>,
): string {
  const headers = [
    'Player ID',
    'Player Name',
    'Role',
    'Address',
    'Mobile Number',
    'Base Price (INR)',
    'Payment Method',
    'Payment Amount (INR)',
    'Transaction ID / UTR',
    'Payment Status',
    'Application Status',
    'Rejection Reason',
    'Closed Correction Permitted',
    'Submitted At',
  ];

  const lines = [headers.map(sanitizeCsvCell).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.player_id,
        r.player_name,
        r.player_role,
        r.address,
        r.mobile_number,
        r.base_price,
        r.payment_method,
        r.payment_amount,
        r.transaction_id ?? '',
        r.payment_status,
        r.application_status,
        r.rejection_reason ?? '',
        r.allow_closed_correction ? 'Yes' : 'No',
        r.created_at,
      ]
        .map(sanitizeCsvCell)
        .join(','),
    );
  }

  // Prepend UTF-8 BOM for crisp Bangla & Rupee symbol compatibility in Excel
  return '\uFEFF' + lines.join('\r\n');
}

export function formatIstDateTime(iso: string | null | undefined, locale: 'en' | 'bn'): string {
  if (!iso) return locale === 'bn' ? 'নির্ধারিত নয়' : 'Not set';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-IN' : 'en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
