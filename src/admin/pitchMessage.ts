type Count = { total: number; last30: number };

export type PitchLink = {
  url: string;
  expiresAt: string;
  numbers: { checkIns: Count; bookingTaps: Count; planAdds: Count; bookedByGuests: Count };
};

/** A message to send a place that is not on Bytspot yet. Only counts above zero are named. */
export function pitchMessage(name: string, link: PitchLink): string {
  const n = link.numbers;
  const parts = ([
    [n.bookingTaps.last30, 'tapped to book'], [n.planAdds.last30, 'added you to a Plan'],
    [n.checkIns.last30, 'checked in at your place'], [n.bookedByGuests.last30, 'said they booked'],
  ] as const).filter(([count]) => count > 0).map(([count, what]) => `${count} ${what}`);
  const lead = parts.length
    ? `In the last 30 days, Bytspot guests ${parts.join(', ')}.`
    : 'Bytspot guests in Atlanta can already find you and add you to their Plans.';
  return `Hi ${name}. ${lead} Take their bookings directly in Bytspot. See the details and join here: ${link.url}`;
}
