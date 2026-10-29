/**
 * Agent-facing tools for durable memory.
 *
 * These tools give the agent complete control over its durable memory:
 * - `memory_append`: store facts, decisions, tool results, notes
 * - `memory_recall`: search by natural language or vector
 * - `memory_recent`: read the tail of the current session
 * - `memory_forget`: purge a session from all tiers
 * - `memory_health`: inspect tier status
 * - `memory_control`: advanced operations (flush, compact, stats)
 *
 * The tools attach to the `memory` seam and work across whatever tiers are
 * configured (Redis hot tier, ClickHouse cold tier, or both).
 * @module @deepseek-ai/dsh-memory-tools
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { Memory } from '@deepseek-ai/dsh-memory-core'
import type { MemoryEvent, MemoryEventKind, MemoryHit } from '@deepseek-ai/dsh-memory-core'

let memoryService: Memory | undefined
export const name = 'memory-tools'
export const inject = ['memory']

/** Resolve the injected memory service, failing loudly when the plugin loaded without it. */
function requireMemory(): Memory {
  if (memoryService === undefined) {
    throw new Error('memory-tools: memory service is not available')
  }
  return memoryService
}

/** Plugin config — empty for now; tiers are configured through their own plugins. */
export interface Config {}

/** Validate Host configuration. */
export const Config: z<Partial<Config>, Config> = z.object({})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The durable memory seam. */
    memory: Memory
  }
}

function eventToJson(event: MemoryEvent): Record<string, unknown> {
  return {
    sessionId: event.sessionId,
    agentId: event.agentId,
    kind: event.kind,
    seq: event.seq,
    at: event.at,
    text: event.text,
    tags: event.tags,
    ...(event.vector !== undefined ? { vector: event.vector } : {}),
  }
}

function hitToJson(hit: MemoryHit): Record<string, unknown> {
  return {
    event: eventToJson(hit.event),
    score: hit.score,
    tier: hit.tier,
  }
}

/** Arguments accepted by the memory_append tool. */
interface MemoryAppendArgs {
  events: readonly { kind: string; text: string; tags?: string[]; vector?: number[] }[]
  sessionId?: string
  agentId?: string
}

/**
 * Append durable events to memory.
 */
export const memoryAppend = defineTool({
  name: 'memory_append',
  description: 'Store durable events in agent memory. Use for facts, decisions, tool results, notes, or any content you need to recall later. Events are persisted across tiers (Redis hot tier + ClickHouse cold tier).',
  parameters: {
    events: {
      type: 'array',
      required: true,
      description: 'Events to store. Each event is a fact, decision, tool result, message, or note.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, enum: ['message', 'tool', 'assistant', 'decision', 'note'], description: 'Event kind: message | tool | assistant | decision | note' },
          text: { type: 'string', required: true, description: 'Human-readable content of the event' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional labels for filtering' },
          vector: { type: 'array', items: { type: 'number' }, description: 'Optional embedding vector' },
        },
      },
    },
    sessionId: { type: 'string', description: 'Session to store into (defaults to current session)' },
    agentId: { type: 'string', description: 'Agent that produced the events (defaults to current agent)' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        written: { type: 'integer' },
        tier: { type: 'string', enum: ['hot', 'cold', 'null'] },
      },
    },
    render: (_args, value) => {
      const tier = value.tier === undefined || value.tier === 'null' ? 'no tier accepted' : `${value.tier} tier`
      return [{ type: 'text', text: `Stored ${value.written} event(s) in ${tier}.` }]
    },
  },
  async execute(args: MemoryAppendArgs, exec) {
    const memory = requireMemory()
    const sessionId = args.sessionId ?? exec.agent?.id
    const agentId = args.agentId ?? exec.agent?.id
    if (!sessionId || !agentId) throw new Error('memory_append: sessionId and agentId are required (not found in context)')
    const now = Date.now()
    const events: MemoryEvent[] = args.events.map((e, i) => ({
      sessionId,
      agentId,
      kind: e.kind as MemoryEventKind,
      text: e.text,
      tags: e.tags ?? [],
      vector: e.vector,
      seq: i,
      at: now + i,
    }))
    const result = await memory.append(events)
    const tier: 'hot' | 'cold' | 'null' = result.tier ?? 'null'
    return { written: result.written, tier }
  },
})

/**
 * Recall relevant events from memory by natural language or vector.
 */
export const memoryRecall = defineTool({
  name: 'memory_recall',
  description: 'Recall relevant events from durable memory. Searches by natural language and/or vector similarity across configured tiers (Redis hot tier first, then ClickHouse cold tier). Returns ranked hits with scores and tier info.',
  parameters: {
    query: { type: 'string', required: true, description: 'Natural-language query to search for' },
    vector: { type: 'array', items: { type: 'number' }, description: 'Optional embedding vector for vector similarity search' },
    sessionId: { type: 'string', description: 'Session to search (defaults to current session)' },
    limit: { type: 'integer', default: 10, description: 'Maximum events to return' },
    kinds: { type: 'array', items: { type: 'string', enum: ['message', 'tool', 'assistant', 'decision', 'note'] }, description: 'Optional filter by event kind' },
    global: { type: 'boolean', default: false, description: 'Search across all sessions, not just the current one' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        hits: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {} } },
      },
    },
    render: (_args, value) => {
      const hits = (value as { hits: Array<{ event: { text: string }; score: number; tier: string }> }).hits
      if (hits.length === 0) return [{ type: 'text', text: 'No relevant memories found.' }]
      return [{ type: 'text', text: hits.map(h => `[${h.tier}] score=${h.score.toFixed(3)}: ${h.event.text.slice(0, 200)}`).join('\n') }]
    },
  },
  async execute(args: { query: string; vector?: number[]; sessionId?: string; limit?: number; kinds?: string[]; global?: boolean }, _exec) {
    const memory = requireMemory()
    const sessionId = args.sessionId ?? _exec.agent?.id
    if (!sessionId) throw new Error('memory_recall: sessionId required (not found in context)')
    const query = {
      sessionId,
      text: args.query,
      vector: args.vector,
      limit: args.limit ?? 10,
      kinds: args.kinds?.filter((k): k is string => ['message', 'tool', 'assistant', 'decision', 'note'].includes(k)) as MemoryEventKind[] | undefined,
      global: args.global,
    }
    const hits = await memory.recall(query)
    return { hits: hits.map(hitToJson) }
  },
})

