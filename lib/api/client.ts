/**
 * API client — every request to the Stoku API goes through apiFetch().
 *
 * Responsibilities:
 *  - attach Authorization (access token) and x-business-id (tenant) headers
 *  - on 401, attempt ONE token refresh (single-flight), then retry the request
 *  - normalize API errors into ApiClientError { status, code, message, details }
 *
 * Base URL: EXPO_PUBLIC_API_URL (see .env.example). On the Android emulator,
 * localhost of your PC is http://10.0.2.2:4000.
 */
import { getSession, setSession, clearSession } from './session';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

const tryRefresh = async (): Promise<boolean> => {
  const { refreshToken } = getSession();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const body = await res.json();
    setSession({ accessToken: body.accessToken, refreshToken: body.refreshToken });
    return true;
  } catch {
    return false;
  }
};

/** Refresh at most once at a time, even if many requests 401 simultaneously. */
const refreshSingleFlight = () => {
  if (!refreshInFlight) {
    refreshInFlight = tryRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Extra headers, e.g. { 'Idempotency-Key': uuid } */
  headers?: Record<string, string>;
}

/** Listeners notified when the session becomes unrecoverable (force logout UI). */
const logoutListeners = new Set<() => void>();
export const onForcedLogout = (fn: () => void) => {
  logoutListeners.add(fn);
  return () => logoutListeners.delete(fn);
};

export const apiFetch = async <T = any>(path: string, options: ApiFetchOptions = {}, retried = false): Promise<T> => {
  const { accessToken, businessId } = getSession();
  const headers: Record<string, string> = { 'content-type': 'application/json', ...options.headers };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (businessId) headers['x-business-id'] = businessId;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiClientError(0, 'NETWORK', `Cannot reach the server at ${API_URL}. Is the API running?`);
  }

  if (res.status === 401 && !retried && !path.startsWith('/api/auth/')) {
    const refreshed = await refreshSingleFlight();
    if (refreshed) return apiFetch<T>(path, options, true);
    clearSession();
    logoutListeners.forEach((fn) => fn());
  }

  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiClientError(res.status, err.code ?? 'UNKNOWN', err.message ?? `Request failed (${res.status})`, err.details);
  }
  return body as T;
};

/** Query-string helper (skips undefined/empty values). */
export const qs = (params: Record<string, any>) => {
  const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  return `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}`;
};
