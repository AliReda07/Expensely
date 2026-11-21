/** Name for the downloaded export, e.g. expensely-data-2026-11-21.json (date in local time). */
export function exportFileName(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `expensely-data-${y}-${m}-${d}.json`;
}

/** Saves `data` as a pretty-printed JSON file through the browser's download. */
export function downloadJson(fileName: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the URL is released.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** True when the typed text matches the account email (case and surrounding spaces ignored). */
export function confirmationMatches(typed: string, email: string | null | undefined): boolean {
  return !!email && typed.trim().toLowerCase() === email.toLowerCase();
}
