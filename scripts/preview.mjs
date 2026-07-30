/**
 * Builds a single self-contained HTML preview from the real static export, so
 * the site can be reviewed and shared before hosting exists.
 *
 * This is a REVIEW HARNESS, not a second copy of the site. Every panel's markup
 * is lifted verbatim from `apps/web/out/`, and the stylesheet is the real one —
 * so the preview cannot drift from what actually deploys. Run it after a build:
 *
 *   npm run build && node scripts/preview.mjs
 *
 * Two things differ from production, both unavoidable in a single file:
 *  - Next's JS chunks are dropped, so the live "Open now" pill is reimplemented
 *    below in vanilla JS against the same 15:00-03:00 window.
 *  - Internal <a href> navigation is inert; the panel switcher replaces it.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'apps/web/out');

const PANELS = [
  { id: 'ar-home', label: 'الرئيسية', sub: 'AR · Home', path: 'ar/index.html', lang: 'ar', dir: 'rtl' },
  { id: 'ar-menu', label: 'قائمة الطعام', sub: 'AR · Menu', path: 'ar/menu/index.html', lang: 'ar', dir: 'rtl' },
  { id: 'ar-visit', label: 'زورونا', sub: 'AR · Visit', path: 'ar/visit/index.html', lang: 'ar', dir: 'rtl' },
  { id: 'en-home', label: 'Home', sub: 'EN · Home', path: 'en/index.html', lang: 'en', dir: 'ltr' },
  { id: 'en-menu', label: 'Menu', sub: 'EN · Menu', path: 'en/menu/index.html', lang: 'en', dir: 'ltr' },
  { id: 'en-visit', label: 'Visit', sub: 'EN · Visit', path: 'en/visit/index.html', lang: 'en', dir: 'ltr' },
];

/** Pull the real compiled stylesheet out of the export. */
function readCss() {
  const cssDir = join(out, '_next/static/css');
  const files = readdirSync(cssDir).filter((f) => f.endsWith('.css'));
  if (files.length === 0) throw new Error('No CSS found in the export — run the build first.');
  return files.map((f) => readFileSync(join(cssDir, f), 'utf8')).join('\n');
}

/**
 * Extract the rendered page content: everything inside <body>, minus Next's
 * <script> tags and its hydration payload, which cannot run standalone.
 */
function extractBody(html) {
  const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  if (!m) throw new Error('No <body> found');
  return m[1]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<template[\s\S]*?<\/template>/gi, '')
    .trim();
}

/**
 * The token block lives on :root in production. Scoped to the preview shell so
 * every panel inherits it, since panels are divs rather than documents.
 */
const css = readCss();

const panels = PANELS.map((p) => {
  const html = readFileSync(join(out, p.path), 'utf8');
  return { ...p, body: extractBody(html) };
});

const page = `<style>
${css}

/* ---- Preview harness only. Not part of the deployed site. ---------------- */
.pv-shell {
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
}
.pv-bar {
  position: sticky;
  top: 0;
  z-index: 200;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #000;
  border-bottom: 1px solid #262626;
}
.pv-brand {
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #6b6b6b;
  margin-inline-end: auto;
}
.pv-tab {
  appearance: none;
  border: 1px solid #2c2c2c;
  background: transparent;
  color: #c6c6c6;
  border-radius: 999px;
  padding: 6px 14px;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.pv-tab:hover { color: #fff; border-color: #4a4a4a; }
.pv-tab[aria-selected='true'] {
  background: #d8231a;
  border-color: #d8231a;
  color: #fff;
}
.pv-tab:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.pv-tab small { display: block; font-size: 9px; opacity: 0.65; letter-spacing: 0.08em; }
.pv-panel[hidden] { display: none; }
.pv-note {
  padding: 14px 16px;
  background: #1a1205;
  border-bottom: 1px solid #3a2a08;
  color: #e0a32b;
  font-size: 12.5px;
  line-height: 1.5;
}
.pv-note strong { color: #f2d79b; }
@media (prefers-reduced-motion: reduce) {
  .pv-tab { transition: none; }
}
</style>

<div class="pv-shell">
  <div class="pv-bar" role="tablist" aria-label="Preview pages">
    <span class="pv-brand">STACKD — build preview</span>
    ${panels
      .map(
        (p, i) => `<button class="pv-tab" role="tab" id="tab-${p.id}"
      aria-controls="panel-${p.id}" aria-selected="${i === 0}"
      data-target="${p.id}" lang="${p.lang}">${p.label}<small>${p.sub}</small></button>`,
      )
      .join('\n    ')}
  </div>

  <p class="pv-note">
    <strong>Static preview of the real build.</strong>
    Typography falls back to system fonts — the display faces (Anton for Latin,
    Tajawal for Arabic) still need to be self-hosted as woff2. Item photography
    is not in yet. Links between pages are inert here; use the tabs.
  </p>

  ${panels
    .map(
      (p, i) => `<div class="pv-panel" role="tabpanel" id="panel-${p.id}"
    aria-labelledby="tab-${p.id}" lang="${p.lang}" dir="${p.dir}"${i === 0 ? '' : ' hidden'}>
