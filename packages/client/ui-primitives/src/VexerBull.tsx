import type { IconProps } from './icons/props.ts'

/**
 * VEXER AGENT brand palette. Black is the material; red is the light that
 * escapes from underneath it. Every surface in the identity is drawn from
 * these six values so the emblem, wordmark, and app icon stay one system.
 */
export const VEXER_PALETTE = {
  /** Absolute matte black — the field the mark sits on. */
  matte: '#050505',
  /** Obsidian black — the body planes of the emblem. */
  obsidian: '#0B0B0D',
  /** Deep blood red — the glow under the metal. */
  blood: '#5A0008',
  /** Crimson red — the core light. */
  crimson: '#C00018',
  /** Intense scarlet — the horn tips and eye catchlights. */
  scarlet: '#FF1728',
  /** Dark metallic gunmetal — the edge plating. */
  gunmetal: '#242428',
} as const

/** Native viewBox of the emblem (square). */
export const VEXER_BULL_VIEWBOX = { width: 64, height: 64 }

/**
 * Left horn. Mirrored for the right side by the caller's transform, so the
 * emblem is symmetric by construction rather than by duplicated geometry.
 * A bovine crescent: thick root at the skull, belly bulging to the side, tip
 * curling up and inward to a point.
 */
export const VEXER_BULL_HORN_PATH =
  'M22.5 36C17 33 11 29 7.5 23C5.5 19 4.5 14.5 4.8 10L5.6 4.2L12.2 7.5C12.4 12 12.2 17 13.6 21.5C15.4 27 18.6 31.5 24 33.5Z'

/** Full skull silhouette: wide brow, heavy cheek plates, compact muzzle. */
export const VEXER_BULL_SKULL_PATH =
  'M32 23L24.5 24.5L18 28.5L14.5 35L16 42L21 48.5L25 54L32 57.5L39 54L43 48.5L48 42L49.5 35L46 28.5L39.5 24.5Z'

/** Forehead facet — the carved-metal plate that catches the key light. */
export const VEXER_BULL_BROW_PATH =
  'M32 23L25 25.5L21 32.5L32 36L43 32.5L39 25.5Z'

/** Muzzle plane, sunk below the cheek plates. */
export const VEXER_BULL_MUZZLE_PATH =
  'M32 41L26 44.5L26.5 53L32 57L37.5 53L38 44.5Z'

/** Angular eye slit, angled inward toward the brow. */
export const VEXER_BULL_EYE_PATH =
  'M20 35L27 33L27.6 36.8L21 38.6Z'

/** Nostril cut. */
export const VEXER_BULL_NOSTRIL_PATH =
  'M28.2 46.5L30.9 45.8L30.9 48.4L28.4 49Z'

/**
 * Render the Vexer bull emblem.
 *
 * The silhouette is built from a handful of large shapes so it still reads at
 * 48px as an app icon: crescent horns dominate, the skull stays one mass, and
 * the only colour is the contained scarlet in the eyes.
 * @param props.size - width in px (default 24; square).
 * @param props.className - extra class for layout placement.
 * @returns the emblem svg (aria-hidden; pair with the wordmark for accessibility).
 */
export function VexerBull({ size = 24, className }: IconProps) {
  const horn = `vexer-bull-horn-${size}`
  const face = `vexer-bull-face-${size}`
  const brow = `vexer-bull-brow-${size}`
  const mirror = 'translate(64 0) scale(-1 1)'
  return (
    <svg
      width={size}
      height={(size * VEXER_BULL_VIEWBOX.height) / VEXER_BULL_VIEWBOX.width}
      className={className}
      viewBox={`0 0 ${VEXER_BULL_VIEWBOX.width} ${VEXER_BULL_VIEWBOX.height}`}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        {/* Horns catch scarlet at the tip and fall away into blood and near-black. */}
        <linearGradient id={horn} x1="5" y1="5" x2="24" y2="35" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={VEXER_PALETTE.scarlet} />
          <stop offset="0.22" stopColor={VEXER_PALETTE.crimson} />
          <stop offset="0.6" stopColor={VEXER_PALETTE.blood} />
          <stop offset="1" stopColor="#1A0206" />
        </linearGradient>
        {/* Skull is gunmetal at the key light and matte black in shadow. */}
        <linearGradient id={face} x1="14" y1="24" x2="50" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={VEXER_PALETTE.gunmetal} />
          <stop offset="0.4" stopColor={VEXER_PALETTE.obsidian} />
          <stop offset="1" stopColor={VEXER_PALETTE.matte} />
        </linearGradient>
        <linearGradient id={brow} x1="32" y1="23" x2="32" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#46464F" />
          <stop offset="1" stopColor={VEXER_PALETTE.obsidian} />
        </linearGradient>
      </defs>
      <path d={VEXER_BULL_HORN_PATH} fill={`url(#${horn})`} />
      <path d={VEXER_BULL_HORN_PATH} fill={`url(#${horn})`} transform={mirror} />
      <path d={VEXER_BULL_SKULL_PATH} fill={`url(#${face})`} />
      <path d={VEXER_BULL_BROW_PATH} fill={`url(#${brow})`} opacity="0.9" />
      <path d={VEXER_BULL_MUZZLE_PATH} fill={VEXER_PALETTE.obsidian} opacity="0.6" />
      <path d={VEXER_BULL_EYE_PATH} fill={VEXER_PALETTE.scarlet} />
      <path d={VEXER_BULL_EYE_PATH} fill={VEXER_PALETTE.scarlet} transform={mirror} />
      <path d={VEXER_BULL_NOSTRIL_PATH} fill={VEXER_PALETTE.blood} />
      <path d={VEXER_BULL_NOSTRIL_PATH} fill={VEXER_PALETTE.blood} transform={mirror} />
    </svg>
  )
}
