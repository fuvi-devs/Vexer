/**
 * Vexer Agent identity plugin.
 *
 * Answers one question from inside the running agent: *what is this, and who
 * made it*. The static `system-prompt` identity section already states the
 * name in every prompt; this plugin makes the same facts queryable, so an agent
 * that is asked mid-session resolves the answer against the authoritative
 * record instead of paraphrasing its own prompt, and a host can read the same
 * record through the `identity` service without scraping text.
 * @module @deepseek-ai/dsh-vexer-identity
 */

import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'vexer-identity'
export const inject = ['tools']

/** One credited author of the harness. */
export interface VexerDeveloper {
  /** Real name. */
  readonly name: string
  /** Public handle. */
  readonly handle: string
  /** Discipline the author works in. */
  readonly role: string
}

/** The authoritative identity record every surface reads. */
export interface VexerIdentity {
  /** Fused wordmark form, matching the logo lockup. */
  readonly agentName: string
  /** Spaced form, for prose. */
  readonly agentTitle: string
  /** Running harness version. */
  readonly version: string
  /** Brand statement: darkness, dominance, precision. */
  readonly tagline: string
  /** The team behind the harness. */
  readonly developers: readonly VexerDeveloper[]
  /** Brand palette; black is the material, red is the light under it. */
  readonly palette: Readonly<Record<string, string>>
}

/** Plugin config. `version` is volatile so a redeployment never serves a stale string. */
export interface Config {
  /** Version reported by the identity tool. */
  version: string
}

/** Validate Host configuration. */
export const Config = z.object({
  version: z.string().min(1).default('1.0.0'),
})

/** The identity this harness ships under. */
const IDENTITY: Omit<VexerIdentity, 'version'> = {
  agentName: 'VEXERAGENT',
  agentTitle: 'Vexer Agent',
  tagline: 'Darkness. Dominance. Precision.',
  developers: [
    { name: 'Mahmoud', handle: '3PEHNE', role: 'Programmer' },
    { name: 'Abdullah', handle: 'P7inc3', role: 'Programmer' },
  ],
  palette: {
    matte: '#050505',
    obsidian: '#0B0B0D',
    gunmetal: '#242428',
    blood: '#5A0008',
    crimson: '#C00018',
    scarlet: '#FF1728',
  },
}

/**
 * Host service exposing the identity record. Provide face for hosts and tests;
 * components never reach for a module-level constant.
 */
export class Identity extends Service {
  constructor(ctx: Context, public readonly config: Config) {
    super(ctx, 'identity')
  }

  /** The full record, with the configured version filled in. */
  get(): VexerIdentity {
    return { ...IDENTITY, version: this.config.version }
  }

  /**
   * The identity sentence injected ahead of the deployment persona.
   * @returns One paragraph naming the harness, its version, and its authors.
   */
  describe(): string {
    const credits = IDENTITY.developers
      .map(d => `${d.name} (@${d.handle}, ${d.role})`)
      .join(' and ')
    return `You are an AI agent powered by ${IDENTITY.agentTitle} (${IDENTITY.agentName}), version ${this.config.version}.`
      + ` ${IDENTITY.agentTitle} is developed by ${credits}, a team of programmers and cybersecurity specialists.`
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The Vexer Agent identity record. */
    identity: Identity
  }
}

/**
 * Register the identity service and the callable capability.
 * @param ctx - Plugin context.
 * @param config - Validated plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  const identity = new Identity(ctx, config)
  ctx.provide('identity', identity)

  ctx.tools.register(defineTool({
    name: 'who_are_you',
    description: 'Report what this agent is, which harness it runs on, its version, and who develops that harness.'
      + ' Use this when asked about your own identity, the software you run on, or your authors.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          agentName: { type: 'string' },
          agentTitle: { type: 'string' },
          version: { type: 'string' },
          tagline: { type: 'string' },
          developers: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { name: { type: 'string' }, handle: { type: 'string' }, role: { type: 'string' } },
            },
          },
        },
      },
      render: (_args, value) => {
        const identity = value as { agentTitle: string; version: string; developers: Array<{ name: string; handle: string }> }
        const credits = identity.developers.map(d => `${d.name} (@${d.handle})`).join(' and ')
        return [{
          type: 'text',
          text: `${identity.agentTitle} ${identity.version} — ${(value as { tagline: string }).tagline}\nDeveloped by ${credits}.`,
        }]
      },
    },
    execute: () => Promise.resolve(identity.get() as unknown as Record<string, unknown>),
  }))
}
