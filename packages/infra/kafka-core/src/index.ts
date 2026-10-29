/**
 * Kafka event-streaming seam.
 *
 * Kafka is the data backbone of the Vexer system: Nutch publishes crawled
 * pages here, Spark consumes and processes them, and ClickHouse stores the
 * results. Every tier (hot Redis, cold ClickHouse) reads from the same
 * topics, so a single event log feeds the whole pipeline.
 * @module @deepseek-ai/dsh-kafka-core
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'kafka-core'

/** A single message on a topic. */
export interface KafkaMessage {
  readonly topic: string
  readonly partition: number
  readonly offset: string
  readonly key: string | null
  readonly value: string
  readonly timestamp: number
  readonly headers: Record<string, string>
}

/** Consumer group descriptor. */
export interface KafkaConsumerGroup {
  readonly groupId: string
  readonly topics: readonly string[]
  readonly members: number
}

/** Topic descriptor. */
export interface KafkaTopic {
  readonly name: string
  readonly partitions: number
  readonly replicationFactor: number
  readonly config: Readonly<Record<string, string>>
}

/** Health of the Kafka cluster. */
export interface KafkaHealth {
  readonly ready: boolean
  readonly brokers: number
  readonly controller: string
  readonly error?: string
}

/**
 * The Kafka seam. Backends register their implementation through
 * `ctx.provide('kafka', …)`.
 */
export abstract class Kafka extends Service {
  constructor(ctx: Context) { super(ctx, 'kafka') }

  /** Publish a message to a topic. */
  abstract publish(
    topic: string,
    value: string,
    key?: string,
    headers?: Record<string, string>,
  ): Promise<{ partition: number; offset: string }>

  /** Subscribe to a topic with a consumer group. */
  abstract subscribe(groupId: string, topics: string[], handler: (msg: KafkaMessage) => void | Promise<void>): Promise<void>

  /** List topics in the cluster. */
  abstract listTopics(): Promise<KafkaTopic[]>

  /** Create a topic if it doesn't exist. */
  abstract createTopic(name: string, partitions?: number, replicationFactor?: number): Promise<void>

  /** Delete a topic. */
  abstract deleteTopic(name: string): Promise<void>

  /** List consumer groups. */
  abstract listConsumerGroups(): Promise<KafkaConsumerGroup[]>

  /** Cluster health. */
  abstract health(): Promise<KafkaHealth>

  /** Graceful shutdown. */
  abstract close(): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The Kafka event-streaming seam. */
    kafka: Kafka
  }
}

/** Plugin config. */
export interface Config {
  brokers: string[]
  clientId: string
  ssl: boolean
  saslMechanism?: string
  saslUsername?: string
  saslPassword?: string
  topicPrefix: string
}

export const inject = []

export function apply(_ctx: Context, _config: Config): void {
  // The concrete backend (kafka-kafkajs) provides the implementation.
  // This seam is registered by the backend plugin.
}
