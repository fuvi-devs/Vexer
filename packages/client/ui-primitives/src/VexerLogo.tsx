import type { IconProps } from './icons/props.ts'

/** Native viewBox of {@link VEXER_LOGO_PATH} (width and height in user units). */
export const VEXER_LOGO_VIEWBOX = { width: 64, height: 64 }

/**
 * The Vexer mark: a heavy geometric V with a pair of horns rising from its
 * shoulders, filled with the crimson-to-obsidian brand gradient. Exported so
 * consumers can compose their own svg around the same geometry.
 */
export const VEXER_LOGO_PATH =
  'M32 60.5c-1.6 0-3-1-3.6-2.4L8.2 20.6c-1.1-2.6.9-5.4 3.7-5.4h6.9c1.5 0 2.8.8 3.4 2.1l9.8 21.7 9.8-21.7c.6-1.3 2-2.1 3.4-2.1h6.9c2.8 0 4.8 2.8 3.7 5.4L35.6 58.1c-.6 1.4-2 2.4-3.6 2.4Z'

/** The horn pair drawn over the V shoulders. */
export const VEXER_HORN_PATH =
  'M11.9 15.2C6.6 13.4 3.1 9.1 2.4 3.4c-.1-.9.6-1.6 1.5-1.5 5.7.7 10 4.2 11.8 9.5.3.9-.4 1.9-1.4 1.9l-2.4.1ZM52.1 15.2c5.3-1.8 8.8-6.1 9.5-11.8.1-.9-.6-1.6-1.5-1.5-5.7.7-10 4.2-11.8 9.5-.3.9.4 1.9 1.4 1.9l2.4.1Z'

/** Gradient id so the mark can paint crimson into obsidian. */
export const VEXER_LOGO_GRADIENT_ID = 'vexer-logo-gradient'

/**
 * Render the Vexer mark.
 * @param props.size - width in px (default 24; height keeps the 64:64 ratio).
 * @param props.className - extra class for layout placement.
 * @returns the logo svg (aria-hidden; pair with the wordmark for accessibility).
 */
export function VexerLogo({ size = 24, className }: IconProps) {
  const gradientId = `${VEXER_LOGO_GRADIENT_ID}-${size}`
  return (
    <svg
      width={size}
      height={(size * VEXER_LOGO_VIEWBOX.height) / VEXER_LOGO_VIEWBOX.width}
      className={className}
      viewBox={`0 0 ${VEXER_LOGO_VIEWBOX.width} ${VEXER_LOGO_VIEWBOX.height}`}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="8" y1="2" x2="56" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff4d4d" />
          <stop offset="0.45" stopColor="#d61122" />
          <stop offset="1" stopColor="#4a0509" />
        </linearGradient>
      </defs>
      <path d={VEXER_HORN_PATH} fill={`url(#${gradientId})`} />
      <path d={VEXER_LOGO_PATH} fill={`url(#${gradientId})`} />
    </svg>
  )
}
