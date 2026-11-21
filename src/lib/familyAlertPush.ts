/**
 * Wording for the family push notification. Dependency-free so the same file is imported by the
 * family-alerts edge function (Deno) and tested here. Deliberately contains no amounts: a push
 * shows on the lock screen, where a family's spending shouldn't be readable at a glance.
 */

export interface DigestRow {
  owner_id: string;
  a_kind: 'budget' | 'large_purchase';
  a_key: string;
  a_member: string;
  a_email: string;
  a_category: string | null;
  a_level: 'near' | 'over' | null;
}

const MAX_LINES = 4;

/** "sara" from "sara@example.com". */
export function nameFromEmail(email: string): string {
  return email.split('@')[0] || email;
}

function line(row: DigestRow): string {
  const name = nameFromEmail(row.a_email);
  if (row.a_kind === 'large_purchase') return `Large purchase by ${name}`;
  const scope = row.a_category ? `${row.a_category} budget` : 'overall budget';
  return row.a_level === 'over' ? `${name} went over their ${scope}` : `${name} is close to their ${scope}`;
}

export function composePush(rows: DigestRow[]): { title: string; body: string } {
  const title = rows.length === 1 ? 'Family alert' : `${rows.length} family alerts`;
  const shown = rows.slice(0, MAX_LINES).map(line);
  const extra = rows.length - shown.length;
  if (extra > 0) shown.push(`and ${extra} more`);
  return { title, body: shown.join(' · ') };
}
