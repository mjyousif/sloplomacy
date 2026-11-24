import { authedFetch } from './supabase';

/** Where the FastAPI backend is served from. Vite proxies it in development. */
export const API_BASE = '/api';

export type ApiQuery = Record<
  string,
  string | number | boolean | null | undefined
>;

/** Builds an API URL under `API_BASE`, appending non-nullish query parameters. */
export function apiUrl(path: string, query?: ApiQuery): string {
  const base = `${API_BASE}${path}`;
  if (!query) return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined) {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Extracts a string `detail` message from a failed JSON response, returning `fallback`
 * when the body is not JSON or `detail` is missing/non-string (such as 422 error arrays).
 */
export async function readErrorDetail(
  res: Response,
  fallback: string,
): Promise<string> {
  const data = (await res.json().catch(() => null)) as {
    detail?: unknown;
  } | null;
  return typeof data?.detail === 'string' && data.detail.length > 0
    ? data.detail
    : fallback;
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  query?: ApiQuery;
  passcode?: string | null;
  json?: unknown;
  body?: BodyInit | null;
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

/**
 * Wraps `authedFetch` with `apiUrl`, optional `X-Passcode`, and JSON request encoding.
 */
export function apiFetch(
  path: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const { query, passcode, json, headers: rawHeaders, body, ...rest } = options;
  const headers = normalizeHeaders(rawHeaders);
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (passcode) {
    headers['X-Passcode'] = passcode;
  }

  const init: RequestInit = { ...rest };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
  } else if (body !== undefined) {
    init.body = body;
  }
  if (Object.keys(headers).length > 0) {
    init.headers = headers;
  }

  return authedFetch(apiUrl(path, query), init);
}
