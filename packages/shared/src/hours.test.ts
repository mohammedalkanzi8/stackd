import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STACKD_HOURS,
  isOpenAt,
  isOvernight,
  parseHHMM,
  minutesUntilClose,
  minutesUntilOpen,
  groupHoursForDisplay,
  formatTime,
  type OpeningWindow,
} from './hours.ts';

/**
 * Helper: build a UTC instant from a Riyadh wall-clock time.
 * Riyadh is UTC+3, so 15:00 local == 12:00Z.
 * `day` is a July 2026 date; 2026-07-26 is a Sunday.
 */
function riyadh(day: number, hh: number, mm = 0): Date {
  return new Date(Date.UTC(2026, 6, day, hh - 3, mm));
}

// 2026-07-26 = Sunday(0), 27 = Mon(1), 28 = Tue(2), 29 = Wed(3),
// 30 = Thu(4), 31 = Fri(5), Aug 1 = Sat(6)

test('parseHHMM', () => {
  assert.equal(parseHHMM('00:00'), 0);
  assert.equal(parseHHMM('15:00'), 900);
  assert.equal(parseHHMM('03:00'), 180);
  assert.equal(parseHHMM('23:59'), 1439);
  assert.throws(() => parseHHMM('24:00'));
  assert.throws(() => parseHHMM('12:60'));
  assert.throws(() => parseHHMM('noon'));
});

test('STACKD hours are recognised as overnight', () => {
  for (const w of STACKD_HOURS) assert.equal(isOvernight(w), true);
});

test('a same-day window is not overnight', () => {
  assert.equal(isOvernight({ weekday: 0, opens: '09:00', closes: '17:00' }), false);
});

test('closed before opening time', () => {
  assert.equal(isOpenAt(STACKD_HOURS, riyadh(26, 14, 59)), false);
  assert.equal(isOpenAt(STACKD_HOURS, riyadh(26, 10)), false);
  assert.equal(isOpenAt(STACKD_HOURS, riyadh(26, 6)), false);
});

test('open from the moment it opens', () => {
  assert.equal(isOpenAt(STACKD_HOURS, riyadh(26, 15, 0)), true);
});

test('open through the evening', () => {
  assert.equal(isOpenAt(STACKD_HOURS, riyadh(26, 18)), true);
  assert.equal(isOpenAt(STACKD_HOURS, riyadh(26, 23, 59)), true);
});

/**
 * The regression this module exists for. A naive between-check returns false
 * for every one of these — the busiest hours of the night.
 */
test('open after midnight (the overnight bug)', () => {
  assert.equal(isOpenAt(STACKD_HOURS, riyadh(27, 0, 0)), true);
  assert.equal(isOpenAt(STACKD_HOURS, riyadh(27, 1)), true);
  assert.equal(isOpenAt(STACKD_HOURS, riyadh(27, 2, 59)), true);
});

test('closed exactly at closing time', () => {
  assert.equal(isOpenAt(STACKD_HOURS, riyadh(27, 3, 0)), false);
  assert.equal(isOpenAt(STACKD_HOURS, riyadh(27, 3, 1)), false);
});

test('the Saturday-into-Sunday wrap works', () => {
  // Sat 1 Aug 2026 23:00 -> open via Saturday's row
  assert.equal(isOpenAt(STACKD_HOURS, new Date(Date.UTC(2026, 7, 1, 20, 0))), true);
  // Sun 2 Aug 2026 01:00 -> open via SATURDAY's row (weekday 6, not 0)
  assert.equal(isOpenAt(STACKD_HOURS, new Date(Date.UTC(2026, 7, 1, 22, 0))), true);
});

test('timezone independence: result does not depend on host offset', () => {
  // 2026-07-27T00:30+03:00 == 2026-07-26T21:30Z. Open either way you express it.
  const asUtc = new Date('2026-07-26T21:30:00Z');
  const asOffset = new Date('2026-07-27T00:30:00+03:00');
  assert.equal(asUtc.getTime(), asOffset.getTime());
  assert.equal(isOpenAt(STACKD_HOURS, asUtc), true);
});

test('a branch closed on one day does not leak into that day', () => {
  const mondayOnly: OpeningWindow[] = [{ weekday: 1, opens: '15:00', closes: '03:00' }];
  assert.equal(isOpenAt(mondayOnly, riyadh(26, 18)), false); // Sunday
  assert.equal(isOpenAt(mondayOnly, riyadh(27, 18)), true);  // Monday
  assert.equal(isOpenAt(mondayOnly, riyadh(28, 1)), true);   // Tue 01:00 = Mon's tail
  assert.equal(isOpenAt(mondayOnly, riyadh(28, 18)), false); // Tuesday evening
});

test('minutesUntilClose', () => {
  assert.equal(minutesUntilClose(STACKD_HOURS, riyadh(26, 14)), null); // closed
  // 23:00 -> 4h to 03:00
  assert.equal(minutesUntilClose(STACKD_HOURS, riyadh(26, 23)), 240);
  // 02:30 -> 30 min to 03:00
  assert.equal(minutesUntilClose(STACKD_HOURS, riyadh(27, 2, 30)), 30);
  // 15:00 -> 12h
  assert.equal(minutesUntilClose(STACKD_HOURS, riyadh(26, 15)), 720);
});

test('minutesUntilOpen', () => {
  assert.equal(minutesUntilOpen(STACKD_HOURS, riyadh(26, 18)), null); // already open
  // 14:00 -> opens in 1h
  assert.equal(minutesUntilOpen(STACKD_HOURS, riyadh(26, 14)), 60);
  // 03:00 (just closed) -> reopens at 15:00, 12h later
  assert.equal(minutesUntilOpen(STACKD_HOURS, riyadh(27, 3)), 720);
});

test('groupHoursForDisplay collapses seven identical days into one row', () => {
  const rows = groupHoursForDisplay(STACKD_HOURS);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].weekdays, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(rows[0].opens, '15:00');
});

test('groupHoursForDisplay keeps differing days apart', () => {
  const mixed: OpeningWindow[] = [
    { weekday: 0, opens: '15:00', closes: '03:00' },
    { weekday: 1, opens: '15:00', closes: '03:00' },
    { weekday: 2, opens: '16:00', closes: '02:00' },
  ];
  const rows = groupHoursForDisplay(mixed);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].weekdays, [0, 1]);
  assert.deepEqual(rows[1].weekdays, [2]);
});

test('groupHoursForDisplay does not merge across a gap', () => {
  // Sunday and Tuesday share hours but Monday is closed — must stay separate.
  const gapped: OpeningWindow[] = [
    { weekday: 0, opens: '15:00', closes: '03:00' },
    { weekday: 2, opens: '15:00', closes: '03:00' },
  ];
  const rows = groupHoursForDisplay(gapped);
  assert.equal(rows.length, 2);
});

test('formatTime', () => {
  assert.equal(formatTime('15:00', 'en'), '3 PM');
  assert.equal(formatTime('03:00', 'en'), '3 AM');
  assert.equal(formatTime('00:00', 'en'), '12 AM');
  assert.equal(formatTime('12:00', 'en'), '12 PM');
  assert.equal(formatTime('15:30', 'en'), '3:30 PM');
  assert.equal(formatTime('15:00', 'ar'), '3 م');
  assert.equal(formatTime('03:00', 'ar'), '3 ص');
});
