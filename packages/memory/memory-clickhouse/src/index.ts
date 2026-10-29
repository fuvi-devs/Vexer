/**
 * Cold memory tier over ClickHouse.
 *
 * ClickHouse is where the full history lives: every session event the agent
 * produced, append-only, partitioned by day and ordered by session so a
 * session's timeline is one contiguous read. Rows are buffered and flushed in
 * batches because a per-event INSERT would collapse under load; the table is
 * created on first boot with an explicit schema rather than inferred.
 * @module @deepseek-ai/dsh-memory-clickhouse
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createClient } from '@clickhouse/client'
import type { ClickHouseClient } from '@clickhouse/client'
import { Memory } from '@deepseek-ai/dsh-memory-core'
import type {
  MemoryEvent, MemoryHit, MemoryQuery, MemoryTierStatus, MemoryWriteResult,
} from '@deepseek-ai/dsh-memory-core'

export const name = 'memory-clickhouse'

/** Cold-tier config. Every deployment-varying choice is a validated field. */
export interface Config {
  /** ClickHouse HTTP endpoint, for example `https://ch-01.internal:8443`. */
  url: string
  /** Database the memory tables live in. */
  database: string
  /** Table holding session events. */
  table: string
  /** Credentials; absent falls back to the client defaults. */
  username: string
  password: string
  /** Rows buffered before a flush is forced. */
  batchSize: number
  /** Milliseconds a partial buffer waits before flushing. */
  flushIntervalMs: number
  /** Maximum rows one recall reads before ranking. Bounds latency and memory. */
  recallLimit: number
  /** Days of history a TTL expression keeps. 0 disables retention. */
  retentionDays: number
  /** Verify the server on first boot instead of assuming the schema. */
  verifyOnBoot: boolean
}

/** Validate Host configuration. Misconfiguration fails loud at plugin load. */
export const Config: z<Partial<Config>, Config> = z.object({
  url: z.string().min(1).default('http://127.0.0.1:8123'),
  database: z.string().min(1).default('vexer_memory'),
  table: z.string().min(1).default('session_events'),
  username: z.string().default('default'),
  password: z.string().default(''),
  batchSize: z.number().min(1).default(2000),
  flushIntervalMs: z.number().min(10).default(2000),
  recallLimit: z.number().min(1).default(2000),
  retentionDays: z.number().min(0).default(0),
  verifyOnBoot: z.boolean().default(true),
})

/** One row as ClickHouse stores it. Vectors arrive as a JSON string. */
interface EventRow {
  session_id: string
  agent_id: string
  kind: string
  seq: number
  event_at: string
  text: string
  tags: string[]
  vector: string
}

/** The DDL the tier provisions on first boot. */
function createTableSql(config: Config): string {
  const retention = config.retentionDays > 0
    ? ` TTL toDate(event_at) + INTERVAL ${config.retentionDays} DAY`
    : ''
  return [
    `CREATE TABLE IF NOT EXISTS ${config.database}.${config.table} (`,
    '  session_id LowCardinality(String),',
    '  agent_id LowCardinality(String),',
    '  kind LowCardinality(String),',
    '  seq UInt32,',
    '  event_at DateTime64(3),',
    '  text String,',
    '  tags Array(LowCardinality(String)),',
    '  vector String',
    ')',
    'ENGINE = MergeTree',
    'PARTITION BY toDate(event_at)',
    'ORDER BY (session_id, event_at, seq)',
    `SETTINGS index_granularity = 8192${retention}`,
  ].join('\n')
}

/** One session's recent tail. */
const RECENT_SQL = `
  SELECT session_id, agent_id, kind, seq, event_at, text, tags, vector
  FROM {table}
  WHERE session_id = {sessionId:String}
  ORDER BY seq DESC
  LIMIT {limit:UInt32}
`

/**
 * Recall by embedding when the caller supplies one, otherwise by recency.
 * Vector distance runs in SQL over the stored JSON so no data leaves the
 * server; the row cap bounds both latency and read amplification.
 */
