/**
 * Hot memory tier over Redis.
 *
 * Redis holds what a query must not wait on disk for: the tail of every live
 * session, a bounded recent-event index used for vector proximity, and a short
 * recall cache. It is configured by URL and works against a single node, a
 * Sentinel set, or a Cluster, so one deployment shape covers a laptop and a
 * data centre without a code change.
 * @module @deepseek-ai/dsh-memory-redis
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Cluster, Redis } from 'ioredis'

import { Memory } from '@deepseek-ai/dsh-memory-core'
import type {
  MemoryEvent, MemoryHit, MemoryQuery, MemoryTierStatus, MemoryWriteResult,
} from '@deepseek-ai/dsh-memory-core'

export const name = 'memory-redis'
export const inject = ['memory']

/** Hot-tier config. Every deployment-varying choice is a validated field. */
export interface Config {
  /** `redis://host:port`, `rediss://…`, or `cluster://node1,node2` for a cluster. */
  url: string
  /** Key namespace; separate deployments share one Redis safely. */
  keyPrefix: string
  /** Events retained per session in the working set. */
  sessionTail: number
  /** Events scanned per recall before ranking. Bounds recall latency. */
  scanLimit: number
  /** Seconds a recall result is cached. 0 disables the cache. */
  recallCacheTtl: number
  /** Recency half-life in seconds, used to rank equally similar hits. */
  recencyHalfLife: number
}

/** Validate Host configuration. Misconfiguration fails loud at plugin load. */
export const Config: z<Partial<Config>, Config> = z.object({
  url: z.string().min(1).default('redis://127.0.0.1:6379'),
  keyPrefix: z.string().min(1).default('vexer:memory:'),
  sessionTail: z.number().min(1).default(200),
  scanLimit: z.number().min(1).default(2000),
  recallCacheTtl: z.number().min(0).default(30),
  recencyHalfLife: z.number().min(0.01).default(3600),
})

/** Minimal surface of the ioredis client this tier uses. */
interface RedisLike {
  pipeline(): Pipeline
  get(key: string): Promise<string | null>
  set(key: string, value: string, ...args: string[]): Promise<unknown>
  del(...keys: string[]): Promise<number>
  lrange(key: string, start: number, stop: number): Promise<string[]>
  smembers(key: string): Promise<string[]>
  quit(): Promise<unknown>
}

/** Batch surface of the ioredis client this tier uses. */
interface Pipeline {
  rpush(key: string, ...values: string[]): Pipeline
  ltrim(key: string, start: number, stop: number): Pipeline
  expire(key: string, seconds: number): Pipeline
  sadd(key: string, ...members: string[]): Pipeline
  set(key: string, value: string, ...args: string[]): Pipeline
  exec(): Promise<[Error | null, unknown][] | null>
}

/** One Redis connection, a Cluster, or a lazily-opened client. */
type RedisConnection = Redis | Cluster

/** Decode a stored event, tolerating a value written by another version. */
function decodeEvent(raw: string): MemoryEvent | undefined {
  try {
    const value = JSON.parse(raw) as Partial<MemoryEvent> | null
    if (typeof value?.text !== 'string' || typeof value.sessionId !== 'string') return undefined
    return value as MemoryEvent
  } catch {
    return undefined
  }
}

/** Recency weight in [0,1] for an event, from the configured half-life. */
function recencyWeight(at: number, now: number, halfLife: number): number {
  const ageSeconds = Math.max(0, (now - at) / 1000)
  return Math.pow(0.5, ageSeconds / halfLife)
}

/**
 * Redis hot tier. Provides the `memory` service when no cold tier is
 * registered, and otherwise answers recalls ahead of the cold tier.
 */
