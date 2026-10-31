// Port of ../assets/data-client.js for the mobile routes. Same { data, error } results,
// but authenticated with the signed-in bearer token instead of the Access cookie.
export type ApiError = { message: string; code?: string };
export type ApiResult<T> = { data: T | null; error: ApiError | null };
export type Table = 'service_entries' | 'production_entries' | 'email_recipients' | 'email_log';

type Options = {
  baseUrl: string;
  getToken: () => Promise<string | null>;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
};

const SIGNED_OUT: ApiError = { message: 'Your session expired. Sign in again.', code: 'unauthorized' };
const OFFLINE: ApiError = { message: 'Unable to connect. Check your connection and try again.' };

export function createApi({ baseUrl, getToken, onUnauthorized, fetchImpl = fetch }: Options) {
  const root = baseUrl.replace(/\/$/, '') + '/api/mobile';

  async function send(path: string, init: RequestInit = {}): Promise<ApiResult<any>> {
    const token = await getToken();
    if (!token) { onUnauthorized?.(); return { data: null, error: SIGNED_OUT }; }
    let response: Response;
    try {
      response = await fetchImpl(root + path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    } catch { return { data: null, error: OFFLINE }; }
    if (response.status === 401) { onUnauthorized?.(); return { data: null, error: SIGNED_OUT }; }
    if (!response.headers.get('Content-Type')?.includes('application/json')) return { data: null, error: OFFLINE };
    let body;
    try { body = await response.json(); } catch { return { data: null, error: OFFLINE }; }
    if (!response.ok) return { data: null, error: body.error ?? { message: 'Request failed.' } };
    return { data: body, error: null };
  }

  const json = (method: string, payload: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const tablePath = (table: Table, id?: string) => `/data/${encodeURIComponent(table)}${id ? '/' + encodeURIComponent(id) : ''}`;

  return {
    // Follows nextOffset until the server reports the last page, like the website.
    async list<T = Record<string, unknown>>(table: Table): Promise<ApiResult<T[]>> {
      const rows: T[] = [];
      let offset: number | null = 0;
      do {
        const result = await send(tablePath(table) + (offset ? `?offset=${offset}` : ''));
        if (result.error) return { data: null, error: result.error };
        rows.push(...result.data.data);
        offset = result.data.nextOffset;
      } while (offset !== null);
      return { data: rows, error: null };
    },
    async create(table: Table, payload: Record<string, unknown>) {
      const result = await send(tablePath(table), json('POST', payload));
      return { data: result.data?.data ?? null, error: result.error };
    },
    async update(table: Table, id: string, payload: Record<string, unknown>) {
      const result = await send(tablePath(table, id), json('PATCH', payload));
      return { data: result.data?.data ?? null, error: result.error };
    },
    async remove(table: Table, id: string) {
      const result = await send(tablePath(table, id), { method: 'DELETE' });
      return { data: result.data?.data ?? null, error: result.error };
    },
    status(): Promise<ApiResult<{ database: string; preview: boolean; emailEnabled: boolean; planningCenterConfigured: boolean }>> {
      return send('/status');
    },
  };
}
export type Api = ReturnType<typeof createApi>;
