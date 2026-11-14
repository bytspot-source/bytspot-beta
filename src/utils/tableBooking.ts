/**
 * A hand-checked booking link (OpenTable, Resy, Tock, FareHarbor, …) the API attaches to a place. The guest
 * books with the provider; Bytspot is not told the outcome, so a link never
 * claims a booking. Re-checked here so a malformed or foreign link can never
 * become a button.
 */
/** Same table as the API's services/bookingProviders.ts and the iOS NativeBookingProviders; keep them in step. */
export const BOOKING_PROVIDERS = {
  opentable: { label: 'OpenTable', hosts: ['opentable.com', 'www.opentable.com'], example: 'https://www.opentable.com/r/…' },
  resy: { label: 'Resy', hosts: ['resy.com'], example: 'https://resy.com/cities/…' },
  tock: { label: 'Tock', hosts: ['exploretock.com', 'www.exploretock.com'], example: 'https://www.exploretock.com/…' },
  sevenrooms: { label: 'SevenRooms', hosts: ['sevenrooms.com', 'www.sevenrooms.com'], example: 'https://www.sevenrooms.com/reservations/…' },
  fareharbor: { label: 'FareHarbor', hosts: ['fareharbor.com'], example: 'https://fareharbor.com/embeds/book/…' },
  peek: { label: 'Peek', hosts: ['book.peek.com', 'peek.com', 'www.peek.com'], example: 'https://book.peek.com/s/…' },
  xola: { label: 'Xola', hosts: ['checkout.xola.com', 'xola.com', 'www.xola.com'], example: 'https://checkout.xola.com/…' },
  bookeo: { label: 'Bookeo', hosts: ['bookeo.com', 'www.bookeo.com'], example: 'https://bookeo.com/…' },
  vagaro: { label: 'Vagaro', hosts: ['vagaro.com', 'www.vagaro.com'], example: 'https://www.vagaro.com/…' },
  booksy: { label: 'Booksy', hosts: ['booksy.com'], example: 'https://booksy.com/en-us/…' },
  fresha: { label: 'Fresha', hosts: ['fresha.com', 'www.fresha.com'], example: 'https://www.fresha.com/a/…' },
  mindbody: { label: 'Mindbody', hosts: ['mindbodyonline.com', 'www.mindbodyonline.com', 'clients.mindbodyonline.com'], example: 'https://www.mindbodyonline.com/explore/…' },
  eventbrite: { label: 'Eventbrite', hosts: ['eventbrite.com', 'www.eventbrite.com'], example: 'https://www.eventbrite.com/o/…' },
  dice: { label: 'DICE', hosts: ['dice.fm'], example: 'https://dice.fm/venue/…' },
  parkwhiz: { label: 'ParkWhiz', hosts: ['parkwhiz.com', 'www.parkwhiz.com'], example: 'https://www.parkwhiz.com/p/…' },
  spothero: { label: 'SpotHero', hosts: ['spothero.com'], example: 'https://spothero.com/destination/…' },
  blade: { label: 'Blade', hosts: ['blade.com', 'www.blade.com'], example: 'https://www.blade.com/…' },
  wheelsup: { label: 'Wheels Up', hosts: ['wheelsup.com', 'www.wheelsup.com'], example: 'https://wheelsup.com/…' },
} as const;

export type BookingProvider = keyof typeof BOOKING_PROVIDERS;
export const BOOKING_PROVIDER_IDS = Object.keys(BOOKING_PROVIDERS) as BookingProvider[];

export interface TableBooking {
  provider: BookingProvider;
  label: string;
  url: string;
}

const HOSTS: Record<BookingProvider, { label: string; hosts: readonly string[] }> = BOOKING_PROVIDERS;

export function tableBookingFrom(value: unknown): TableBooking | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { provider, url } = value as Record<string, unknown>;
  const known = typeof provider === 'string' && Object.prototype.hasOwnProperty.call(HOSTS, provider)
    ? HOSTS[provider as BookingProvider] : undefined;
  if (!known || typeof url !== 'string') return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !known.hosts.includes(parsed.hostname)) return undefined;
  } catch {
    return undefined;
  }
  return { provider: provider as TableBooking['provider'], label: known.label, url };
}
