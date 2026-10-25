export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** GETs JSON with a hard timeout. Throws on network errors, timeouts and non-2xx responses. */
export async function getJson(fetchFn: FetchFn, url: string, timeoutMs = 10_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}