export class RedisMemory extends Memory {
  #connection: RedisConnection
  #config: Config
  #lastLatency = 0
  #lastError: string | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.#config = config
    this.#connection = connect(config.url)
  }

  /** Keys for one session's working-set tail. */
  #tail(sessionId: string): string {
    return `${this.#config.keyPrefix}tail:${sessionId}`
  }

  /** Keys for one session's event index. */
  #index(sessionId: string): string {
    return `${this.#config.keyPrefix}idx:${sessionId}`
  }

  /** Keys for one stored event. */
  #event(id: string): string {
    return `${this.#config.keyPrefix}ev:${id}`
  }

  /** The connection narrowed to the surface this tier calls. */
  get #redis(): RedisLike {
    return this.#connection as unknown as RedisLike
  }

  async append(events: readonly MemoryEvent[]): Promise<MemoryWriteResult> {
    if (events.length === 0) return { written: 0, tier: 'hot' }
    const started = Date.now()
    const redis = this.#redis
    try {
      const sessions = new Map<string, MemoryEvent[]>()
      for (const event of events) {
        const list = sessions.get(event.sessionId) ?? []
        list.push(event)
        sessions.set(event.sessionId, list)
      }
      const pipe = redis.pipeline()
      for (const [sessionId, list] of sessions) {
        const payloads = list.map(event => JSON.stringify(event))
        pipe.rpush(this.#tail(sessionId), ...payloads)
        pipe.ltrim(this.#tail(sessionId), -this.#config.sessionTail, -1)
        pipe.sadd(this.#index(sessionId), ...list.map(event => this.#event(eventId(event))))
      }
      // Vectors and bodies land as individual keys so a scan never deserializes
      // more than the ranking step needs.
      for (const event of events) {
        const id = this.#event(eventId(event))
        pipe.set(id, JSON.stringify(event))
        pipe.expire(id, 86_400)
      }
      await pipe.exec()
      this.#lastLatency = Date.now() - started
      this.#lastError = undefined
      return { written: events.length, tier: 'hot' }
    } catch (error) {
      this.#lastLatency = Date.now() - started
      this.#lastError = error instanceof Error ? error.message : String(error)
      // A hot-tier miss is not a caller failure: the cold tier still holds the event.
      return { written: 0, tier: null }
    }
  }

  async recall(query: MemoryQuery): Promise<readonly MemoryHit[]> {
    const started = Date.now()
    const redis = this.#redis
    try {
      const limit = Math.max(1, query.limit)
      const cacheKey = `${this.#config.keyPrefix}rc:${query.sessionId}:${hashText(query.text)}:${limit}`
      if (this.#config.recallCacheTtl > 0) {
        const raw = await redis.get(cacheKey)
        if (raw !== null) {
          this.#lastLatency = Date.now() - started
          return JSON.parse(raw) as MemoryHit[]
        }
      }

      const raw = await redis.lrange(this.#tail(query.sessionId), 0, this.#config.scanLimit - 1)
      const hits: MemoryHit[] = []
      for (const item of raw) {
        const event = decodeEvent(item)
        if (event === undefined) continue
        if (query.kinds !== undefined && !query.kinds.includes(event.kind)) continue
        const similarity = query.vector !== undefined && event.vector !== undefined
          ? cosineLocal(query.vector, event.vector)
          : 0.5
        hits.push({
          event,
          score: similarity * 0.8 + recencyWeight(event.at, Date.now(), this.#config.recencyHalfLife) * 0.2,
          tier: 'hot',
        })
      }
      hits.sort((left, right) => right.score - left.score)
      const top = hits.slice(0, limit)
      if (this.#config.recallCacheTtl > 0) {
        await redis.set(cacheKey, JSON.stringify(top), 'EX', String(this.#config.recallCacheTtl))
      }
      this.#lastLatency = Date.now() - started
      this.#lastError = undefined
      return top
    } catch (error) {
      this.#lastLatency = Date.now() - started
      this.#lastError = error instanceof Error ? error.message : String(error)
      return []
    }
  }

  async recent(sessionId: string, limit: number): Promise<readonly MemoryEvent[]> {
    const redis = this.#redis
    try {
      const raw = await redis.lrange(this.#tail(sessionId), 0, Math.max(0, limit - 1))
      return raw.map((item: string) => decodeEvent(item)).filter((event): event is MemoryEvent => event !== undefined)
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error)
      return []
    }
  }

  async forget(sessionId: string): Promise<boolean> {
    const redis = this.#redis
    try {
      const members = await redis.smembers(this.#index(sessionId))
      const keys = [this.#tail(sessionId), this.#index(sessionId), ...members.map((id: string) => this.#event(id))]
      const removed = await this.#redis.del(...keys)
      return removed > 0
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  async health(): Promise<readonly MemoryTierStatus[]> {
    let ready = true
    try {
      await this.#redis.get(`${this.#config.keyPrefix}__ping`)
    } catch (error) {
      ready = false
      this.#lastError = error instanceof Error ? error.message : String(error)
    }
    return [{ tier: 'hot', ready, latencyMs: this.#lastLatency, ...(this.#lastError === undefined ? {} : { error: this.#lastError }) }]
  }

  /** Close the connection on service disposal. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.#connection.quit().catch(() => undefined)
  }
}

/** Stable id for an event, used as the per-event key. */
function eventId(event: MemoryEvent): string {
  return `${event.sessionId}:${event.seq}`
}

/** Stable short hash of recall text, for the cache key. */
function hashText(text: string): string {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

/** Cosine similarity; duplicated here to keep this package's imports to one. */
function cosineLocal(left: readonly number[], right: readonly number[]): number {
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

/**
 * Open a connection from a deployment URL. `cluster://` addresses a Cluster;
 * anything else is a single node or Sentinel-resolved primary.
 * @param url - Connection URL.
 * @returns An open client.
 */
function connect(url: string): RedisConnection {
  if (url.startsWith('cluster://')) {
    const nodes = url.slice('cluster://'.length).split(',').map(node => node.trim()).filter(Boolean)
    if (nodes.length === 0) throw new Error('memory-redis: cluster:// url lists no nodes')
    return new Cluster(nodes, { enableReadyCheck: true, enableOfflineQueue: true })
  }
  return new Redis(url, { maxRetriesPerRequest: 2, enableReadyCheck: true })
}

declare module '@deepseek-ai/dsh-memory-core' {
  interface Context {
    /** The Redis hot tier, addressable alongside the seam. */
    memoryRedis?: RedisMemory
  }
}

/**
 * Attach the hot tier. It becomes the `memory` service when nothing else has
 * claimed it, so a Redis-only deployment works with no further wiring.
 * @param ctx - Plugin context.
 * @param config - Validated hot-tier config.
 */
export function apply(ctx: Context, config: Config): void {
  const tier = new RedisMemory(ctx, config)
  ctx.provide('memoryRedis', tier)
  if (ctx.get('memory') === undefined) ctx.provide('memory', tier)
}