${p.body}
  </div>`,
    )
    .join('\n  ')}
</div>

<script>
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.pv-tab'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.pv-panel'));

  function show(id) {
    tabs.forEach(function (t) {
      t.setAttribute('aria-selected', String(t.dataset.target === id));
    });
    panels.forEach(function (p) {
      p.hidden = p.id !== 'panel-' + id;
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  tabs.forEach(function (t) {
    t.addEventListener('click', function () { show(t.dataset.target); });
  });

  /* Internal navigation is inert in a single file — route the site's own nav
     links to the matching preview panel so the tabs are not the only way round. */
  document.querySelectorAll('.pv-panel a[href^="/"]').forEach(function (a) {
    var href = a.getAttribute('href').replace(/^\\/|\\/$/g, '');
    var parts = href.split('/');
    var id = parts.length === 1 ? parts[0] + '-home' : parts[0] + '-' + parts[1];
    if (document.getElementById('panel-' + id)) {
      a.addEventListener('click', function (e) { e.preventDefault(); show(id); });
    } else {
      a.addEventListener('click', function (e) { e.preventDefault(); });
    }
  });

  /* The live open/closed pill. Production ships this as a React client
     component; reimplemented here against the same 15:00-03:00 window because
     Next's chunks are stripped. Riyadh is UTC+3 with no DST. */
  function riyadhNow() {
    var now = new Date();
    var shifted = new Date(now.getTime() + 180 * 60000);
    return { weekday: shifted.getUTCDay(), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
  }
  function render() {
    var c = riyadhNow();
    var OPENS = 15 * 60, CLOSES = 3 * 60;
    /* Overnight window: open after 15:00 today, or before 03:00 as yesterday's tail. */
    var open = c.minutes >= OPENS || c.minutes < CLOSES;
    var mins = open
      ? (c.minutes >= OPENS ? 1440 - c.minutes + CLOSES : CLOSES - c.minutes)
      : OPENS - c.minutes;

    document.querySelectorAll('.pv-panel').forEach(function (panel) {
      var ar = panel.getAttribute('lang') === 'ar';
      panel.querySelectorAll('.status').forEach(function (el) {
        el.style.visibility = 'visible';
        el.removeAttribute('aria-hidden');
        el.setAttribute('data-open', String(open));
        var label = open ? (ar ? 'مفتوح الآن' : 'Open now') : (ar ? 'مغلق حالياً' : 'Closed');
        var detail = '';
        if (open && mins <= 60) {
          detail = (ar ? 'يغلق بعد ' : 'Closes in ') + mins + (ar ? ' دقيقة' : ' min');
        } else if (!open) {
          var h = Math.floor(mins / 60), m = mins % 60;
          var d = h > 0 ? h + (ar ? ' ساعات' : 'h') + (m ? ' ' + m + (ar ? ' دقيقة' : 'm') : '') : m + (ar ? ' دقيقة' : 'm');
          detail = (ar ? 'يفتح بعد ' : 'Opens in ') + d;
        }
        el.innerHTML = '<span class="status-dot"></span><span>' + label + '</span>' +
          (detail ? '<span class="status-detail">· ' + detail + '</span>' : '');
      });
    });
  }
  render();
  setInterval(render, 60000);
})();
</script>`;

const dest = join(root, 'apps/web/preview.html');
writeFileSync(dest, page);
console.log(`Wrote ${dest} (${(page.length / 1024).toFixed(1)} kB) from ${panels.length} pages`);
