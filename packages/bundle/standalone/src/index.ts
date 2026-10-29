/**
 * dsh-standalone — fully self-contained agent bundle.
 * No external services required. All capabilities in-process.
 * @module @deepseek-ai/dsh-standalone
 */

export const name = 'dsh-standalone'
export const version = '1.0.0'

export function apply(): void {
  // This bundle is a patch-only bundle; all functionality comes from
  // the patches in cordis.patch.yml. The empty apply is intentional.
}
