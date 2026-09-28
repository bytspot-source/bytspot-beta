/**
 * A hand-checked OpenTable or Resy link the API attaches to a place. The guest
 * books with the provider; Bytspot is not told the outcome, so a link never
 * claims a booking. Re-checked here so a malformed or foreign link can never
 * become a button.
 */
export interface TableBooking {
  provider: 'opentable' | 'resy';
  label: string;
  url: string;
}

const HOSTS: Record<TableBooking['provider'], { label: string; hosts: string[] }> = {
  opentable: { label: 'OpenTable', hosts: ['opentable.com', 'www.opentable.com'] },
  resy: { label: 'Resy', hosts: ['resy.com'] },
};

export function tableBookingFrom(value: unknown): TableBooking | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { provider, url } = value as Record<string, unknown>;
  const known = typeof provider === 'string' ? HOSTS[provider as TableBooking['provider']] : undefined;
  if (!known || typeof url !== 'string') return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !known.hosts.includes(parsed.hostname)) return undefined;
  } catch {
    return undefined;
  }
  return { provider: provider as TableBooking['provider'], label: known.label, url };
}
