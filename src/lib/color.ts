// Green -> amber -> red as a ratio approaches (and passes) 100%, interpolated smoothly
// rather than snapping between fixed bands. Shared by BudgetProgress (spend vs. budget)
// and BalanceCard (credit balance vs. limit).
const COLOR_STOPS: { at: number; rgb: [number, number, number] }[] = [
  { at: 0, rgb: [22, 163, 74] }, // brand green
  { at: 60, rgb: [245, 158, 11] }, // amber-500
  { at: 100, rgb: [220, 38, 38] }, // red-600
];

export function progressColor(pct: number): string {
  const clamped = Math.max(0, Math.min(pct, 100));
  const upper = COLOR_STOPS.findIndex((stop) => stop.at >= clamped);
  if (upper <= 0) return `rgb(${COLOR_STOPS[0].rgb.join(',')})`;
  const a = COLOR_STOPS[upper - 1];
  const b = COLOR_STOPS[upper];
  const t = (clamped - a.at) / (b.at - a.at);
  const rgb = a.rgb.map((v, i) => Math.round(v + (b.rgb[i] - v) * t));
  return `rgb(${rgb.join(',')})`;
}
