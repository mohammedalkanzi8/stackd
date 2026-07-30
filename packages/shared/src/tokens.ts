/**
 * STACKD design tokens — shared by the website and the Expo app.
 *
 * Palette read off the primary menu artwork: a red rounded badge holding a white
 * rooster, heavy black wordmark, red-and-white checkerboard border. Classic
 * American street-food language — high contrast, no gradients, no softness.
 *
 * The green + gold treatment seen elsewhere is a National Day 94 seasonal
 * creative, NOT the core identity. Keep it as a documented seasonal override
 * (see `seasonal.nationalDay`) rather than letting it into the base system.
 *
 * Brand: STREET FOOD. REAL FLAVOR. STACKED RIGHT.
 */

export const palette = {
  /** The badge red. This is the brand's load-bearing colour. */
  red: {
    900: '#5C0D0A',
    800: '#7A120D',
    700: '#9C1711',
    600: '#C01C14',
    500: '#D8231A', // primary — the logo badge
    400: '#E8453C',
    300: '#F27A73',
    200: '#F9B5B0',
    100: '#FDE3E1',
  },

  /** Wordmark black. Near-black, not pure — pure black flattens on OLED. */
  ink: {
    900: '#0B0B0B',
    800: '#141414',
    700: '#1E1E1E',
    600: '#2C2C2C',
    500: '#454545',
    400: '#6B6B6B',
    300: '#9A9A9A',
    200: '#C6C6C6',
    100: '#E6E6E6',
    50:  '#F4F4F4',
  },

  white: '#FFFFFF',
  /** Slightly warm off-white for large surfaces; pure white is harsh at page scale. */
  bone: '#FAF8F5',

  /** Menus use a golden fry tone for calorie chips and accents. */
  fry: {
    500: '#E0A32B',
    400: '#EDBA4F',
  },

  green: {
    500: '#1E7A45', // success / "order ready" only
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
    warning:       palette.fry[500],
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
    warning:       palette.fry[400],
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
 * in line with QSR norms and sustainable on food cost. Points accrue on the
 * pre-VAT net, so a 60 SAR ticket earns 52, not 60.
 *
 * Change `pointsPerRiyal` to 2 for a promo weekend; nothing else needs touching.
 */
export const loyalty = {
  pointsPerRiyal: 1,
  signupBonus: 50,
  birthdayBonus: 100,
  expiryMonths: 12,
} as const;

// VAT_RATE lives in ./money.ts — it belongs with the arithmetic that consumes
// it, not with presentation tokens.
