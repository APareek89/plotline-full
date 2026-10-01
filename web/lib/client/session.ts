// UI ordering only. The server independently enforces authentication and ownership.
export type Account = { enabled: boolean; user: { id: string; email: string } | null; csrf: string | null; mode?: { llm: string; media: string } };
export class ApiError extends Error {
  status: number; detail: unknown;
  constructor(status: number, detail: unknown, message: string) { super(message); this.status = status; this.detail = detail; }
}
export function createClientSession(fetcher: typeof fetch, onExpire: () => void = () => {}) {
  let owner: string | null | undefined, generation = 0, csrf = '';
  const pending = new Set<AbortController>();
  const current = (value: number) => value === generation;
  const assert = (value: number) => { if (!current(value)) throw new DOMException('Your account changed.', 'AbortError'); };
  function accept(value: Account, force = false) {
    const next = value.enabled === false ? 'local-fixture' : value.user?.id ?? null;
    if (force || owner !== next) { generation++; for (const controller of pending) controller.abort(); pending.clear(); }
    owner = next; csrf = value.csrf ?? ''; return generation;
  }
  async function request<T>(path: string, options: RequestInit = {}, epoch = generation, kind: 'json' | 'blob' = 'json'): Promise<T> {
    assert(epoch);
    const headers = new Headers(options.headers);
    if (!['GET', 'HEAD', 'OPTIONS'].includes((options.method ?? 'GET').toUpperCase())) {
      if (!csrf) throw new Error('Refresh to prepare your secure session.');
      headers.set('X-Plotline-CSRF', csrf);
      if (!(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    }
    const controller = new AbortController(); pending.add(controller);
    const abort = () => controller.abort(); options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    try {
      const response = await fetcher(path, { ...options, headers, signal: controller.signal, credentials: 'same-origin', cache: 'no-store' });
      assert(epoch);
      if (!response.ok) {
        const data = await response.json().catch(() => ({})); assert(epoch);
        if (response.status === 401 && !path.startsWith('/api/auth/')) {
          accept({ enabled: true, user: null, csrf: null }, true); onExpire();
          throw new DOMException('Your session expired. Sign in again.', 'AbortError');
        }
        const message = typeof data.message === 'string' ? data.message : typeof data.detail === 'string' ? data.detail : response.status === 404 ? 'This item is unavailable in your account.' : 'The request could not be completed. Please try again.';
        throw new ApiError(response.status, data.detail ?? data.error, message);
      }
      const data = kind === 'blob' ? await response.blob() : response.status === 204 ? null : await response.json();
      assert(epoch); return data as T;
    } catch (error) {
      assert(epoch);
      if (error instanceof TypeError) throw new Error('The service is unavailable. Please try again.');
      throw error;
    } finally { pending.delete(controller); options.signal?.removeEventListener('abort', abort); }
  }
  async function read(): Promise<Account> {
    const epoch = generation;
    const response = await fetcher('/api/session', { credentials: 'same-origin', cache: 'no-store' }); assert(epoch);
    if (!response.ok) throw new Error('Account service is unavailable. Please try again.');
    const value = await response.json(); assert(epoch);
    if (typeof value.enabled !== 'boolean' || !('user' in value) || typeof value.csrf !== 'string') throw new Error('Account service returned an unreadable response.');
    accept(value); return value;
  }
  return { accept, capture: () => generation, current, assert, request, read, owner: () => owner };
}
export const session = createClientSession((...args) => fetch(...args), () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('plotline-session-expired'));
});
export function ownerKey(owner: string, kind: string, id: string) { return `plotline:owner:${owner}:${kind}:${id}`; }
export function clearOwnerDrafts(storage: Storage, owner: string) {
  const prefix = `plotline:owner:${owner}:`;
  for (let i = storage.length - 1; i >= 0; i--) { const key = storage.key(i); if (key?.startsWith(prefix)) storage.removeItem(key); }
}
export async function performAuth(action: string, fields: Record<string, string>, origin: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' });
  const token = await response.json().catch(() => ({}));
  if (!response.ok || !token.csrfToken) throw new Error('Could not prepare sign-in. Please try again.');
  const result = await fetcher(`/api/auth/${action}`, {
    method: 'POST', credentials: 'same-origin', redirect: 'error',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
    body: new URLSearchParams({ csrfToken: token.csrfToken, callbackUrl: origin, ...fields }),
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok || typeof data.url !== 'string') throw new Error('Account request was not completed. Please try again.');
  const url = new URL(data.url, origin);
  if (url.searchParams.has('error')) throw new Error('Email or password was not accepted.');
  if (url.origin !== origin) throw new Error('Account redirect was not accepted.');
}

/** A second tab changed the shared cookie. Fence synchronously before reading its identity. */
export function accountChangeNotice(event: { key: string | null }, client: Pick<ReturnType<typeof createClientSession>, "accept">, hide: () => void, refresh: () => void) {
  if (event.key !== "plotline-account-change") return;
  client.accept({ enabled: true, user: null, csrf: null }, true);
  hide(); refresh();
}
