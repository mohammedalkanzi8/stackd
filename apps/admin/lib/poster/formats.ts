/**
 * The printable sizes, and the one layout that serves all of them.
 *
 * Every dimension in the sheet CSS is expressed in `em` against a root size of
 * `width / 30`, so a single layout scales from a 105 mm counter card to a
 * 2 metre banner without a second design. Change a proportion once and all four
 * pieces move together — which is the only way four artefacts stay on-brand
 * after the third revision.
 *
 * ⚠ Millimetres, not pixels. These go to a print shop.
 */

export type FormatId = 'a3' | 'rollup' | 'a5' | 'a6';

export interface Format {
  id: FormatId;
  /** Trim width in mm. */
  w: number;
  /** Trim height in mm. */
  h: number;
  label: string;
  /** Where it goes and why, shown next to the picker. */
  use: string;
  /**
   * Extra bottom padding in mm, over and above the normal margin.
   *
   * A roll-up banner's bottom stretch is swallowed by the cassette the fabric
   * rolls into — how much depends on the stand, but 150 mm is the usual worst
   * case. Anything printed there is money spent on something nobody will see.
   */
  footRoom: number;
  /** Roughly how far away the QR still scans, at ~10x the code's width. */
  scanRange: string;
}

export const FORMATS: Record<FormatId, Format> = {
  a3: {
    id: 'a3',
    w: 297,
    h: 420,
    label: 'A3 wall poster',
    use: 'On the wall by the queue, at head height.',
    footRoom: 0,
    scanRange: 'about 1 m',
  },
  rollup: {
    id: 'rollup',
    w: 850,
    h: 2000,
    label: 'Roll-up banner, 85 x 200 cm',
    use: 'The floor-standing banner by the door or the till.',
    // The QR lands around 1.5 m off the floor with this, which is where a
    // standing adult's phone already is.
    footRoom: 150,
    scanRange: 'about 2.5 m',
  },
  a5: {
    id: 'a5',
    w: 148,
    h: 210,
    label: 'A5 table tent',
    use: 'Folded down the middle and stood on each table.',
    footRoom: 0,
    scanRange: 'about 50 cm',
  },
  a6: {
    id: 'a6',
    w: 105,
    h: 148,
    label: 'A6 counter card',
    use: 'Flat by the card reader, where they are already waiting.',
    footRoom: 0,
    scanRange: 'about 35 cm',
  },
};

export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];

export function isFormatId(v: string | undefined): v is FormatId {
  return v !== undefined && v in FORMATS;
}
