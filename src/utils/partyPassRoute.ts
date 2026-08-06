export type PartyPassAction = 'authenticate' | 'rsvp' | 'reserve-cash' | 'ticket' | 'request-approval' | 'view-pass' | 'unavailable';

type PartyAccessMode = 'open-entry' | 'free-rsvp' | 'cash-at-door' | 'paid-ticket' | 'private-approval';

export function partyIDFromURL(rawURL: string): string | null {
  try {
    const url = new URL(rawURL);
    const parts = url.pathname.split('/').filter(Boolean);
    const partyID = parts[0]?.toLowerCase() === 'party' ? parts[1] : null;
    return partyID && parts.length === 2 && partyID.length <= 200 ? partyID : null;
  } catch {
    return null;
  }
}

export function shouldRenderWebPartyPass(rawURL: string): boolean {
  try {
    const url = new URL(rawURL);
    return partyIDFromURL(rawURL) !== null && url.searchParams.get('handoff') !== '1' && url.searchParams.get('source') !== 'app_clip';
  } catch {
    return false;
  }
}

export function partyPassCopy(accessMode: string, action: PartyPassAction | null, cashDoorPriceCents?: number | null) {
  const cashAmount = typeof cashDoorPriceCents === 'number' && cashDoorPriceCents > 0
    ? (cashDoorPriceCents % 100 === 0 ? `$${cashDoorPriceCents / 100}` : `$${(cashDoorPriceCents / 100).toFixed(2)}`)
    : null;
  const mode = accessMode as PartyAccessMode;
  const admission = mode === 'open-entry' ? 'Open entry · no payment'
    : mode === 'free-rsvp' ? 'Free RSVP'
      : mode === 'cash-at-door' ? `Cash at door${cashAmount ? ` · ${cashAmount}` : ''}`
        : mode === 'paid-ticket' ? 'Paid online ticket'
          : 'Host approval required';
  const detail = mode === 'open-entry' ? 'Walk in—no reservation or payment is needed.'
    : mode === 'free-rsvp' ? 'Reserve a free spot for this Party.'
      : mode === 'cash-at-door' ? `Reserve your spot now; ${cashAmount ?? 'cash'} is due at the door.`
        : mode === 'paid-ticket' ? 'Choose an available ticket before secure checkout.'
          : 'Request access and wait for the host to approve it.';
  const primary = action === 'authenticate'
    ? (mode === 'cash-at-door' ? 'Sign in to reserve your spot' : mode === 'paid-ticket' ? 'Sign in to choose a ticket' : mode === 'private-approval' ? 'Sign in to request access' : 'Sign in to RSVP')
    : action === 'rsvp' ? 'RSVP to this Party'
      : action === 'reserve-cash' ? 'Reserve · pay cash at door'
        : action === 'ticket' ? 'Choose a ticket'
          : action === 'request-approval' ? 'Request host approval'
            : action === 'view-pass' ? 'Party Pass confirmed' : 'Party Pass unavailable';
  return { admission, detail, primary };
}