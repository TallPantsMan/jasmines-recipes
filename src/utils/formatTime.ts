/** "45m" under an hour, "1h" or "1h 30m" from an hour up. */
export function formatMinutes(total: number): string {
  const mins = Math.round(total);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
