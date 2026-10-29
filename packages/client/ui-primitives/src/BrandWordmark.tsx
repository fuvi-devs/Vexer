import type { IconProps } from './icons/props.ts'
import {
  VexerBull,
  VEXER_PALETTE,
  VEXER_BULL_HORN_PATH,
  VEXER_BULL_SKULL_PATH,
  VEXER_BULL_BROW_PATH,
  VEXER_BULL_MUZZLE_PATH,
  VEXER_BULL_EYE_PATH,
  VEXER_BULL_NOSTRIL_PATH,
} from './VexerBull.tsx'

/** Display options for the Vexer brand wordmark. */
export interface BrandWordmarkProps extends IconProps {
  /** Whether to include the leading bull emblem; defaults to true. */
  includeMark?: boolean | undefined
}

/**
 * Render the VEXER AGENT wordmark.
 *
 * The name is one word: no space, no title case. V, X, and A are the
 * signature letters and carry the scarlet; the remaining glyphs sit in gunmetal
 * so the eye lands on V-X-A first. The whole lockup is italic and heavy, with
 * the emblem fused to the cap height.
 * @param props.size - height in px (default 24); drives the mark and the cap height.
 * @param props.className - extra class for layout placement.
 * @param props.includeMark - whether to include the leading bull emblem.
 * @returns the wordmark svg (aria-hidden decorative brand art).
 */
export function BrandWordmark({ size = 24, className, includeMark = true }: BrandWordmarkProps) {
  const mark = size
  const gap = size * 0.22
  const fontSize = size * 0.96
  const baseline = size * 0.86
  const nameWidth = size * 6.35
  const width = includeMark ? mark + gap + nameWidth : nameWidth
  const u = `vexer-wm-${size}`

  return (
    <svg
      width={width}
      height={size}
      className={className}
      viewBox={`0 0 ${width} ${size}`}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${u}-sig`} x1="0" y1="0" x2={size * 2.6} y2={size} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={VEXER_PALETTE.scarlet} />
          <stop offset="0.5" stopColor={VEXER_PALETTE.crimson} />
          <stop offset="1" stopColor={VEXER_PALETTE.blood} />
        </linearGradient>
        <linearGradient id={`${u}-body`} x1="0" y1="0" x2={nameWidth} y2={size} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6A6A74" />
          <stop offset="0.55" stopColor={VEXER_PALETTE.gunmetal} />
          <stop offset="1" stopColor="#0E0E12" />
        </linearGradient>
        {/* the emblem, inlined so the lockup stays one gradient scope */}
        <linearGradient id={`${u}-horn`} x1="5" y1="5" x2="24" y2="35" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={VEXER_PALETTE.scarlet} />
          <stop offset="0.22" stopColor={VEXER_PALETTE.crimson} />
          <stop offset="0.6" stopColor={VEXER_PALETTE.blood} />
          <stop offset="1" stopColor="#1A0206" />
        </linearGradient>
        <linearGradient id={`${u}-face`} x1="14" y1="24" x2="50" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={VEXER_PALETTE.gunmetal} />
          <stop offset="0.4" stopColor={VEXER_PALETTE.obsidian} />
          <stop offset="1" stopColor={VEXER_PALETTE.matte} />
        </linearGradient>
        <linearGradient id={`${u}-brow`} x1="32" y1="23" x2="32" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#46464F" />
          <stop offset="1" stopColor={VEXER_PALETTE.obsidian} />
        </linearGradient>
      </defs>

      {includeMark
        ? (
          <g transform={`translate(0 ${(size - mark) / 2}) scale(${mark / 64})`}>
            <path d={VEXER_BULL_HORN_PATH} fill={`url(#${u}-horn)`} />
            <path d={VEXER_BULL_HORN_PATH} fill={`url(#${u}-horn)`} transform="translate(64 0) scale(-1 1)" />
            <path d={VEXER_BULL_SKULL_PATH} fill={`url(#${u}-face)`} />
            <path d={VEXER_BULL_BROW_PATH} fill={`url(#${u}-brow)`} opacity="0.9" />
            <path d={VEXER_BULL_MUZZLE_PATH} fill={VEXER_PALETTE.obsidian} opacity="0.6" />
            <path d={VEXER_BULL_EYE_PATH} fill={VEXER_PALETTE.scarlet} />
            <path d={VEXER_BULL_EYE_PATH} fill={VEXER_PALETTE.scarlet} transform="translate(64 0) scale(-1 1)" />
            <path d={VEXER_BULL_NOSTRIL_PATH} fill={VEXER_PALETTE.blood} />
            <path d={VEXER_BULL_NOSTRIL_PATH} fill={VEXER_PALETTE.blood} transform="translate(64 0) scale(-1 1)" />
          </g>
        )
        : null}

      <text
        x={includeMark ? mark + gap : 0}
        y={baseline}
        fontFamily="var(--dsw-font-family-brand, 'Montserrat', system-ui, sans-serif)"
        fontSize={fontSize}
        fontWeight="900"
        fontStyle="italic"
        letterSpacing={fontSize * 0.01}
        textLength={nameWidth}
        lengthAdjust="spacingAndGlyphs"
      >
        <tspan fill={`url(#${u}-sig)`}>V</tspan>
        <tspan fill={`url(#${u}-body)`}>E</tspan>
        <tspan fill={`url(#${u}-sig)`}>X</tspan>
        <tspan fill={`url(#${u}-body)`}>ER</tspan>
        <tspan fill={`url(#${u}-sig)`}>A</tspan>
        <tspan fill={`url(#${u}-body)`}>GENT</tspan>
      </text>
    </svg>
  )
}

/** Re-exported so consumers can drop the emblem next to the wordmark. */
export { VexerBull }
