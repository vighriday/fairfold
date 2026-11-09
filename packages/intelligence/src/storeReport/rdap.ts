// Domain age from RDAP (section 10): https://rdap.org/domain/<domain>, 5-second timeout, real domains only.
// Any failure returns null so the caller keeps the stored value.

export const RDAP_TIMEOUT_MS = 5_000;
const RESERVED = ['.example', '.test', '.invalid', '.localhost', '.local'];

export function isRealDomain(domain: string, isSimulated: boolean): boolean {
  const d = domain.trim().toLowerCase();
  if (isSimulated || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return false;
  return !RESERVED.some((suffix) => d.endsWith(suffix));
}

export const rdapUrl = (domain: string) => `https://rdap.org/domain/${encodeURIComponent(domain)}`;

export async function rdapRegisteredAt(
  domain: string,
  fetchFn: typeof fetch,
  timeoutMs = RDAP_TIMEOUT_MS,
): Promise<Date | null> {
  try {
    const res = await fetchFn(rdapUrl(domain), {
      headers: { accept: 'application/rdap+json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      events?: Array<{ eventAction?: string; eventDate?: string }>;
    };
    const registered = body.events?.find((e) => e.eventAction === 'registration')?.eventDate;
    const date = registered ? new Date(registered) : null;
    return date && Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}