/**
 * Read the recent tail of the current session.
 */
export const memoryRecent = defineTool({
  name: 'memory_recent',
  description: 'Read the most recent events from the current session (newest first). Useful for reviewing recent context without a query.',
  parameters: {
    sessionId: { type: 'string', description: 'Session to read (defaults to current session)' },
    limit: { type: 'integer', default: 20, description: 'Maximum events to return' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        events: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {} } },
      },
    },
    render: (_args, value) => {
      const events = (value as { events: Array<{ text: string; kind: string }> }).events
      if (events.length === 0) return [{ type: 'text', text: 'No recent events.' }]
      return [{ type: 'text', text: events.map(e => `[${e.kind}] ${e.text.slice(0, 200)}`).join('\n') }]
    },
  },
  async execute(args: { sessionId?: string; limit?: number }, _exec) {
    const memory = requireMemory()
    const sessionId = args.sessionId ?? _exec.agent?.id
    if (!sessionId) throw new Error('memory_recent: sessionId required (not found in context)')
    const events = await memory.recent(sessionId, args.limit ?? 20)
    return { events: events.map(e => ({ text: e.text, kind: e.kind })) }
  },
})

/**
 * Purge a session from all memory tiers.
 */
export const memoryForget = defineTool({
  name: 'memory_forget',
  description: 'Purge a session from all memory tiers (hot and cold). Use with caution — this cannot be undone.',
  parameters: {
    sessionId: { type: 'string', required: true, description: 'Session to purge' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        success: { type: 'boolean' },
      },
    },
    render: (_args, value) => [{ type: 'text', text: (value as { success: boolean }).success ? 'Session purged from all tiers.' : 'Purge failed or session not found.' }],
  },
  async execute(args: { sessionId: string }, _exec) {
    const memory = requireMemory()
    const success = await memory.forget(args.sessionId)
    return { success }
  },
})

/**
 * Inspect memory tier health.
 */
export const memoryHealth = defineTool({
  name: 'memory_health',
  description: 'Inspect the health of all configured memory tiers (Redis hot, ClickHouse cold). Returns readiness, latency, and any errors per tier.',
  parameters: {},
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        tiers: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {} } },
      },
    },
    render: (_args, value) => {
      const tiers = (value as { tiers: Array<{ tier: string; ready: boolean; latencyMs: number; error?: string }> }).tiers
      return [{ type: 'text', text: tiers.map(t => `${t.tier}: ${t.ready ? 'ready' : 'down'} (${t.latencyMs}ms)${t.error ? ' — ' + t.error : ''}`).join('\n') }]
    },
  },
  async execute(_args: {}, _exec) {
    const memory = requireMemory()
    const tiers = await memory.health()
    return { tiers: [...tiers] }
  },
})

/**
 * Low-level cross-tier operations for advanced control.
 */
export const memoryControl = defineTool({
  name: 'memory_control',
  description: 'Advanced memory operations: flush hot tier to cold, compact, or inspect internal state. For advanced use only.',
  parameters: {
    action: { type: 'string', required: true, enum: ['flush_hot', 'compact_cold', 'stats'], description: 'Operation to perform' },
    sessionId: { type: 'string', description: 'Optional session scope' },
  },
  output: {
    schema: { type: 'object', additionalProperties: false, properties: { result: { type: 'object', additionalProperties: false, properties: {} } } },
    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  },
  async execute(args: { action: 'flush_hot' | 'compact_cold' | 'stats'; sessionId?: string }, _exec) {
    const memory = requireMemory()
    const memoryCore = memory as unknown as {
      flush?: () => Promise<number>
      compact?: (sessionId?: string) => Promise<number>
      stats?: () => Promise<Record<string, unknown>>
    }
    switch (args.action) {
      case 'flush_hot': {
        const written = await memoryCore.flush?.() ?? 0
        return { result: { flushed: written } }
      }
      case 'compact_cold': {
        const compacted = await memoryCore.compact?.(args.sessionId) ?? 0
        return { result: { compacted } }
      }
      case 'stats': {
        return { result: { stats: await memoryCore.stats?.() ?? {} } }
      }
    }
  },
})

/**
 * Register all memory tools.
 */
export function apply(ctx: Context, _config: {}): void {
  memoryService = ctx.get('memory')
  ctx.tools.register(memoryAppend)
  ctx.tools.register(memoryRecall)
  ctx.tools.register(memoryRecent)
  ctx.tools.register(memoryForget)
  ctx.tools.register(memoryHealth)
  ctx.tools.register(memoryControl)
}
