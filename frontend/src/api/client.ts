import { authedFetch, getAuthHeaders } from '../lib/supabase';

export const API_BASE = '/api';

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export type AuthMode = 'authedFetch' | 'headers' | 'none' | false;

export interface ClientRequestInit
  extends Omit<RequestInit, 'body' | 'headers'> {
  query?: QueryParams;
  body?: unknown;
  headers?: Record<string, string>;
  /**
   * How auth headers are attached:
   * - `'authedFetch'` (default): delegates to `authedFetch`
   * - `'headers'`: resolves `getAuthHeaders()` and calls `fetch`
   * - `'none'` or `false`: calls `fetch` with no auth headers
   */
  auth?: AuthMode;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function apiUrl(path: string, query?: QueryParams): string {
  const base = `${API_BASE}${path}`;
  if (!query) return base;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      parts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
      );
    }
  }
  return parts.length > 0 ? `${base}?${parts.join('&')}` : base;
}

export async function readErrorDetail(
  res: Response,
  fallback: string,
): Promise<string> {
  const err = (await res.json().catch(() => ({}))) as { detail?: string };
  return err.detail || fallback;
}

async function fetchWithAuthHeaders(
  url: string,
  init: RequestInit,
  headers: Record<string, string>,
): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  return fetch(url, {
    ...init,
    headers: { ...headers, ...authHeaders },
  });
}

export function apiFetch(
  path: string,
  options: ClientRequestInit = {},
): Promise<Response> {
  const {
    method,
    query,
    body,
    headers: extraHeaders,
    auth = 'authedFetch',
    ...rest
  } = options;
  const url = apiUrl(path, query);
  const headers: Record<string, string> = { ...extraHeaders };
  if (body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const init: RequestInit = {
    ...rest,
    ...(method && method !== 'GET' ? { method } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  if (auth === false || auth === 'none') {
    return fetch(url, init);
  }
  if (auth === 'headers') {
    return fetchWithAuthHeaders(url, init, headers);
  }
  return authedFetch(url, init);
}

export async function apiJson<T>(
  path: string,
  options: ClientRequestInit = {},
  fallbackError?: string,
): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const detail = await readErrorDetail(
      res,
      fallbackError ?? `Backend returned ${res.status}`,
    );
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}
