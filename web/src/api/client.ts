export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

type Options = { method?: string; body?: unknown };

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

// A failed login is also a 401, but it must reach the form instead of triggering a redirect.
const LOGIN_PATH = '/api/login';

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const res = await fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!res.ok) {
    if (res.status === 401 && path !== LOGIN_PATH) onUnauthorized?.();
    throw new ApiError(res.status, data?.error ?? 'error');
  }
  return data as T;
}
