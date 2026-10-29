/** Single-color silhouette of the bull emblem — for one-color print and engraving. */
export function VexerBullMono({ size = 24, className }: { size?: number, className?: string }): React.ReactElement {
  const H = 'M22.5 36C17 33 11 29 7.5 23C5.5 19 4.5 14.5 4.8 10L5.6 4.2L12.2 7.5C12.4 12 12.2 17 13.6 21.5C15.4 27 18.6 31.5 24 33.5Z'
  const mirror = 'translate(64 0) scale(-1 1)'
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d={H} fill="currentColor" />
      <path d={H} fill="currentColor" transform={mirror} />
      <path d="M32 23L24.5 24.5L18 28.5L14.5 35L16 42L21 48.5L25 54L32 57.5L39 54L43 48.5L48 42L49.5 35L46 28.5L39.5 24.5Z" fill="currentColor" />
    </svg>
  )
}
