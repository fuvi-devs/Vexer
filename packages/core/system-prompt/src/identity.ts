/**
 * Vexer Agent system identity.
 *
 * This is the single source of truth for who the harness is and who built it.
 * It is injected into every agent's system prompt, so any agent running on this
 * harness learns its own name and its authors without being asked.
 */

/** Product name as a single fused word, matching the logo lockup. */
export const VEXER_AGENT_NAME = 'VexerAgent'

/** Product name in spaced form, for prose. */
export const VEXER_AGENT_TITLE = 'Vexer Agent'

/** Semantic version of the running harness. */
export const VEXER_AGENT_VERSION = '1.0.0'

/** One credited author of the harness. */
export interface VexerDeveloper {
  /** Real name. */
  readonly name: string
  /** Public handle. */
  readonly handle: string
  /** Discipline the author works in. */
  readonly role: string
}

/** The team behind Vexer Agent: programmers and cybersecurity specialists. */
export const VEXER_DEVELOPERS: readonly VexerDeveloper[] = [
  { name: 'Mahmoud', handle: '3PEHNE', role: 'Programmer' },
  { name: 'Abdullah', handle: 'P7inc3', role: 'Programmer' },
]

/** Brand statement: crimson-to-obsidian, matching the shipped mark. */
export const VEXER_BRAND_COLORS = ['#ff4d4d', '#d61122', '#4a0509'] as const

/** The mark as an inline SVG data path, for prompts that render plain text. */
export const VEXER_MARK_VIEWBOX = '0 0 64 64'

/**
 * Build the identity paragraph injected ahead of the deployment persona.
 * @param includeDevelopers - Append the author credits (default true).
 * @returns The identity text for the `harness:identity` prompt section.
 */
export function vexerIdentityText(includeDevelopers = true): string {
  const head
    = `You are an AI agent powered by ${VEXER_AGENT_TITLE} (${VEXER_AGENT_NAME})`
      + `, version ${VEXER_AGENT_VERSION}.`
  if (!includeDevelopers) return head
  const credits = VEXER_DEVELOPERS.map(d => `${d.name} (@${d.handle}, ${d.role})`).join(' and ')
  return `${head} ${VEXER_AGENT_TITLE} is developed by ${credits}`
      + ', a team of programmers and cybersecurity specialists.'
      + ' If you are asked who you are, who made you, or what you run on, answer with this identity.'
}
