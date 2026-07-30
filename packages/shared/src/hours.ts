/**
 * Opening-hours logic, mirroring `is_branch_open()` in supabase/schema.sql.
 *
 * Needed on the client as well as the server: the website is a static export,
 * so the "Open now" badge has to be computed in the browser.
 *
 * STACKD trades 15:00 → 03:00. That overnight wrap is the whole difficulty here.
 * A naive `opens <= now && now < closes` check is FALSE from midnight to 3 AM —
 * which is peak trade for a late-night street-food place. Every function below
 * treats a window whose close is at or before its open as spanning midnight
 * into the following day.
 */

/** Minutes since local midnight. */
type Minutes = number;

export interface OpeningWindow {
  /** 0 = Sunday, matching Postgres `extract(dow)`. The day the shift STARTS. */
  weekday: number;
  /** "HH:MM", Riyadh local time. */
  opens: string;
  /** "HH:MM". If <= opens, the window runs past midnight into the next day. */
  closes: string;
}

/** Riyadh is UTC+3 year-round — no daylight saving. */
export const RIYADH_UTC_OFFSET_MINUTES = 180;

const MINUTES_PER_DAY = 1440;

export function parseHHMM(hhmm: string): Minutes {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Invalid time "${hhmm}", expected HH:MM`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Time out of range: "${hhmm}"`);
  return h * 60 + min;
}

/** True when the window crosses midnight (close at or before open). */
export function isOvernight(w: OpeningWindow): boolean {
  return parseHHMM(w.closes) <= parseHHMM(w.opens);
}

/**
 * Wall-clock time in Riyadh for a given instant, independent of the host's
 * timezone. Returns weekday (0=Sun) and minutes since local midnight.
 */
export function riyadhClock(at: Date): { weekday: number; minutes: Minutes } {
  const shifted = new Date(at.getTime() + RIYADH_UTC_OFFSET_MINUTES * 60_000);
  return {
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/**
 * Is the branch open at `at`?
 *
 * An overnight window is checked twice: once as the evening leg on its own
 * weekday, and once as the small-hours leg belonging to the PREVIOUS day's row.
 * Missing that second case is the classic bug.
 */
export function isOpenAt(windows: OpeningWindow[], at: Date = new Date()): boolean {
  const { weekday, minutes } = riyadhClock(at);
  const yesterday = (weekday + 6) % 7;

  return windows.some((w) => {
    const opens = parseHHMM(w.opens);
    const closes = parseHHMM(w.closes);

    if (!isOvernight(w)) {
      return w.weekday === weekday && minutes >= opens && minutes < closes;
    }
    // Evening leg — today's row, from opening until midnight.
    if (w.weekday === weekday && minutes >= opens) return true;
    // Small-hours leg — yesterday's row, still running past midnight.
    if (w.weekday === yesterday && minutes < closes) return true;
    return false;
  });
}

/**
 * Minutes until the branch next closes, or null if currently closed.
 * Drives "closing in 20 minutes" warnings on the order screen.
 */
export function minutesUntilClose(
  windows: OpeningWindow[],
  at: Date = new Date(),
): number | null {
  const { weekday, minutes } = riyadhClock(at);
  const yesterday = (weekday + 6) % 7;

  let soonest: number | null = null;
  const consider = (n: number) => {
    if (n >= 0 && (soonest === null || n < soonest)) soonest = n;
  };

  for (const w of windows) {
    const opens = parseHHMM(w.opens);
    const closes = parseHHMM(w.closes);

    if (!isOvernight(w)) {
      if (w.weekday === weekday && minutes >= opens && minutes < closes) {
        consider(closes - minutes);
      }
      continue;
    }
    // Evening leg: close falls tomorrow, so add the rest of today.
    if (w.weekday === weekday && minutes >= opens) {
      consider(MINUTES_PER_DAY - minutes + closes);
    }
    // Small-hours leg: close falls later today.
    if (w.weekday === yesterday && minutes < closes) {
      consider(closes - minutes);
    }
  }
  return soonest;
}

/**
 * Minutes until the branch next opens, or null if already open.
 * Lets the app say "opens in 2h" instead of a bare "Closed".
 */
export function minutesUntilOpen(
  windows: OpeningWindow[],
  at: Date = new Date(),
): number | null {
  if (isOpenAt(windows, at)) return null;
  const { weekday, minutes } = riyadhClock(at);

  let soonest: number | null = null;
  // Look ahead a full week; a branch may not trade every day.
  for (let offset = 0; offset < 8; offset++) {
    const day = (weekday + offset) % 7;
    for (const w of windows) {
      if (w.weekday !== day) continue;
      const delta = offset * MINUTES_PER_DAY + parseHHMM(w.opens) - minutes;
      if (delta > 0 && (soonest === null || delta < soonest)) soonest = delta;
    }
  }
  return soonest;
}

/**
 * Groups consecutive weekdays sharing identical hours into display rows, so
 * "3 PM – 3 AM" seven times over renders as one line instead of seven.
 */
export function groupHoursForDisplay(
  windows: OpeningWindow[],
): Array<{ weekdays: number[]; opens: string; closes: string }> {
  const byDay = new Map<number, OpeningWindow>();
  for (const w of windows) byDay.set(w.weekday, w);

  const rows: Array<{ weekdays: number[]; opens: string; closes: string }> = [];
  for (let d = 0; d < 7; d++) {
    const w = byDay.get(d);
    if (!w) continue;
    const last = rows[rows.length - 1];
    // Only merge if the previous row ended on the immediately preceding day.
    const contiguous = last && last.weekdays[last.weekdays.length - 1] === d - 1;
    if (last && contiguous && last.opens === w.opens && last.closes === w.closes) {
      last.weekdays.push(d);
    } else {
      rows.push({ weekdays: [d], opens: w.opens, closes: w.closes });
    }
  }
  return rows;
}

/** 12-hour clock for display. Arabic uses ص/م rather than AM/PM. */
export function formatTime(hhmm: string, locale: 'en' | 'ar'): string {
  const total = parseHHMM(hhmm);
  const h24 = Math.floor(total / 60);
  const min = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = locale === 'ar' ? (h24 < 12 ? 'ص' : 'م') : h24 < 12 ? 'AM' : 'PM';
  const mm = min === 0 ? '' : `:${String(min).padStart(2, '0')}`;
  return `${h12}${mm} ${suffix}`;
}

/** STACKD North Khobar: 15:00 → 03:00, every day. */
export const STACKD_HOURS: OpeningWindow[] = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  opens: '15:00',
  closes: '03:00',
}));