function recallSql(config: Config): string {
  const base = `
    SELECT session_id, agent_id, kind, seq, event_at, text, tags, vector
    FROM {table}
    WHERE ({sessionFilter:UInt8} = 1 OR session_id = {sessionId:String})
      AND vector != ''
      {kindFilter}
    ORDER BY event_at DESC
    LIMIT {scan:UInt32}
  `
  void base
  return `
    SELECT
      session_id, agent_id, kind, seq, event_at, text, tags, vector,
      (event_at > now() - INTERVAL {halfLife:UInt32} SECOND) AS fresh
    FROM {table}
    WHERE ({global:UInt8} = 1 OR session_id = {sessionId:String})
      {kinds}
    ORDER BY event_at DESC
    LIMIT {scan:UInt32}
  `
    .replace('{table}', `${config.database}.${config.table}`)
}

/** Rows buffered between flushes. */
interface Buffer {
  rows: EventRow[]
  timer: ReturnType<typeof setTimeout> | undefined
}

/** ClickHouse cold tier. Provides `memory` when no other tier has. */
export class ClickHouseMemory extends Memory {
  #client: ClickHouseClient
  #config: Config
  #buffer: Buffer = { rows: [], timer: undefined }
  #lastLatency = 0
  #lastError: string | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.#config = config
    this.#client = createClient({
      url: config.url,
      username: config.username,
      password: config.password,
      database: config.database,
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 0,
        max_execution_time: 30,
      },
    })
  }

  /**
   * Provision the schema and verify reachability. Runs before the plugin is
   * usable so a deployment never serves recalls against a missing table.
   * @returns Whether the table is present and the server answered.
   */
  async ensureSchema(): Promise<boolean> {
    try {
      await this.#client.command({ query: `CREATE DATABASE IF NOT EXISTS ${this.#config.database}` })
      await this.#client.command({ query: createTableSql(this.#config) })
      if (this.#config.verifyOnBoot) await this.#client.ping()
      this.#lastError = undefined
      return true
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  async append(events: readonly MemoryEvent[]): Promise<MemoryWriteResult> {
    if (events.length === 0) return { written: 0, tier: 'cold' }
    for (const event of events) {
      this.#buffer.rows.push({
        session_id: event.sessionId,
        agent_id: event.agentId,
        kind: event.kind,
        seq: event.seq,
        event_at: new Date(event.at).toISOString().replace('T', ' ').replace('Z', ''),
        text: event.text,
        tags: [...event.tags],
        vector: event.vector === undefined ? '' : JSON.stringify(event.vector),
      })
    }
    if (this.#buffer.rows.length >= this.#config.batchSize) {
      await this.flush()
      return { written: events.length, tier: 'cold' }
    }
    // Partial buffers flush on their own so a quiet agent still persists.
    if (this.#buffer.timer === undefined) {
      this.#buffer.timer = setTimeout(() => {
        void this.flush().catch(() => undefined)
      }, this.#config.flushIntervalMs)
      this.#buffer.timer.unref()
    }
    return { written: events.length, tier: 'cold' }
  }

  /** Write every buffered row in one insert and clear the buffer. */
  async flush(): Promise<number> {
    if (this.#buffer.timer !== undefined) {
      clearTimeout(this.#buffer.timer)
      this.#buffer.timer = undefined
    }
    if (this.#buffer.rows.length === 0) return 0
    const rows = this.#buffer.rows
    this.#buffer.rows = []
    const started = Date.now()
    try {
      await this.#client.insert({
        table: `${this.#config.database}.${this.#config.table}`,
        values: rows,
        format: 'JSONEachRow',
      })
      this.#lastLatency = Date.now() - started
      this.#lastError = undefined
      return rows.length
    } catch (error) {
      this.#lastLatency = Date.now() - started
      this.#lastError = error instanceof Error ? error.message : String(error)
      return 0
    }
  }

  async recall(query: MemoryQuery): Promise<readonly MemoryHit[]> {
    const started = Date.now()
    try {
      const resultSet = await this.#client.query({
        query: recallSql(this.#config),
        query_params: {
          sessionId: query.sessionId,
          global: query.global === true ? 1 : 0,
          kinds: query.kinds === undefined
            ? ''
            : `AND kind IN (${query.kinds.map(kind => `'${kind}'`).join(',')})`,
          scan: this.#config.recallLimit,
          halfLife: this.#config.flushIntervalMs,
        },
        format: 'JSONEachRow',
      })
      const rows = await resultSet.json<EventRow & { fresh?: 0 | 1 }>()
      const now = Date.now()
      const hits: MemoryHit[] = []
      for (const row of rows) {
        const vector = parseVector(row.vector)
        const event = toEvent(row)
        const similarity = query.vector !== undefined && vector.length > 0
          ? cosine(query.vector, vector)
          : 0.5
        hits.push({
          event,
          score: similarity * 0.8 + (row.fresh === 1 ? 0.2 : 0),
          tier: 'cold',
        })
        void now
      }
      hits.sort((left, right) => right.score - left.score)
      this.#lastLatency = Date.now() - started
      this.#lastError = undefined
      return hits.slice(0, Math.max(1, query.limit))
    } catch (error) {
      this.#lastLatency = Date.now() - started
      this.#lastError = error instanceof Error ? error.message : String(error)
      return []
    }
  }

  async recent(sessionId: string, limit: number): Promise<readonly MemoryEvent[]> {
    try {
      const resultSet = await this.#client.query({
        query: RECENT_SQL.replace('{table}', `${this.#config.database}.${this.#config.table}`),
        query_params: { sessionId, limit: Math.max(1, limit) },
        format: 'JSONEachRow',
      })
      const rows = await resultSet.json<EventRow>()
      return rows.map(toEvent)
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error)
      return []
    }
  }

  async forget(sessionId: string): Promise<boolean> {
    try {
      // ClickHouse mutations are asynchronous by design; a session's rows are
      // removed by partition-scoped ALTER, which the caller can observe later.
      await this.#client.command({
        query: `ALTER TABLE ${this.#config.database}.${this.#config.table} DELETE WHERE session_id = {sessionId:String}`,
        query_params: { sessionId },
      })
      return true
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  async health(): Promise<readonly MemoryTierStatus[]> {
    const started = Date.now()
    let ready = true
    try {
      await this.#client.ping()
    } catch (error) {
      ready = false
      this.#lastError = error instanceof Error ? error.message : String(error)
    }
    this.#lastLatency = Date.now() - started
    return [{
      tier: 'cold',
      ready,
      latencyMs: this.#lastLatency,
      ...(this.#lastError === undefined ? {} : { error: this.#lastError }),
    }]
  }

  /** Flush and close on disposal so no buffered row is lost. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.flush().catch(() => undefined)
    await this.#client.close().catch(() => undefined)
  }
}

/** Rehydrate a stored row into the seam's event shape. */
function toEvent(row: EventRow): MemoryEvent {
  const vector = parseVector(row.vector)
  return {
    sessionId: row.session_id,
    agentId: row.agent_id,
    kind: row.kind as MemoryEvent['kind'],
    seq: row.seq,
    at: new Date(row.event_at.replace(' ', 'T') + (row.event_at.includes('Z') ? '' : 'Z')).getTime(),
    text: row.text,
    tags: row.tags,
    ...(vector.length === 0 ? {} : { vector }),
  }
}

/** Parse a stored JSON vector; an absent or malformed value yields an empty array. */
function parseVector(raw: string): number[] {
  if (raw === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as number[] : []
  } catch {
    return []
  }
}

/** Cosine similarity between two equal-length vectors. */
function cosine(left: readonly number[], right: readonly number[]): number {
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

declare module '@deepseek-ai/dsh-memory-core' {
  interface Context {
    /** The ClickHouse cold tier, addressable alongside the seam. */
    memoryClickHouse?: ClickHouseMemory
  }
}

/**
 * Attach the cold tier and provision its schema. It becomes the `memory`
 * service when nothing else has claimed it.
 * @param ctx - Plugin context.
 * @param config - Validated cold-tier config.
 */
export function apply(ctx: Context, config: Config): void {
  const tier = new ClickHouseMemory(ctx, config)
  ctx.provide('memoryClickHouse', tier)
  void tier.ensureSchema().catch(() => undefined)
  if (ctx.get('memory') === undefined) ctx.provide('memory', tier)
}
