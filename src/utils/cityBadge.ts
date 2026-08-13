/** Compact human-readable city label for the home header pill. */
export function formatCityBadge(city: string | null | undefined): string {
  const cleaned = (city ?? '')
    .replace(/^city of\s+/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+(metropolitan area|metro area|metropolitan district|metro district|county|municipality|region|province|state)$/i, '')
    .split(',')[0]
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Nearby';
  // Keep the home header pill short even when a geocoder returns a county,
  // metro, or multi-word administrative label.
  return cleaned.length > 12 ? `${cleaned.slice(0, 11)}…` : cleaned;
}
