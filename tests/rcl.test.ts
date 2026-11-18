import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHAMPION_2025_LOGO,
  DEFAULT_CHAMPION_2026_LOGO,
  DEFAULT_FACEBOOK_PAGE_URL,
  DEFAULT_INSTAGRAM_URL,
  DEFAULT_WHATSAPP_CHANNEL_URL,
  INITIAL_OPENING_DATE_IST,
  OFFICIAL_CONTACT_PHONE,
  OFFICIAL_RECEIVER_NAME,
  OFFICIAL_UPI_ID,
  OFFICIAL_WHATSAPP_DIGITS,
  buildApplicationsCsv,
  buildUpiPaymentUri,
  buildWhatsAppUrl,
  canApproveApplication,
  canPlayerResubmit,
  evaluateRegistrationWindow,
  formatPlayerIdFromSequence,
  isValidIndianMobile,
  isValidPlayerId,
  parseVideoEmbed,
  resolveAppRoute,
  sanitizeCsvCell,
  sanitizeHttpUrl,
  validateImageFileClient,
} from '../src/lib/validation';
import { getInitialPublicData } from '../src/lib/defaultPublicData';
import {
  TRANSLATIONS,
  getApplicationStatusTextClass,
  getPaymentStatusTextClass,
} from '../src/lib/i18n';
import { buildEdgeFunctionHeaders, normalizeSupabaseUrl } from '../src/lib/supabase';

describe('RCL 2027 Payment & UPI Rules', () => {
  it('uses the overridden official UPI ID 9732865882@ybl and separate WhatsApp/contact +91 8509044325', () => {
    const defaults = getInitialPublicData();
    expect(OFFICIAL_UPI_ID).toBe('9732865882@ybl');
    expect(defaults.settings.upi_id).toBe('9732865882@ybl');
    expect(defaults.settings.upi_receiver_name).toBe(OFFICIAL_RECEIVER_NAME);
    expect(defaults.settings.contact_phone).toBe(OFFICIAL_CONTACT_PHONE);
    expect(defaults.settings.whatsapp_number).toBe(OFFICIAL_WHATSAPP_DIGITS);
  });

  it('builds a properly encoded UPI payment link with exact Base Price amount', () => {
    const uri20 = buildUpiPaymentUri({
      upiId: OFFICIAL_UPI_ID,
      receiverName: OFFICIAL_RECEIVER_NAME,
      amount: 20,
    });
    expect(uri20).toContain('upi://pay?');
    expect(uri20).toContain('pa=9732865882%40ybl');
    expect(uri20).toContain('pn=Samir+Khan');
    expect(uri20).toContain('am=20');
    expect(uri20).toContain('cu=INR');
  });

  it('targets +91 8509044325 for WhatsApp messages', () => {
    const url = buildWhatsAppUrl(OFFICIAL_WHATSAPP_DIGITS, 'Test Player RCL27-0001');
    expect(url).toMatch(/^https:\/\/wa\.me\/918509044325\?text=/);
  });

  it('blocks application approval unless payment is verified', () => {
    expect(canApproveApplication('pending_verification')).toBe(false);
    expect(canApproveApplication('rejected')).toBe(false);
    expect(canApproveApplication('verified')).toBe(true);
  });
});

describe('RCL 2027 Registration Window Rules (Asia/Kolkata)', () => {
  it('opens on 5 November 2026 IST in auto mode with no closing date', () => {
    const beforeOpen = new Date('2026-11-04T23:59:59+05:30').getTime();
    const atOpen = new Date('2026-11-05T00:00:00+05:30').getTime();
    const afterOpen = new Date('2026-11-17T12:00:00+05:30').getTime();

    const cfg = {
      registration_mode: 'auto' as const,
      registration_open_at: INITIAL_OPENING_DATE_IST,
      registration_close_at: null,
    };

    expect(evaluateRegistrationWindow(cfg, beforeOpen)).toBe(false);
    expect(evaluateRegistrationWindow(cfg, atOpen)).toBe(true);
    expect(evaluateRegistrationWindow(cfg, afterOpen)).toBe(true);
  });

  it('enforces optional closing date in auto mode', () => {
    const cfg = {
      registration_mode: 'auto' as const,
      registration_open_at: INITIAL_OPENING_DATE_IST,
      registration_close_at: '2026-11-20T23:59:59+05:30',
    };
    const beforeClose = new Date('2026-11-20T20:00:00+05:30').getTime();
    const afterClose = new Date('2026-11-21T00:00:01+05:30').getTime();
    expect(evaluateRegistrationWindow(cfg, beforeClose)).toBe(true);
    expect(evaluateRegistrationWindow(cfg, afterClose)).toBe(false);
  });

  it('respects force_open and force_closed manual overrides regardless of dates', () => {
    const pastDate = new Date('2026-11-01T10:00:00+05:30').getTime();
    expect(
      evaluateRegistrationWindow(
        {
          registration_mode: 'force_open',
          registration_open_at: '2026-12-01T00:00:00+05:30',
          registration_close_at: null,
        },
        pastDate,
      ),
    ).toBe(true);

    expect(
      evaluateRegistrationWindow(
        {
          registration_mode: 'force_closed',
          registration_open_at: INITIAL_OPENING_DATE_IST,
          registration_close_at: null,
        },
        new Date('2026-11-17T10:00:00+05:30').getTime(),
      ),
    ).toBe(false);
  });
});

