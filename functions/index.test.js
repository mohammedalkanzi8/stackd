import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickLocale, onRequest } from './index.js';

test('picks Arabic for Saudi browsers', () => {
  assert.equal(pickLocale('ar-SA,ar;q=0.9,en-US;q=0.8,en;q=0.7'), 'ar');
  assert.equal(pickLocale('ar'), 'ar');
  assert.equal(pickLocale('ar-SA'), 'ar');
});

test('picks English when English genuinely ranks higher', () => {
  assert.equal(pickLocale('en-US,en;q=0.9'), 'en');
  assert.equal(pickLocale('en-GB,en;q=0.9,ar;q=0.5'), 'en');
  assert.equal(pickLocale('en'), 'en');
});

test('quality values decide, not header order', () => {
  // Arabic appears second but outranks English.
  assert.equal(pickLocale('en;q=0.3,ar;q=0.9'), 'ar');
  assert.equal(pickLocale('ar;q=0.2,en;q=0.8'), 'en');
});

test('unsupported languages fall through to the next ranked choice', () => {
  assert.equal(pickLocale('fr-FR,fr;q=0.9,en;q=0.8'), 'en');
  assert.equal(pickLocale('de,fr;q=0.9,ar;q=0.4'), 'ar');
});

test('q=0 means explicitly unacceptable', () => {
  assert.equal(pickLocale('en;q=0,ar;q=0.5'), 'ar');
  // Everything rejected -> fallback.
  assert.equal(pickLocale('en;q=0,ar;q=0'), 'ar');
});

test('wildcard yields the default', () => {
  assert.equal(pickLocale('*'), 'ar');
  assert.equal(pickLocale('fr,*;q=0.5'), 'ar');
});

test('missing or malformed headers fall back to Arabic', () => {
  assert.equal(pickLocale(null), 'ar');
  assert.equal(pickLocale(''), 'ar');
  assert.equal(pickLocale('   '), 'ar');
  assert.equal(pickLocale(',,,'), 'ar');
  assert.equal(pickLocale('en;q=notanumber'), 'ar');
  assert.equal(pickLocale(undefined), 'ar');
  assert.equal(pickLocale(42), 'ar');
});

test('only ever returns a supported locale', () => {
  const headers = [
    'ar-SA,ar;q=0.9', 'en-US', 'fr', '*', '', null, 'zh-CN,zh;q=0.9',
    'en;q=0.1,ar;q=0.2', 'xx-YY', 'ar-EG,en-GB;q=0.8',
  ];
  for (const h of headers) {
    assert.ok(['ar', 'en'].includes(pickLocale(h)), `bad result for ${JSON.stringify(h)}`);
  }
});

test('onRequest returns a 302 to the chosen locale', async () => {
  const res = onRequest({
    request: new Request('https://stackd.com.sa/', {
      headers: { 'Accept-Language': 'en-US,en;q=0.9' },
    }),
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), 'https://stackd.com.sa/en/');
  // Vary matters: without it a cache can serve the wrong locale's redirect.
  assert.equal(res.headers.get('Vary'), 'Accept-Language');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
});

test('onRequest defaults to Arabic with no header', () => {
  const res = onRequest({ request: new Request('https://stackd.com.sa/') });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), 'https://stackd.com.sa/ar/');
});
