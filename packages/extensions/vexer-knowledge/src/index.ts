/**
 * Vexer Agent Knowledge Base.
 *
 * The authoritative, queryable knowledge base for Vexer Agent. Contains the
 * core identity (name, version, tagline, developers, brand palette) and an
 * extensible set of knowledge entries that agents can query at runtime.
 * @module @deepseek-ai/dsh-vexer-knowledge
 */

import type { Context } from '@deepseek-ai/cordis'
import { Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { Identity, VexerIdentity } from '@deepseek-ai/dsh-vexer-identity'

export const name = 'vexer-knowledge'
export const inject = ['identity', 'tools'] as const

/** A single knowledge entry in the base. */
export interface KnowledgeEntry {
  /** Unique identifier. */
  readonly id: string
  /** Human-readable title/topic. */
  readonly topic: string
  /** Detailed content. */
  readonly content: string
  /** Categorization tags. */
  readonly tags: readonly string[]
  /** Confidence level (0-1). */
  readonly confidence: number
  /** Source of this knowledge. */
  readonly source: 'core' | 'learned' | 'configured'
  /** When this entry was added. */
  readonly addedAt: number
}

/** Plugin configuration. */
export interface Config {
  /** Additional knowledge entries to seed the base with. */
  seedEntries?: readonly Omit<KnowledgeEntry, 'id' | 'addedAt' | 'source'>[]
  /** Maximum entries to return in a query. */
  maxResults?: number
}

export const Config = z.object({
  seedEntries: z.array(z.object({
    topic: z.string(),
    content: z.string(),
    tags: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1).default(1),
  })).default([]),
  maxResults: z.number().min(1).max(200).default(20),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    identity: Identity
    knowledge: KnowledgeBase
  }
}

/** The knowledge base service. */
export class KnowledgeBase extends Service {
  private entries: KnowledgeEntry[] = []

  constructor(ctx: Context, config: Config) {
    super(ctx, 'knowledge')

    // Seed core identity knowledge
    const identity = ctx.identity.get()
    this.seedCoreKnowledge(identity)

    // Seed configured entries
    if (config.seedEntries) {
      for (const entry of config.seedEntries) {
        this.addEntry({
          ...entry,
          id: randomUUID(),
          addedAt: Date.now(),
          source: 'configured',
        })
      }
    }

    // Register query tool
    ctx.tools.register(this.createQueryTool(config.maxResults ?? 20))
  }

  /** Seed the base with core identity knowledge. */
  private seedCoreKnowledge(identity: VexerIdentity): void {
    const coreEntries: KnowledgeEntry[] = [
      {
        id: 'vexer:identity:name',
        topic: 'Agent Name',
        content: `This agent runs on ${identity.agentTitle} (${identity.agentName}), version ${identity.version}.`,
        tags: ['identity', 'core', 'name'],
        confidence: 1,
        source: 'core',
        addedAt: Date.now(),
      },
      {
        id: 'vexer:identity:tagline',
        topic: 'Brand Tagline',
        content: identity.tagline,
        tags: ['identity', 'core', 'brand', 'tagline'],
        confidence: 1,
        source: 'core',
        addedAt: Date.now(),
      },
      {
        id: 'vexer:identity:developers',
        topic: 'Developers',
        content: `${identity.agentTitle} is developed by ${identity.developers.map(d => `${d.name} (@${d.handle}, ${d.role})`).join(' and ')}, a team of programmers and cybersecurity specialists.`,
        tags: ['identity', 'core', 'developers', 'authors'],
        confidence: 1,
        source: 'core',
        addedAt: Date.now(),
      },
      {
        id: 'vexer:identity:palette',
        topic: 'Brand Palette',
        content: `The brand colors are: ${Object.entries(identity.palette).map(([k, v]) => `${k}: ${v}`).join(', ')}.`,
        tags: ['identity', 'core', 'brand', 'colors', 'palette'],
        confidence: 1,
        source: 'core',
        addedAt: Date.now(),
      },
      {
        id: 'vexer:identity:capabilities',
        topic: 'Capabilities',
        content: `${identity.agentTitle} is an AI agent harness with durable memory (Redis + ClickHouse), self-learning, threat intelligence, web crawling (Nutch), distributed processing (Spark), event streaming (Kafka), firewall management (PF/nftables), and a Kill Bill-backed credit system (1 USD = 0.1 credit = 1 request).`,
        tags: ['identity', 'core', 'capabilities', 'features'],
        confidence: 1,
        source: 'core',
        addedAt: Date.now(),
      },
      {
        id: 'vexer:identity:credit-system',
        topic: 'Credit System',
        content: 'Credit model: 1 USD = 0.1 credit; 1 credit = 1 simple request. Pay-as-you-go, no subscriptions. Stripe for payments. Credits stored as append-only ledger in micro-credits (1 credit = 1,000,000 µcr).',
        tags: ['identity', 'core', 'billing', 'credits', 'payments'],
        confidence: 1,
        source: 'core',
        addedAt: Date.now(),
      },
    ]

    for (const entry of coreEntries) {
      this.entries.push(entry)
    }
  }

  /** Add a knowledge entry. */
  addEntry(entry: KnowledgeEntry): void {
    this.entries.push(entry)
  }

  /** Query the knowledge base. */
  query(query: string, limit: number): KnowledgeEntry[] {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1)
    if (terms.length === 0) return this.entries.slice(0, limit)

    const scored = this.entries.map((entry) => {
      const text = `${entry.topic} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase()
      let score = 0
      for (const term of terms) {
        if (text.includes(term)) score += 1
        // Boost for exact topic matches
        if (entry.topic.toLowerCase().includes(term)) score += 2
        // Boost for tag matches
        if (entry.tags.some(t => t.toLowerCase().includes(term))) score += 1.5
      }
      return { entry, score }
    })

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.confidence - a.entry.confidence)
      .slice(0, limit)
      .map(s => s.entry)
  }

  /** Get all entries (for admin/debug). */
  getAll(): readonly KnowledgeEntry[] {
    return this.entries
  }

  /** Create the query tool. */
  private createQueryTool(maxResults: number) {
    return defineTool({
      name: 'query_knowledge',
      description: 'Query the Vexer Agent knowledge base for identity, capabilities, brand info, and configured knowledge. Use this when you need to answer questions about what you are, who made you, your capabilities, brand, or any seeded knowledge.',
      parameters: {
        query: { type: 'string', required: true, description: 'Natural language query to search the knowledge base' },
        limit: { type: 'integer', maximum: 50, default: maxResults, description: 'Maximum results to return (min 1)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  topic: { type: 'string' },
                  content: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                  confidence: { type: 'number' },
                  source: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value): { type: 'text'; text: string }[] => {
          const results = (value as {
            results: { topic: string; content: string; tags: string[]; confidence: number; source: string }[]
          }).results
          if (results.length === 0) return [{ type: 'text', text: 'No relevant knowledge found.' }]
          const text = results.map(r => `**${r.topic}** (${r.source}, confidence: ${r.confidence})\n${r.content}\nTags: ${r.tags.join(', ')}`).join('\n\n---\n\n')
          return [{ type: 'text', text }]
        },
      },
      execute: (args: { query: string; limit?: number }, _exec) => {
        const results = this.query(args.query, args.limit ?? maxResults).map(entry => ({
          topic: entry.topic,
          content: entry.content,
          tags: [...entry.tags],
          confidence: entry.confidence,
          source: entry.source,
        }))
        return Promise.resolve({ results })
      },
    })
  }
}

export function apply(ctx: Context, config: Config): void {
  ctx.provide('knowledge', new KnowledgeBase(ctx, config))
}
