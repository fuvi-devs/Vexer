/**
 * Threat intelligence implementation over the durable memory seam.
 *
 * Every threat event is a memory event, so the firewall's history lives in the
 * same store the agent's memory uses: the hot tier answers the recent
 * questions, the cold tier keeps the full record. A block is applied to the
 * firewall through the `pf` seam when one is mounted, and the block is
 * remembered whether or not the firewall is reachable, so the knowledge
 * survives a firewall that is down.
 * @module @deepseek-ai/dsh-threat-intel-memory
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { ThreatIntel } from '@deepseek-ai/dsh-threat-intel-core'
import type { ThreatAnalysis, ThreatEvent, ThreatReport } from '@deepseek-ai/dsh-threat-intel-core'
import { Memory } from '@deepseek-ai/dsh-memory-core'
import type { MemoryEvent } from '@deepseek-ai/dsh-memory-core'

export const name = 'threat-intel-memory'
export const inject = ['memory']

export interface Config {
  /** Session the threat store writes under. */
  sessionId: string
  /** Agent the threat store writes under. */
  agentId: string
  /** Risk score at or above which a threat is blocked automatically. */
  autoBlockThreshold: number
  /** Apply blocks to the firewall when one is mounted. */
  applyToFirewall: boolean
  /** Maximum threats a report returns. */
  reportLimit: number
}

export const Config: z<Partial<Config>, Config> = z.object({
  sessionId: z.string().min(1).default('vexer-threats'),
  agentId: z.string().min(1).default('vexer-agent'),
  autoBlockThreshold: z.number().min(0).max(1).default(0.85),
  applyToFirewall: z.boolean().default(true),
  reportLimit: z.number().min(1).default(10),
})

/** The firewall surface the threat engine writes blocks to. */
export interface FirewallWriter {
  addRule(rule: {
    action: 'pass' | 'block' | 'match'
    direction: 'in' | 'out' | 'any'
    protocol: 'tcp' | 'udp' | 'icmp' | 'any'
    source: string
    destination: string
    port?: number
  }): Promise<void>
}

/** Tag that marks an event as a threat record. */
const THREAT_TAG = 'vexer-threat'
/** Tag that marks an event as a block decision. */
const BLOCK_TAG = 'vexer-block'
/** Tag that marks an event as a whitelist decision. */
const ALLOW_TAG = 'vexer-allow'

/**
 * The threat engine. Analysis is a pure function over the stored events, so a
 * risk score is reproducible from the record that produced it.
 */
