import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, onRequest } from './_middleware.js';

test('www is rewritten to the apex', () => {
  assert.equal(canonicalUrl('https://www.stackd.com.sa/'), 'https://stackd.com.sa/');
  assert.equal(canonicalUrl('https://www.stackd.com.sa/ar/'), 'https://stackd.com.sa/ar/');
});

test('path and query survive the redirect', () => {
  assert.equal(
    canonicalUrl('https://www.stackd.com.sa/en/menu?utm_source=instagram'),
    'https://stackd.com.sa/en/menu?utm_source=instagram',
  );
  assert.equal(
    canonicalUrl('https://www.stackd.com.sa/ar/menu#giants'),
    'https://stackd.com.sa/ar/menu#giants',
  );
});

test('the apex passes through untouched', () => {
  assert.equal(canonicalUrl('https://stackd.com.sa/'), null);
  assert.equal(canonicalUrl('https://stackd.com.sa/ar/'), null);
});

test('pages.dev preview URLs pass through', () => {
  assert.equal(canonicalUrl('https://stackd-7bc.pages.dev/ar/'), null);
  assert.equal(canonicalUrl('https://a2dc14bb.stackd-7bc.pages.dev/ar/'), null);
});

test('hostnames merely starting with the letters www are not touched', () => {
  // "wwwstackd" and "www-stackd" are different hosts, not a www prefix.
  assert.equal(canonicalUrl('https://wwwstackd.com.sa/'), null);
  assert.equal(canonicalUrl('https://www-stackd.com.sa/'), null);
});

test('a WWW prefix in any case is still rewritten', () => {
  assert.equal(canonicalUrl('https://WWW.stackd.com.sa/ar/'), 'https://stackd.com.sa/ar/');
});

test('malformed input is served rather than redirected', () => {
  assert.equal(canonicalUrl('not a url'), null);
  assert.equal(canonicalUrl(''), null);
});

test('onRequest 301s a www request to the apex', () => {
  const res = onRequest({
    request: new Request('https://www.stackd.com.sa/en/menu'),
    next: () => {
      throw new Error('next() must not be called for a www request');
    },
  });
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('Location'), 'https://stackd.com.sa/en/menu');
});

test('onRequest hands apex requests to the next handler', () => {
  const sentinel = new Response('served');
  const res = onRequest({
    request: new Request('https://stackd.com.sa/ar/'),
    next: () => sentinel,
  });
  assert.equal(res, sentinel);
});
