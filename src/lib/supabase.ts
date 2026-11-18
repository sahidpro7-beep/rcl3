import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
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
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${functionName}`;
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

  const res = await fetch(getEdgeFunctionUrl(functionName), {
    method: options.method ?? 'POST',
    headers,
    body: requestBody,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404 || payload?.code === 'NOT_FOUND') {
      throw new Error(
        `Supabase Edge Function "${functionName}" is not deployed yet on your project. Run the SQL migrations (001–005) and deploy the 6 Edge Functions in supabase/functions/.`,
      );
    }
    throw new Error(typeof payload.error === 'string' ? payload.error : `Request failed (${res.status})`);
  }

  return payload as T;
}