export class MemoryThreatIntel extends ThreatIntel {
  #memory: Memory
  #config: Config
  #seq = 0
  #firewall: FirewallWriter | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.#memory = ctx.memory
    this.#config = config
    const pf = ctx.get('pf') as unknown as FirewallWriter | undefined
    if (pf !== undefined) this.#firewall = pf
  }

  /** Store one threat event and return its identifier. */
  #store(text: string, tags: string[]): Promise<string> {
    const id = `${this.#config.sessionId}:${this.#seq++}`
    return this.#memory.append([{
      sessionId: this.#config.sessionId,
      agentId: this.#config.agentId,
      kind: 'note',
      text,
      tags,
      seq: this.#seq,
      at: Date.now(),
    }]).then(() => id)
  }

  async record(event: ThreatEvent): Promise<void> {
    await this.#store(JSON.stringify(event), [THREAT_TAG, event.ip, event.severity, event.action])
  }

  async analyze(target: string): Promise<ThreatAnalysis> {
    const events = await this.#events()
    const relevant = events.filter(event => event.tags.includes(target))
    if (relevant.length === 0) {
      return {
        ip: target,
        riskScore: 0,
        classification: 'unknown',
        reasons: ['no recorded activity for this target'],
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        eventCount: 0,
        recommendedAction: 'monitor',
      }
    }
    const blocked = relevant.filter(event => event.tags.includes('blocked')).length
    const flagged = relevant.filter(event => event.tags.includes('flagged')).length
    const critical = relevant.filter(event => event.tags.includes('critical')).length
    const riskScore = Math.min(1, (blocked * 0.4) + (flagged * 0.2) + (critical * 0.3))
    const classification = riskScore >= 0.7 ? 'malicious' : riskScore >= 0.35 ? 'suspicious' : 'benign'
    return {
      ip: target,
      riskScore,
      classification,
      reasons: [
        `${relevant.length} recorded event(s)`,
        `${blocked} blocked`,
        `${flagged} flagged`,
        ...(critical > 0 ? [`${critical} critical severity`] : []),
      ],
      firstSeen: Math.min(...relevant.map(event => event.at)),
      lastSeen: Math.max(...relevant.map(event => event.at)),
      eventCount: relevant.length,
      recommendedAction: riskScore >= this.#config.autoBlockThreshold ? 'block' : riskScore >= 0.35 ? 'monitor' : 'allow',
    }
  }

  async block(target: string, reason: string, duration?: number): Promise<void> {
    await this.#store(JSON.stringify({ target, reason, duration, action: 'blocked' }), [THREAT_TAG, BLOCK_TAG, target])
    if (this.#config.applyToFirewall && this.#firewall !== undefined) {
      await this.#firewall.addRule({
        action: 'block',
        direction: 'in',
        protocol: 'any',
        source: target,
        destination: 'any',
      })
    }
  }

  async whitelist(target: string, reason: string): Promise<void> {
    await this.#store(JSON.stringify({ target, reason, action: 'allowed' }), [THREAT_TAG, ALLOW_TAG, target])
  }

  async report(timeRange?: { from: number; to: number }): Promise<ThreatReport> {
    const events = await this.#events()
    const inRange = timeRange === undefined
      ? events
      : events.filter(event => event.at >= timeRange.from && event.at <= timeRange.to)
    const blocked = inRange.filter(event => event.tags.includes('blocked')).length
    const flagged = inRange.filter(event => event.tags.includes('flagged')).length
    const allowed = inRange.filter(event => event.tags.includes('allowed')).length
    const targets = [...new Set(inRange.map(event => event.tags[1] ?? '').filter(Boolean))]
    const topThreats: ThreatAnalysis[] = []
    for (const target of targets.slice(0, this.#config.reportLimit)) {
      topThreats.push(await this.analyze(target))
    }
    topThreats.sort((left, right) => right.riskScore - left.riskScore)
    return {
      totalEvents: inRange.length,
      blockedCount: blocked,
      allowedCount: allowed,
      flaggedCount: flagged,
      topThreats,
      timeRange: {
        from: timeRange?.from ?? Math.min(...inRange.map(event => event.at), Date.now()),
        to: timeRange?.to ?? Math.max(...inRange.map(event => event.at), Date.now()),
      },
    }
  }

  async topThreats(limit = 10): Promise<readonly ThreatAnalysis[]> {
    const report = await this.report()
    return report.topThreats.slice(0, limit)
  }

  async close(): Promise<void> {
    // The memory seam owns the store; the threat engine holds no resources of its own.
  }

  async health(): Promise<{ ready: boolean; error?: string }> {
    const tiers = await this.#memory.health()
    const ready = tiers.some(tier => tier.ready)
    const failed = tiers.find(tier => !tier.ready)
    return { ready, ...(failed?.error === undefined ? {} : { error: failed.error }) }
  }

  /** Read every stored threat event. */
  async #events(): Promise<readonly MemoryEvent[]> {
    const events = await this.#memory.recent(this.#config.sessionId, 1000)
    return events.filter(event => event.tags.includes(THREAT_TAG) || event.tags.includes(BLOCK_TAG) || event.tags.includes(ALLOW_TAG))
  }
}

export function apply(ctx: Context, config: Config): void {
  ctx.provide('threatIntel', new MemoryThreatIntel(ctx, config))
}
