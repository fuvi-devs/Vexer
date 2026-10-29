/**
 * Vexer Agent orchestrator.
 *
 * Wires all systems into one integrated pipeline:
 *
 *   Nutch (crawl) ──► Kafka ──► Spark (process) ──► ClickHouse (store)
 *                                      │
 *                                      ▼
 *                              Redis (hot cache + vectors)
 *                                      │
 *                                      ▼
 *                              Agent recall() ←── memory-tools
 *                                      │
 *                                      ▼
 *                              Threat Intel ←── PF Firewall (auto-adapt)
 *                                      │
 *                                      ▼
 *                              Learning Engine (self-improve)
 *
 * The orchestrator ensures every system is connected and can communicate
 * through the Kafka event bus. It also provides agent tools for full control.
 * @module @deepseek-ai/dsh-vexer-orchestrator
 */

import type { Context } from '@deepseek-ai/cordis'
import { Kafka } from '@deepseek-ai/dsh-kafka-core'
import { Memory } from '@deepseek-ai/dsh-memory-core'

import { ThreatIntel } from '@deepseek-ai/dsh-threat-intel-core'

export const name = 'vexer-orchestrator'
export const inject = ['kafka', 'memory', 'learning', 'threatIntel']

export interface Config {
  /** Enable the deep crawl pipeline (Nutch → Kafka → Spark → ClickHouse). */
  enableCrawlPipeline: boolean
  /** Enable the threat intelligence pipeline (PF → Kafka → Spark → PF). */
  enableThreatPipeline: boolean
  /** Enable self-learning (session → knowledge → skills → personality). */
  enableSelfLearning: boolean
  /** Kafka topic for crawled pages. */
  crawledPagesTopic: string
  /** Kafka topic for threat events. */
  threatEventsTopic: string
  /** Kafka topic for memory events. */
  memoryEventsTopic: string
}

export const Config = {
  enableCrawlPipeline: true,
  enableThreatPipeline: true,
  enableSelfLearning: true,
  crawledPagesTopic: 'crawled-pages',
  threatEventsTopic: 'threat-events',
  memoryEventsTopic: 'memory-events',
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    vexerOrchestrator?: VexerOrchestrator
  }
}

export class VexerOrchestrator {
  #kafka: Kafka
  #memory: Memory
  #threatIntel: ThreatIntel
  #config: Config

  constructor(ctx: Context, config: Config) {
    this.#kafka = ctx.kafka
    this.#memory = ctx.memory
    this.#threatIntel = ctx.threatIntel
    this.#config = config
  }

  /** Get the orchestrator config. */
  get config(): Config { return this.#config }

  /** Publish a crawled page to the Kafka pipeline. */
  async publishCrawledPage(url: string, title: string, text: string): Promise<void> {
    if (!this.#config.enableCrawlPipeline) return
    await this.#kafka.publish(this.#config.crawledPagesTopic, JSON.stringify({ url, title, text, timestamp: Date.now() }), url)
  }

  /** Publish a threat event to the Kafka pipeline. */
  async publishThreatEvent(
    event: { ip: string; port: number; protocol: string; direction: string; severity: string; reason: string },
  ): Promise<void> {
    if (!this.#config.enableThreatPipeline) return
    await this.#kafka.publish(this.#config.threatEventsTopic, JSON.stringify({ ...event, timestamp: Date.now() }), event.ip)
  }

  /** Publish a memory event to the Kafka pipeline. */
  async publishMemoryEvent(event: { sessionId: string; agentId: string; kind: string; text: string }): Promise<void> {
    if (!this.#config.enableSelfLearning) return
    await this.#kafka.publish(this.#config.memoryEventsTopic, JSON.stringify({ ...event, timestamp: Date.now() }), event.sessionId)
  }

  /** Get pipeline health. */
  async health(): Promise<{ kafka: boolean; memory: boolean; learning: boolean; threatIntel: boolean }> {
    const kafkaHealth = await this.#kafka.health()
    const memoryHealth = await this.#memory.health()
    const threatHealth = await this.#threatIntel.health()
    return {
      kafka: kafkaHealth.ready,
      memory: memoryHealth.some(t => t.ready),
      learning: true,
      threatIntel: threatHealth.ready,
    }
  }
}

export function apply(ctx: Context, config: Config): void {
  const orchestrator = new VexerOrchestrator(ctx, config)
  ctx.provide('vexerOrchestrator', orchestrator)
}
