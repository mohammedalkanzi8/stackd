/**
 * STACKD design tokens — shared by the website and the Expo app.
 *
 * The four core values are EXACT, sampled from the Illustrator vector source
 * (`STACKD LOGO VECTOR.pdf`) rather than eyeballed from a photograph of the
 * menu board. Anything the vector defines is authoritative; the tints and
 * shades around them are derived.
 *
 * Identity: a red rounded badge holding a white rooster, heavy near-black
 * wordmark, gold rule work, red-and-white checkerboard border. Classic American
 * street-food language — high contrast, flat fills, no softness.
 *
 * The green + gold treatment seen elsewhere is a National Day 94 seasonal
 * creative, NOT the core identity. Kept as a documented seasonal override
 * (see `seasonal.nationalDay`) rather than allowed into the base system.
 *
 * Brand: STREET FOOD. REAL FLAVOR. STACKED RIGHT.
 */

/** Sampled directly from the vector artwork. Do not adjust these by eye. */
export const brandExact = {
  red: '#B82712',
  black: '#1B1C19',
  gold: '#ECA70F',
  white: '#FEFEFE',
} as const;

export const palette = {
  /** The badge red. The brand's load-bearing colour. 500 is exact. */
  red: {
    900: '#3D0D06',
    800: '#5E140A',
    700: '#7F1B0C',
    600: '#9C210F',
    500: '#B82712', // EXACT — the logo badge
    400: '#D14A35',
    300: '#E27A68',
    200: '#F0B0A3',
    100: '#FBE1DB',
  },

  /**
   * Wordmark black. Faintly green-biased rather than neutral grey — that bias
   * comes from the artwork itself, and it is what stops the neutrals reading as
   * a default grey ramp.
   */
  ink: {
    900: '#1B1C19', // EXACT — the wordmark
    800: '#232420',
    700: '#2E2F2A',
    600: '#3D3E38',
    500: '#55564E',
    400: '#75766D',
    300: '#9E9F96',
    200: '#C7C8C0',
    100: '#E4E5DF',
    50:  '#F3F4EF',
  },

  /** Gold rule work and the EST. 2023 detailing. 500 is exact. */
  gold: {
    700: '#9A6A05',
    600: '#C4880A',
    500: '#ECA70F', // EXACT
    400: '#F2BD46',
    300: '#F7D583',
    200: '#FBE9BE',
  },

  white: '#FEFEFE', // EXACT — the artwork's white is not pure #FFF
  /** Warm off-white for large surfaces; the exact white is harsh at page scale. */
  bone: '#FAF8F4',

  green: {
    500: '#1E7A45', // success / "order ready" only — never decorative
    400: '#2E9A5B',
  },
} as const;

/**
 * Semantic tokens. Components reference THESE, never `palette` directly —
 * that's what makes the light/dark swap and seasonal overrides one-file changes.
 */
export const theme = {
  light: {
    bg:            palette.bone,
    bgElevated:    palette.white,
    bgSunken:      palette.ink[50],
    surface:       palette.ink[900],   // dark section bands, like the menu footer
    surfaceAccent: palette.red[500],

    textPrimary:   palette.ink[900],
    textSecondary: palette.ink[500],
    textMuted:     palette.ink[400],
    textOnAccent:  palette.white,
    textOnSurface: palette.white,

    accent:        palette.red[500],
    accentHover:   palette.red[600],
    accentSubtle:  palette.red[100],

    price:         palette.red[500],   // menu prices are red throughout
    calorie:       palette.ink[400],

    border:        palette.ink[200],
    borderStrong:  palette.ink[300],

    success:       palette.green[500],
    danger:        palette.red[600],
    warning:       palette.gold[500],
  },
  dark: {
    bg:            palette.ink[900],
    bgElevated:    palette.ink[800],
    bgSunken:      '#050505',
    surface:       palette.ink[700],
    surfaceAccent: palette.red[600],

    textPrimary:   palette.white,
    textSecondary: palette.ink[300],
    textMuted:     palette.ink[400],
    textOnAccent:  palette.white,
    textOnSurface: palette.white,

    accent:        palette.red[400],
    accentHover:   palette.red[300],
    accentSubtle:  palette.red[900],

    price:         palette.red[300],
    calorie:       palette.ink[300],

    border:        palette.ink[700],
    borderStrong:  palette.ink[600],

    success:       palette.green[400],
    danger:        palette.red[400],
    warning:       palette.gold[400],
  },
} as const;

/**
 * Seasonal overrides. Applied as a theme patch for a date window, then removed.
 * Never merge these into the base palette.
 */
export const seasonal = {
  nationalDay: {
    accent:        '#C9A227', // gold
    surfaceAccent: '#215C3E', // Saudi green
    label: 'National Day (Sept 23)',
  },
} as const;

/**
 * The red-and-white checkerboard from the menu border. A real brand asset —
 * use it as a section divider and on loyalty cards, not as a background.
 */
export const checkerboard = {
  squareSize: 12,
  colors: [palette.red[500], palette.white],
} as const;

/**
 * Type. The wordmark is a heavy condensed athletic face; body copy on the menu
 * is wide-tracked uppercase. Arabic needs a real face, never a system fallback.
 */
export const fonts = {
  displayEn: '"Anton", "Archivo Black", Impact, system-ui, sans-serif',
  displayAr: '"Tajawal", "Cairo", system-ui, sans-serif',
  bodyEn:    '"Inter", system-ui, -apple-system, sans-serif',
  bodyAr:    '"IBM Plex Sans Arabic", "Cairo", system-ui, sans-serif',
  mono:      '"JetBrains Mono", ui-monospace, monospace',
} as const;

/** Menu item names and section headers are uppercase with wide tracking. */
export const typeStyles = {
  sectionHeader: { transform: 'uppercase', letterSpacing: '0.08em', weight: 700 },
  itemName:      { transform: 'uppercase', letterSpacing: '0.02em', weight: 700 },
  itemDesc:      { transform: 'uppercase', letterSpacing: '0.04em', weight: 400 },
} as const;

export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24,
  8: 32, 10: 40, 12: 48, 16: 64, 20: 80, 24: 96,
} as const;

/** The badge is a rounded square — keep radii tight and consistent with it. */
export const radius = {
  sm: 4, md: 8, lg: 14, xl: 20, pill: 999,
} as const;

export const fontSize = {
  xs: 12, sm: 14, base: 16, lg: 18, xl: 20,
  '2xl': 24, '3xl': 30, '4xl': 38, '5xl': 48, '6xl': 60,
} as const;

/**
 * Loyalty economics, tuned against the real menu.
 *
 * Google lists SAR 40–60 per person (62 reports), which matches the basket
 * arithmetic: burger (27–48) + fries (9) + drink (8).
 *
 * At 1 pt/SAR the reward catalogue in seed.sql targets ~7% effective return —
 * in line with QSR norms and sustainable on food cost.
 *
 * ⚠ THESE ARE DEFAULTS FOR SOMETHING WITH NO DATABASE. The live figures are in
 * `loyalty_settings`, and that includes WHICH figure on the bill the rate is
 * taken from — `earn_excludes_vat`. This comment used to state the answer ("a
 * 60 SAR ticket earns 52, not 60") and was wrong on both counts: earning has
 * always used the gross, and a point has been a halala since well before that
 * line was written.
 */
export const loyalty = {
  // Percent of the bill returned as points. One point is one halala.
  earnPercent: 10,
  signupBonus: 50,
  birthdayBonus: 100,
  expiryMonths: 12,
} as const;

// VAT_RATE lives in ./money.ts — it belongs with the arithmetic that consumes
// it, not with presentation tokens.
