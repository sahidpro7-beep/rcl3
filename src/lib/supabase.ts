import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function normalizeSupabaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  // Bare Supabase project ref (e.g. "psykpephkbdwkdeenrvj")
  if (/^[a-z0-9]{15,30}$/i.test(trimmed)) {
    return `https://${trimmed}.supabase.co`;
  }

  // Supabase Dashboard URL (e.g. "https://supabase.com/dashboard/project/<ref>")
  const dashboardMatch = trimmed.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (dashboardMatch?.[1]) {
    return `https://${dashboardMatch[1]}.supabase.co`;
  }

  let normalized = trimmed;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  normalized = normalized.replace(/\/functions\/v1\/?$/i, '').replace(/\/+$/, '');
  return normalized;
}

const supabaseUrl = normalizeSupabaseUrl((import.meta.env?.VITE_SUPABASE_URL as string | undefined) ?? '');
const supabaseAnonKey = (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes('your-project-ref') &&
  !supabaseAnonKey.includes('your-supabase-anon-key');

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

export function getEdgeFunctionUrl(functionName: string): string {
  if (!supabaseUrl) {
    throw new Error('Supabase URL is not configured.');
  }
  return `${supabaseUrl}/functions/v1/${functionName}`;
}

/**
 * Builds Edge Function request headers compatible with both new `sb_publishable_*` keys
 * (sent via `apikey` only unless a user session JWT is present) and legacy JWT `anon` keys.
 */
export function buildEdgeFunctionHeaders(
  publicKey: string,
  accessToken?: string,
  isJsonBody?: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: publicKey,
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (publicKey && !publicKey.startsWith('sb_publishable_')) {
    headers.Authorization = `Bearer ${publicKey}`;
  }

  if (isJsonBody) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

export async function callEdgeFunction<T>(
  functionName: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    formData?: FormData;
    accessToken?: string;
  } = {},
): Promise<T> {
  if (!isSupabaseConfigured) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }

  const isJsonBody = !options.formData && options.body !== undefined;
  const headers = buildEdgeFunctionHeaders(supabaseAnonKey, options.accessToken, isJsonBody);

  let requestBody: BodyInit | undefined;
  if (options.formData) {
    requestBody = options.formData;
  } else if (options.body !== undefined) {
    requestBody = JSON.stringify(options.body);
  }

  const targetUrl = getEdgeFunctionUrl(functionName);
  const res = await fetch(targetUrl, {
    method: options.method ?? 'POST',
    headers,
    body: requestBody,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404 || payload?.code === 'NOT_FOUND') {
      let hostLabel = supabaseUrl;
      try {
        hostLabel = new URL(supabaseUrl).host;
      } catch {
        // Keep raw label if URL parsing fails
      }
      throw new Error(
        `Supabase Edge Function "${functionName}" was not found on "${hostLabel}". Verify VITE_SUPABASE_URL points to your Supabase Project URL (https://<project-ref>.supabase.co) and that all 6 Edge Functions in supabase/functions/ are deployed.`,
      );
    }
    throw new Error(typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`);
  }

  return payload as T;
}