describe('Player ID, Validation & Correction Rules', () => {
  it('formats sequential Player IDs as RCL27-0001, RCL27-0002, etc.', () => {
    expect(formatPlayerIdFromSequence(1)).toBe('RCL27-0001');
    expect(formatPlayerIdFromSequence(42)).toBe('RCL27-0042');
    expect(formatPlayerIdFromSequence(1205)).toBe('RCL27-1205');
    expect(isValidPlayerId('RCL27-0001')).toBe(true);
    expect(isValidPlayerId('BAD-12')).toBe(false);
  });

  it('validates 10-digit Indian mobile numbers without enforcing uniqueness', () => {
    expect(isValidIndianMobile('8509044325')).toBe(true);
    expect(isValidIndianMobile('9732865882')).toBe(true);
    expect(isValidIndianMobile('1234567890')).toBe(false);
    expect(isValidIndianMobile('850904432')).toBe(false);
  });

  it('enforces rejection-only and closed-window permission correction rules', () => {
    expect(
      canPlayerResubmit({
        applicationStatus: 'pending_review',
        isRegistrationOpen: true,
        allowClosedCorrection: true,
      }),
    ).toBe(false);

    expect(
      canPlayerResubmit({
        applicationStatus: 'approved',
        isRegistrationOpen: true,
        allowClosedCorrection: true,
      }),
    ).toBe(false);

    expect(
      canPlayerResubmit({
        applicationStatus: 'rejected',
        isRegistrationOpen: true,
        allowClosedCorrection: false,
      }),
    ).toBe(true);

    expect(
      canPlayerResubmit({
        applicationStatus: 'rejected',
        isRegistrationOpen: false,
        allowClosedCorrection: false,
      }),
    ).toBe(false);

    expect(
      canPlayerResubmit({
        applicationStatus: 'rejected',
        isRegistrationOpen: false,
        allowClosedCorrection: true,
      }),
    ).toBe(true);
  });
});

