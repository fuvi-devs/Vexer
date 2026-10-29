/**
 * Durable agent memory: the seam every backend implements.
 *
 * An agent with a small context window cannot hold a long conversation in
 * prompt. This service lets it reach outward instead: every session event is
 * appended to a durable store, and a recall query returns the material most
 * likely to answer the next turn. Backends split the job across tiers — a hot
 * tier for recent working set and vector proximity, a cold tier for the full
 * append-only history — and a deployment picks both.
 * @module @deepseek-ai/dsh-memory-core
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'

/** What kind of thing happened. Discriminant for every stored event. */
export type MemoryEventKind =
  /** A user turn. */
  | 'message'
  /** A tool call and its result. */
  | 'tool'
  /** An assistant turn. */
  | 'assistant'
  /** A decision or durable statement the agent committed to. */
  | 'decision'
  /** Anything a deployment defines beyond the built-in kinds. */
  | 'note'

/** One durable fact about one session. */
export interface MemoryEvent {
  /** Session this event belongs to. */
  readonly sessionId: string
  /** Agent that produced it. */
  readonly agentId: string
  /** Discriminant for the stored shape. */
  readonly kind: MemoryEventKind
  /** Text as the model would read it back. */
  readonly text: string
  /** Monotonic position within the session. */
  readonly seq: number
  /** Producer time in epoch milliseconds. */
  readonly at: number
  /** Free-form typed labels for filtering. */
  readonly tags: readonly string[]
  /** Embedding of {@link text}; absent when the producer cannot embed. */
  readonly vector?: readonly number[] | undefined
}

/** A query for material worth putting back in front of the model. */
export interface MemoryQuery {
  /** Session to search; other sessions are excluded unless {@link global} is set. */
  readonly sessionId: string
  /** Natural-language query. */
  readonly text: string
  /** Embedding of {@link text}, when the caller can embed. */
  readonly vector?: readonly number[] | undefined
  /** Maximum events to return. */
  readonly limit: number
  /** Restrict to these kinds. */
  readonly kinds?: readonly MemoryEventKind[] | undefined
  /** Include events from other sessions. */
  readonly global?: boolean | undefined
}

/** One recalled event plus where it came from. */
export interface MemoryHit {
  /** The stored event. */
  readonly event: MemoryEvent
  /** Relevance in [0,1]; higher is closer to the query. */
  readonly score: number
  /** Which tier answered, for latency accounting. */
  readonly tier: 'hot' | 'cold'
}

/** Outcome of an append. */
export interface MemoryWriteResult {
  /** Events durably accepted. */
  readonly written: number
  /** Tier that accepted them, or `null` when both failed. */
  readonly tier: 'hot' | 'cold' | null
}

/** Health of one tier. */
export interface MemoryTierStatus {
  /** Tier name. */
  readonly tier: 'hot' | 'cold'
  /** Whether the tier answered its last operation. */
  readonly ready: boolean
  /** Round-trip latency of the last operation, in milliseconds. */
  readonly latencyMs: number
  /** Failure detail when {@link ready} is false. */
  readonly error?: string | undefined
}

/**
 * The memory seam. A backend registers one implementation through
 * `ctx.provide('memory', …)`; deployments compose tiers by registering the
 * tier plugins, which attach to whichever backend is present.
 */
export abstract class Memory extends Service {
  constructor(ctx: Context) {
    super(ctx, 'memory')
  }

  /**
   * Append durable events. Must not throw for a partial write: a backend that
   * cannot accept an event reports it through the result and stays usable.
   * @param events - Events to store, already ordered by the caller.
   * @returns How many were accepted, and by which tier.
   */
  abstract append(events: readonly MemoryEvent[]): Promise<MemoryWriteResult>

  /**
   * Recall the material most relevant to a query.
   * @param query - The recall request.
   * @returns Ranked hits; an empty array means nothing matched, not a failure.
   */
  abstract recall(query: MemoryQuery): Promise<readonly MemoryHit[]>

  /**
   * Read the recent tail of a session, newest first.
   * @param sessionId - Session to read.
   * @param limit - Maximum events.
   * @returns The tail, newest first.
   */
  abstract recent(sessionId: string, limit: number): Promise<readonly MemoryEvent[]>

  /**
   * Forget one session across every tier.
   * @param sessionId - Session to purge.
   * @returns Whether a tier confirmed the purge.
   */
  abstract forget(sessionId: string): Promise<boolean>

  /**
   * Report tier health for operators.
   * @returns One status per configured tier.
   */
  abstract health(): Promise<readonly MemoryTierStatus[]>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The durable memory seam. */
    memory: Memory
  }
}

/** Bounded LRU of the last `n` events per session, used by hot tiers. */
export class WorkingSet {
  readonly #bySession = new Map<string, MemoryEvent[]>()
  readonly #capacity: number

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(`memory: working-set capacity must be a positive integer, got ${capacity}`)
    }
    this.#capacity = capacity
  }

  /**
   * Push events onto a session's tail, evicting the oldest beyond capacity.
   * @param events - Events in ascending `seq` order.
   */
  push(events: readonly MemoryEvent[]): void {
    const first = events[0]
    if (first === undefined) return
    const tail = this.#bySession.get(first.sessionId) ?? []
    for (const event of events) tail.push(event)
    while (tail.length > this.#capacity) tail.shift()
    this.#bySession.set(first.sessionId, tail)
  }

  /**
   * Read a session's tail.
   * @param sessionId - Session to read.
   * @returns The tail, newest first.
   */
  recent(sessionId: string): MemoryEvent[] {
    const tail = this.#bySession.get(sessionId) ?? []
    return [...tail].reverse()
  }

  /**
   * Drop a session from the working set.
   * @param sessionId - Session to drop.
   * @returns Whether the session was present.
   */
  forget(sessionId: string): boolean {
    return this.#bySession.delete(sessionId)
  }
}

/**
 * Cosine similarity between two vectors of equal length.
 * @param left - Left vector.
 * @param right - Right vector.
 * @returns Similarity in [-1,1]; 0 when lengths differ or either is empty.
 */
export function cosine(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let i = 0; i < left.length; i++) {
    const a = left[i] ?? 0
    const b = right[i] ?? 0
    dot += a * b
    leftNorm += a * a
    rightNorm += b * b
  }
  if (leftNorm === 0 || rightNorm === 0) return 0
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}
