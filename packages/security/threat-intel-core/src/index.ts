/**
 * Threat intelligence seam.
 *
 * The firewall is not a static rule list — it is a self-learning system.
 * Every blocked connection, every anomaly, every pattern is recorded and
 * fed back into the threat database. Kafka streams raw events, Spark
 * analyzes them, ClickHouse stores them, and the firewall adapts its rules
 * automatically. The agent can also inspect, block, whitelist, and report.
 *
 * The firewall LEARNS: it saves what it blocks, what it allows, and what
 * patterns emerge. Everything in the system learns from the firewall's
 * experience — the knowledge base, the agent's personality, the sub-agents.
 * @module @deepseek-ai/dsh-threat-intel-core
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export const name = 'threat-intel-core'

export interface ThreatEvent {
  readonly ip: string
  readonly port: number
  readonly protocol: 'tcp' | 'udp' | 'icmp' | 'any'
  readonly direction: 'in' | 'out' | 'any'
  readonly severity: 'low' | 'medium' | 'high' | 'critical'
  readonly reason: string
  readonly timestamp: number
  readonly action: 'blocked' | 'allowed' | 'flagged'
  readonly source: 'pf' | 'nutch' | 'spark' | 'agent'
  readonly tags: readonly string[]
}

export interface ThreatAnalysis {
  readonly ip: string
  readonly riskScore: number
  readonly classification: 'benign' | 'suspicious' | 'malicious' | 'unknown'
  readonly reasons: readonly string[]
  readonly firstSeen: number
  readonly lastSeen: number
  readonly eventCount: number
  readonly recommendedAction: 'allow' | 'block' | 'monitor'
}

export interface ThreatReport {
  readonly totalEvents: number
  readonly blockedCount: number
  readonly allowedCount: number
  readonly flaggedCount: number
  readonly topThreats: readonly ThreatAnalysis[]
  readonly timeRange: { from: number; to: number }
}

export abstract class ThreatIntel extends Service {
  constructor(ctx: Context) { super(ctx, 'threatIntel') }

  /** Record a threat event from any source. */
  abstract record(event: ThreatEvent): Promise<void>

  /** Analyze an IP or pattern. */
  abstract analyze(target: string): Promise<ThreatAnalysis>

  /** Block an IP or pattern. */
  abstract block(target: string, reason: string, duration?: number): Promise<void>

  /** Whitelist an IP or pattern. */
  abstract whitelist(target: string, reason: string): Promise<void>

  /** Generate a threat report. */
  abstract report(timeRange?: { from: number; to: number }): Promise<ThreatReport>

  /** Get the top threats. */
  abstract topThreats(limit?: number): Promise<readonly ThreatAnalysis[]>

  /** Health check. */
  abstract health(): Promise<{ ready: boolean; error?: string }>

  /** Close. */
  abstract close(): Promise<void>
  async [Symbol.asyncDispose](): Promise<void> { await this.close() }
}

declare module '@deepseek-ai/cordis' {
  interface Context { threatIntel: ThreatIntel }
}

export interface Config {
  clickhouseUrl: string
  redisUrl: string
  autoBlock: boolean
  autoBlockThreshold: number
  learnFromBlocks: boolean
  retentionDays: number
}

export const Config: z<Partial<Config>, Config> = z.object({
  clickhouseUrl: z.string().pattern(/^[\w+.-]+:\/\/\S+$/).default('http://127.0.0.1:8123'),
  redisUrl: z.string().pattern(/^[\w+.-]+:\/\/\S+$/).default('redis://127.0.0.1:6379'),
  autoBlock: z.boolean().default(false),
  autoBlockThreshold: z.number().min(0).max(1).default(0.85),
  learnFromBlocks: z.boolean().default(true),
  retentionDays: z.number().min(1).default(90),
})

export function apply(_ctx: Context, _config: Config): void {
  // The concrete backend (threat-intel-redis) provides the implementation.
}
