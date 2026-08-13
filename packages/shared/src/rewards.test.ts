import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LOCALES } from './i18n.ts';
import { REWARDS_COPY, fillRewards, rewardsNumber } from './rewards.ts';

/**
 * The earn rate must never be typed into the copy.
 *
 * ⚠ THIS EXACT DRIFT HAS HAPPENED TWICE. The rate lives in
 * `loyalty_settings.earn_percent` and is editable in the admin portal. Both
 * times, raising it left a literal "10%" behind in the headline, the first
 * rewards card, the home-page lede and the printed poster — so the shop was
 * advertising one number on the wall and honouring another at the till.
 *
 * It survived review both times because every check was green: the strings are
 * valid TypeScript, the build succeeds, and the one place that WAS wired up
 * (the ring on the home page) showed the new figure, which made the page look
 * correct at a glance.
 *
 * The `percent` field is the sole exception — it is the template that `{p}`
 * expands into, so it is the one string allowed to carry a percent sign.
 */
test('no rewards copy states the earn rate literally', () => {
  // Any digit next to a percent sign, in either script.
  const literal = /[0-9٠-٩][\s ]*[%٪]/;

  for (const locale of LOCALES) {
    const copy = REWARDS_COPY[locale];
    const fields: [string, string][] = [
      ['headline', copy.headline],
      ['subhead', copy.subhead],
      ['lead', copy.lead],
      ['rate', copy.rate],
      ['fine', copy.fine],
      ['bonus', copy.bonus],
      ...copy.steps.map((s, i): [string, string] => [`steps[${i}]`, s]),
      ...copy.points.flatMap((p, i): [string, string][] => [
        [`points[${i}].title`, p.title],
        [`points[${i}].body`, p.body],
      ]),
    ];

    for (const [name, value] of fields) {
      assert.ok(
        !literal.test(value),
        `${locale}.${name} states a percentage literally — use the {p} token: ${value}`,
      );
    }
  }
});

/**
 * ⚠ The headline is where it matters most and where it broke: the poster finds
 * the offer to set in gold by SEARCHING the headline for the filled token. A
 * headline that does not contain `{p}` cannot be highlighted and, worse, will
 * print whatever number was typed into it.
 */
test('both headlines carry the rate token', () => {
  for (const locale of LOCALES) {
    assert.ok(
      REWARDS_COPY[locale].headline.includes('{p}'),
      `${locale} headline must contain {p}`,
    );
  }
});

/**
 * ⚠ THIS IS THE POSTER BUG, TESTED WHERE IT COSTS NOTHING TO TEST.
 *
 * Poster.tsx sets the offer in gold by taking the filled `percent` token and
 * searching for it inside the headline. When the headline held a literal "10%"
 * and the token was built from the live rate, the search returned -1: the sheet
 * printed the stale number with no highlight, no error and nothing in any log.
 *
 * The invariant is that the two are always built from the same value, and it
 * holds without needing React, a browser or a rendered sheet.
 */
test('the highlight token is findable inside the filled headline', () => {
  for (const locale of LOCALES) {
    for (const rate of [10, 11, 7, 25]) {
      const headline = fillRewards(REWARDS_COPY[locale].headline, locale, { p: rate });
      const token = fillRewards(REWARDS_COPY[locale].percent, locale, { n: rate });
      assert.ok(
        headline.includes(token),
        `${locale} at ${rate}%: headline "${headline}" does not contain the token "${token}"`,
      );
    }
  }
});

test('filling produces the locale numerals and percent sign', () => {
  assert.equal(fillRewards('Get {p} back', 'en', { p: 11 }), 'Get 11% back');
  assert.equal(fillRewards('استرجع {p}', 'ar', { p: 11 }), 'استرجع ١١٪');

  // A count and a rate in one line, which the rewards cards actually do.
  assert.equal(
    fillRewards('{p} back, from {n} points', 'en', { n: 5000, p: 11 }),
    '11% back, from 5000 points',
  );
});

test('every occurrence is replaced, not just the first', () => {
  // `String.replace` with a string pattern replaces once. The rewards cards put
  // the rate in both the title and the body, and an earlier version of this
  // helper would have left the second one as a raw `{p}` on the page.
  assert.equal(fillRewards('{p} and {p}', 'en', { p: 11 }), '11% and 11%');
  assert.equal(fillRewards('{n} then {n}', 'en', { n: 3 }), '3 then 3');
});

test('a token with no value is left alone rather than blanked', () => {
  // Most lines carry one token or neither, so callers pass only what they have.
  // Blanking the other would silently delete words from the copy.
  assert.equal(fillRewards('{p} back, from {n}', 'en', { p: 11 }), '11% back, from {n}');
});

test('filled copy never leaves a stray token behind', () => {
  for (const locale of LOCALES) {
    const copy = REWARDS_COPY[locale];
    const all = [
      copy.headline,
      copy.bonus,
      ...copy.points.map((p) => p.title),
      ...copy.points.map((p) => p.body),
    ];
    for (const line of all) {
      const filled = fillRewards(line, locale, { n: 5000, p: 11 });
      assert.ok(
        !filled.includes('{n}') && !filled.includes('{p}'),
        `${locale}: unfilled token remains in "${filled}"`,
      );
    }
  }
});

test('Arabic copy gets Arabic-Indic digits', () => {
  assert.equal(rewardsNumber('ar', 11), '١١');
  assert.equal(rewardsNumber('en', 11), '11');
  // The joining bonus is the number most likely to be read off a printed sheet
  // by an Arabic speaker, so it must not appear in Western numerals.
  assert.equal(fillRewards('{n} نقطة', 'ar', { n: 100 }), '١٠٠ نقطة');
});
