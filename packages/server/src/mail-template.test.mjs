import { test } from 'node:test';
import assert from 'node:assert/strict';

import { emailHtml, esc } from './mail-template.ts';
import { mailBody } from './mail.ts';
import { REWARDS_MARK_CID, REWARDS_MARK_PNG_BASE64 } from './mail-assets.ts';

test('markup characters in a name cannot break out of the template', () => {
  // Customer names reach these emails from a signup form. Mail clients do run
  // some HTML, so an unescaped name is markup injection into somebody's inbox.
  const html = emailHtml({
    heading: 'Hello',
    blocks: [{ p: 'Hi <script>alert(1)</script> & "friends",' }],
    footer: 'STACKD',
  });
  assert.ok(!html.includes('<script>'), 'a script tag survived into the message');
  assert.ok(html.includes('&lt;script&gt;'), 'the tag was not escaped');
  assert.ok(html.includes('&amp;'), 'ampersand was not escaped');
});

test('esc covers the five characters that matter', () => {
  assert.equal(esc(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
  // Ampersand must be replaced FIRST or the escapes get double-escaped.
  assert.equal(esc('&lt;'), '&amp;lt;');
});

test('the html references the image it actually attaches', () => {
  // ⚠ A cid: that names no attachment renders as a broken image, and nothing
  // errors — the mail sends, looks fine in the log, and arrives damaged.
  const body = mailBody({
    to: 'x@example.com',
    subject: 's',
    text: 'plain',
    html: emailHtml({ heading: 'h', blocks: [{ p: 'body' }], footer: 'f' }),
    images: [
      { cid: REWARDS_MARK_CID, filename: 'mark.png', base64: REWARDS_MARK_PNG_BASE64 },
    ],
  });

  const referenced = [...(body.html ?? '').matchAll(/cid:([^"')\s]+)/g)].map((m) => m[1]);
  const attached = (body.attachments ?? []).map((a) => a.cid);
  assert.ok(referenced.length > 0, 'the template references no image at all');
  for (const cid of referenced) {
    assert.ok(attached.includes(cid), `html references cid:${cid} with no matching attachment`);
  }
});

test('no email loads an image over the network', () => {
  // Remote images are blocked by default in Gmail, Outlook and Apple Mail, so a
  // hosted logo is a broken box until the reader opts in — and asking them to
  // is the tracking-pixel prompt every client is defending against.
  const html = emailHtml({ heading: 'h', blocks: [{ p: 'b' }], footer: 'f' });
  assert.ok(!/<img[^>]+src=["']https?:/i.test(html), 'template loads a remote image');
});

test('a text part is always sent alongside html', () => {
  // Multipart with no text alternative is a spam signal, and it is what a
  // screen reader and a text-only client fall back to.
  const body = mailBody({
    to: 'x@example.com',
    subject: 's',
    text: 'the message in plain words',
    html: '<p>the message</p>',
  });
  assert.equal(body.text, 'the message in plain words');
  assert.ok(body.html);
});

test('attachments are inline, not downloads', () => {
  const body = mailBody({
    to: 'x@example.com',
    subject: 's',
    text: 't',
    images: [{ cid: 'c', filename: 'f.png', base64: REWARDS_MARK_PNG_BASE64 }],
  });
  assert.equal(body.attachments?.[0].contentDisposition, 'inline');
  // Decoded, not left as a base64 string, or the image arrives as text.
  assert.ok(Buffer.isBuffer(body.attachments?.[0].content));
  assert.ok((body.attachments?.[0].content.length ?? 0) > 1000);
});

test('the embedded mark really is a PNG', () => {
  // Guards the generator: an SVG or an empty string here would be invisible
  // until a customer opened the mail.
  const buf = Buffer.from(REWARDS_MARK_PNG_BASE64, 'base64');
  assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'not a PNG signature');
});

test('rtl mail is marked rtl', () => {
  // Arabic set left-to-right strands punctuation on the wrong side of the line,
  // the same failure the portals had.
  const html = emailHtml({ heading: 'مرحبا', blocks: [{ p: 'نص' }], footer: 'ستاكد', dir: 'rtl' });
  assert.ok(html.includes('dir="rtl"'));
  assert.ok(html.includes('lang="ar"'));
});

test('a picture block renders as a cid image, sized for Outlook', () => {
  const html = emailHtml({
    heading: 'New burger',
    blocks: [{ p: 'Hi,' }, { image: { cid: 'promo-pic', alt: 'New burger' } }],
    footer: 'f',
  });
  assert.ok(html.includes('src="cid:promo-pic"'));
  // ⚠ A width ATTRIBUTE as well as CSS. Outlook's Word renderer ignores
  // max-width and prints the image at its intrinsic size, so a 2000px photo
  // would blow the layout apart.
  assert.ok(/<img[^>]+width="456"/.test(html), 'no width attribute for Outlook');
  assert.ok(html.includes('height:auto'), 'aspect ratio not preserved');
  assert.ok(!/<img[^>]+src="https?:/i.test(html), 'the picture is loaded remotely');
});

test('blocks map one-to-one to rows, so nothing phantom is rendered', () => {
  // Image-only is a supported mode: a shop announcing a burger has a photo and
  // little to say. The template must render exactly the blocks it is handed —
  // filtering blank paragraphs is the caller's job, and this proves the
  // template is not quietly adding or dropping one.
  const rows = (blocks) =>
    (emailHtml({ heading: 'h', blocks, footer: 'f' }).match(/<tr><td/g) || []).length;

  // The shell itself contributes a fixed number of rows: mark, eyebrow,
  // heading, the body table's cell, and the footer.
  const shell = rows([]);
  assert.equal(rows([{ p: 'one' }]), shell + 1);
  assert.equal(rows([{ p: 'Hi,' }, { image: { cid: 'c', alt: 'a' } }]), shell + 2);
  assert.equal(rows([{ image: { cid: 'c', alt: 'a' } }]), shell + 1);
});

test('an alt text with markup in it cannot break the img tag', () => {
  const html = emailHtml({
    heading: 'h',
    blocks: [{ image: { cid: 'c', alt: '"><script>alert(1)</script>' } }],
    footer: 'f',
  });
  assert.ok(!html.includes('<script>'), 'markup survived through alt');
  assert.ok(html.includes('&quot;&gt;&lt;script&gt;'));
});
