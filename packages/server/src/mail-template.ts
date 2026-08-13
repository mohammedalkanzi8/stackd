/**
 * The HTML shell every STACKD email is poured into.
 *
 * ⚠ EMAIL HTML IS NOT WEB HTML AND THIS FILE LOOKS DATED ON PURPOSE. Outlook on
 * Windows renders with Word, not a browser. There is no flexbox, no grid, no
 * `<style>` reliability, no `rem`, no shorthand `background`, and external
 * stylesheets are stripped everywhere. Tables and inline `style` attributes are
 * what survives, so tables and inline styles are what this uses.
 *
 * ⚠ DARK MODE INVERTS COLOURS BEHIND YOUR BACK. Apple Mail and Outlook
 * recolour light backgrounds automatically, which turns a carefully chosen
 * light card into something else entirely and can drop dark text onto a dark
 * ground. This template is DARK to begin with, matching the portals, so an
 * inverting client has nothing to improve and mostly leaves it alone.
 *
 * The mark is a `cid:` attachment, never a hosted URL — see the note on
 * `Mail.images`.
 */

import { REWARDS_MARK_CID } from './mail-assets.ts';

/** Brand colours, repeated here because email cannot import a stylesheet. */
const INK = '#0F0F0E';
const CARD = '#1B1C19';
const LINE = '#2E302B';
const TEXT = '#F4F1EA';
const MUTED = '#A8A69C';
const GOLD = '#ECA70F';

export interface EmailBlock {
  /** A paragraph of body copy. */
  p?: string;
  /** A large monospaced code, set apart. */
  code?: string;
  /** A call-to-action button. */
  button?: { label: string; href: string };
}

/**
 * Wraps blocks in the branded shell.
 *
 * `dir` matters: an Arabic mail set left-to-right strands its punctuation on
 * the wrong side of every line, exactly as it does in the portals.
 */
export function emailHtml({
  heading,
  blocks,
  footer,
  dir = 'ltr',
}: {
  heading: string;
  blocks: EmailBlock[];
  /** Small print. Unsubscribe links belong here. */
  footer: string;
  dir?: 'ltr' | 'rtl';
}): string {
  const align = dir === 'rtl' ? 'right' : 'left';
  const font =
    dir === 'rtl'
      ? "'Segoe UI', Tahoma, Arial, sans-serif"
      : "'Segoe UI', Helvetica, Arial, sans-serif";

  const body = blocks
    .map((b) => {
      if (b.code) {
        return `
              <tr><td align="center" style="padding:8px 0 20px;">
                <div style="display:inline-block;background:${INK};border:1px solid ${LINE};border-radius:10px;padding:14px 26px;">
                  <span style="font-family:'SFMono-Regular',Consolas,monospace;font-size:30px;letter-spacing:6px;color:${GOLD};font-weight:700;">${esc(
                    b.code,
                  )}</span>
                </div>
              </td></tr>`;
      }
      if (b.button) {
        return `
              <tr><td align="center" style="padding:6px 0 20px;">
                <a href="${esc(b.button.href)}" style="display:inline-block;background:${GOLD};color:${INK};text-decoration:none;font-weight:700;font-size:15px;padding:13px 30px;border-radius:999px;font-family:${font};">${esc(
                  b.button.label,
                )}</a>
              </td></tr>`;
      }
      return `
              <tr><td align="${align}" style="padding:0 0 16px;font-family:${font};font-size:15px;line-height:1.65;color:${TEXT};">${esc(
                b.p ?? '',
              )}</td></tr>`;
    })
    .join('');

  // The preheader is the grey line a client previews next to the subject. Left
  // empty it scrapes whatever text comes first, which here would be the alt
  // text of the logo.
  return `<!doctype html>
<html dir="${dir}" lang="${dir === 'rtl' ? 'ar' : 'en'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${INK};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:${CARD};border:1px solid ${LINE};border-radius:16px;">
        <tr><td align="center" style="padding:36px 32px 8px;">
          <img src="cid:${REWARDS_MARK_CID}" width="72" height="72" alt="STACKD Rewards"
               style="display:block;border:0;outline:none;border-radius:18px;">
        </td></tr>
        <tr><td align="center" style="padding:14px 32px 4px;font-family:${font};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${GOLD};font-weight:700;">
          STACKD REWARDS
        </td></tr>
        <tr><td align="center" style="padding:6px 32px 22px;font-family:${font};font-size:22px;line-height:1.3;color:${TEXT};font-weight:700;">
          ${esc(heading)}
        </td></tr>
        <tr><td style="padding:0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
        </td></tr>
        <tr><td style="padding:8px 32px 30px;">
          <div style="border-top:1px solid ${LINE};padding-top:16px;font-family:${font};font-size:12px;line-height:1.6;color:${MUTED};text-align:${align};">
            ${footer}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * ⚠ EVERY INTERPOLATED VALUE GOES THROUGH THIS. Customer names reach these
 * templates, and a name containing `<` would otherwise break the markup — or
 * worse, inject it. Mail clients do run some HTML.
 *
 * The footer is the deliberate exception: it is composed here, not by a user,
 * and needs a real `<a>` for the unsubscribe link.
 */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