describe('Security: File Magic Bytes, URL Sanitization, and CSV Formula Injection', () => {
  it('neutralizes Excel formula injection characters in CSV cells', () => {
    expect(sanitizeCsvCell('=CMD("calc")')).toBe('"\'=CMD(""calc"")"');
    expect(sanitizeCsvCell('+1+1')).toBe('"\'+1+1"');
    expect(sanitizeCsvCell('-SUM(A1:A2)')).toBe('"\'-SUM(A1:A2)"');
    expect(sanitizeCsvCell('@HYPERLINK("http://evil")')).toBe('"\'@HYPERLINK(""http://evil"")"');
    expect(sanitizeCsvCell('Samir Khan')).toBe('"Samir Khan"');

    const csv = buildApplicationsCsv([
      {
        player_id: 'RCL27-0001',
        player_name: '=2+2',
        player_role: 'Batsman',
        address: 'Raghunathpur',
        mobile_number: '9876543210',
        base_price: 20,
        payment_method: 'UPI',
        payment_amount: 20,
        payment_status: 'verified',
        application_status: 'approved',
        created_at: '2026-11-17T10:00:00Z',
      },
    ]);
    expect(csv).toContain('"\'=2+2"');
  });

  it('rejects javascript: URLs and accepts valid http/https URLs', () => {
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeHttpUrl('#')).toBeNull();
    expect(sanitizeHttpUrl('https://instagram.com/rcl2027')).toBe('https://instagram.com/rcl2027');
  });

  it('validates image magic bytes and rejects SVG/executables/oversized files', async () => {
    const svgFile = new File(['<svg><script>alert(1)</script></svg>'], 'evil.svg', { type: 'image/svg+xml' });
    expect(await validateImageFileClient(svgFile)).toEqual({ valid: false, reason: 'type' });

    // Spoofed MIME with fake bytes
    const fakeJpg = new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00])], 'malware.jpg', {
      type: 'image/jpeg',
    });
    expect(await validateImageFileClient(fakeJpg)).toEqual({ valid: false, reason: 'magic' });

    // Real PNG header
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const validPng = new File([pngBytes], 'player.png', { type: 'image/png' });
    expect(await validateImageFileClient(validPng)).toEqual({ valid: true });
  });

  it('provides complete English and Bangla translations and 2 initial past champions', () => {
    expect(TRANSLATIONS.en.hero.tagline).toBe('6 TEAMS. ONE TROPHY. ONE CHAMPION!');
    expect(TRANSLATIONS.bn.hero.tagline).toBeTruthy();
    const initial = getInitialPublicData();
    expect(initial.pastChampions).toHaveLength(2);
    expect(initial.pastChampions[0].team_name_en).toBe('Ali Knight Rider');
  });

  it('removes visible domain branding and About/Teams navigation while preserving Cash label and DSS Cricket Team', () => {
    const serialized = JSON.stringify(TRANSLATIONS).toLowerCase();
    expect(serialized).not.toContain('rcl.tinbin.in');
    expect(serialized).not.toContain('rcl.in');
    expect(serialized).not.toContain('official domain');
    expect(serialized).not.toContain('cash on delivery');
    expect(serialized).not.toContain('dss cricket group');
    expect(TRANSLATIONS.en.registration.paymentMethods.Cash).toBe('Cash');
    expect(TRANSLATIONS.en.hero.organizedBy).toBe('Organized by DSS Cricket Team');
    expect(TRANSLATIONS.bn.hero.organizedBy).toBe('আয়োজনে: ডিএসএস ক্রিকেট টিম');
    expect(TRANSLATIONS.en.nav.players).toBe('Player List');
    expect(TRANSLATIONS.bn.nav.players).toBe('প্লেয়ার লিস্ট');
    expect('about' in TRANSLATIONS.en.nav).toBe(false);
    expect('about' in TRANSLATIONS.bn.nav).toBe(false);
    expect('teams' in TRANSLATIONS.en.nav).toBe(false);
    expect('teams' in TRANSLATIONS.bn.nav).toBe(false);
  });
});

describe('RCL 2027 Routing, Past Champions, Video Carousel & Official Social Links', () => {
  it('resolves /, /register, /track, /players, and /admin routes including trailing slashes and hashes', () => {
    expect(resolveAppRoute('/', '')).toBe('/');
    expect(resolveAppRoute('/register/', '')).toBe('/register');
    expect(resolveAppRoute('/track', '')).toBe('/track');
    expect(resolveAppRoute('/players/', '')).toBe('/players');
    expect(resolveAppRoute('/admin', '')).toBe('/admin');
    expect(resolveAppRoute('/', '#/players')).toBe('/players');
    expect(resolveAppRoute('/unknown-path', '')).toBe('/');
  });

  it('seeds Past Champions 2025 Ali Knight Rider and 2026 SRCB with matched logos and official social channels', () => {
    const defaults = getInitialPublicData();
    expect(defaults.pastChampions).toHaveLength(2);
    expect(defaults.pastChampions[0]).toMatchObject({
      champion_year: 2025,
      team_name_en: 'Ali Knight Rider',
      logo_url: DEFAULT_CHAMPION_2025_LOGO,
    });
    expect(defaults.pastChampions[1]).toMatchObject({
      champion_year: 2026,
      team_name_en: 'SRCB',
      logo_url: DEFAULT_CHAMPION_2026_LOGO,
    });

    expect(defaults.settings.whatsapp_channel_url).toBe(DEFAULT_WHATSAPP_CHANNEL_URL);
    expect(defaults.settings.facebook_url).toBe(DEFAULT_FACEBOOK_PAGE_URL);
    expect(defaults.settings.instagram_url).toBe(DEFAULT_INSTAGRAM_URL);

    expect(defaults.videos).toHaveLength(3);
    expect(defaults.videos[0]).toMatchObject({
      provider: 'facebook',
      source_url: 'https://www.facebook.com/reel/1118360820808949/',
      sort_order: 1,
    });
    expect(defaults.videos[1]).toMatchObject({
      provider: 'youtube',
      source_url: 'https://www.youtube.com/watch?v=7XJIGX0qSnI',
      sort_order: 2,
    });
    expect(defaults.videos[2]).toMatchObject({
      provider: 'youtube',
      source_url: 'https://www.youtube.com/watch?v=_bebjalkgvM',
      sort_order: 3,
    });

    const enGalleryText = JSON.stringify(TRANSLATIONS.en.gallery).toLowerCase();
    const bnGalleryText = JSON.stringify(TRANSLATIONS.bn.gallery).toLowerCase();
    expect(enGalleryText).not.toContain('embed');
    expect(bnGalleryText).not.toContain('embed');
    expect(enGalleryText).not.toContain('http');
    expect(TRANSLATIONS.en.gallery.watchOnFacebook).toBe('Watch on Facebook');
    expect(TRANSLATIONS.en.gallery.watchOnYoutube).toBe('Watch on YouTube');
  });

  it('converts allowlisted YouTube & Facebook URLs into safe non-autoplay embeds and blocks unsafe inputs', () => {
    const ytWatch = parseVideoEmbed('https://www.youtube.com/watch?v=7XJIGX0qSnI');
    expect(ytWatch).toEqual({
      provider: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/7XJIGX0qSnI?rel=0&autoplay=0',
      externalUrl: 'https://www.youtube.com/watch?v=7XJIGX0qSnI',
      isPortrait: false,
    });

    const ytShort = parseVideoEmbed('https://youtu.be/_bebjalkgvM');
    expect(ytShort?.embedUrl).toBe('https://www.youtube-nocookie.com/embed/_bebjalkgvM?rel=0&autoplay=0');

    const fbReel = parseVideoEmbed('https://www.facebook.com/reel/1118360820808949/');
    expect(fbReel?.provider).toBe('facebook');
    expect(fbReel?.isPortrait).toBe(true);
    expect(fbReel?.embedUrl).toContain('https://www.facebook.com/plugins/video.php?href=');
    expect(fbReel?.embedUrl).toContain('autoplay=0');

    expect(parseVideoEmbed('<iframe src="https://youtube.com/embed/7XJIGX0qSnI"></iframe>')).toBeNull();
    expect(parseVideoEmbed('[PASTE_YOUTUBE_LINK_1]')).toBeNull();
    expect(parseVideoEmbed('https://evil.example.com/watch?v=7XJIGX0qSnI')).toBeNull();
    expect(parseVideoEmbed('javascript:alert(1)')).toBeNull();
  });

  it('sends apikey only for sb_publishable_* keys unless a user JWT access token is provided', () => {
    const pubKey = 'sb_publishable_v4r497Lju9D-ZKeyG6yddQ__-VOgWIm';
    const anonHeaders = buildEdgeFunctionHeaders(pubKey, undefined, true);
    expect(anonHeaders.apikey).toBe(pubKey);
    expect(anonHeaders.Authorization).toBeUndefined();
    expect(anonHeaders['Content-Type']).toBe('application/json');

    const adminHeaders = buildEdgeFunctionHeaders(pubKey, 'user.jwt.token', true);
    expect(adminHeaders.apikey).toBe(pubKey);
    expect(adminHeaders.Authorization).toBe('Bearer user.jwt.token');
  });

  it('requires ₹30 for players above 16 in Transparent Fee Policy and colors pending orange / approved green', () => {
    expect(TRANSLATIONS.en.registration.feeClarityBody).not.toContain('500');
    expect(TRANSLATIONS.en.registration.feeClarityBody).toContain('16');
    expect(TRANSLATIONS.en.registration.feeClarityBody).toContain('₹30');
    expect(TRANSLATIONS.bn.registration.feeClarityBody).not.toContain('৫০০');
    expect(TRANSLATIONS.bn.registration.feeClarityBody).toContain('১৬');
    expect(TRANSLATIONS.bn.registration.feeClarityBody).toContain('₹৩০');

    expect(getApplicationStatusTextClass('pending_review')).toBe('text-orange-600');
    expect(getApplicationStatusTextClass('approved')).toBe('text-green-600');
    expect(getApplicationStatusTextClass('rejected')).toBe('text-red-600');
    expect(getPaymentStatusTextClass('pending_verification')).toBe('text-orange-600');
    expect(getPaymentStatusTextClass('verified')).toBe('text-green-600');
  });

  it('normalizes bare project refs, dashboard URLs, and missing protocols in VITE_SUPABASE_URL', () => {
    expect(normalizeSupabaseUrl('psykpephkbdwkdeenrvj')).toBe('https://psykpephkbdwkdeenrvj.supabase.co');
    expect(normalizeSupabaseUrl('https://supabase.com/dashboard/project/psykpephkbdwkdeenrvj')).toBe(
      'https://psykpephkbdwkdeenrvj.supabase.co',
    );
    expect(normalizeSupabaseUrl('psykpephkbdwkdeenrvj.supabase.co/')).toBe('https://psykpephkbdwkdeenrvj.supabase.co');
    expect(normalizeSupabaseUrl('https://psykpephkbdwkdeenrvj.supabase.co/functions/v1/')).toBe(
      'https://psykpephkbdwkdeenrvj.supabase.co',
    );
  });
});


