/**
 * Kafka client implementation over kafkajs.
 * @module @deepseek-ai/dsh-kafka-client
 */

import { Kafka, type Config } from '@deepseek-ai/dsh-kafka-core'
import type { Context } from '@deepseek-ai/cordis'
import type { KafkaMessage, KafkaTopic, KafkaConsumerGroup, KafkaHealth } from '@deepseek-ai/dsh-kafka-core'
import z from '@deepseek-ai/schemastery'
import { Kafka as Kafkajs } from 'kafkajs'

export const name = 'kafka-client'
export const inject = ['kafka']

export const KafkaConfig: z<Partial<Config>, Config> = z.object({
  brokers: z.array(z.string()).default(['localhost:9092']),
  clientId: z.string().min(1).default('vexer-agent'),
  ssl: z.boolean().default(false),
  saslMechanism: z.string().default(''),
  saslUsername: z.string().default(''),
  saslPassword: z.string().default(''),
  topicPrefix: z.string().min(1).default('vexer'),
})

export class KafkajsKafka extends Kafka {
  #client: Kafkajs
  #admin: ReturnType<Kafkajs['admin']>
  #producer: ReturnType<Kafkajs['producer']>
  #consumers = new Map<string, ReturnType<Kafkajs['consumer']>>()
  #config: Config
  #lastError: string | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.#config = config
    this.#client = new Kafkajs({
      clientId: config.clientId,
      brokers: config.brokers,
      ssl: config.ssl,
    })
    this.#admin = this.#client.admin()
    this.#producer = this.#client.producer()
  }

  async connect(): Promise<void> {
    await this.#admin.connect()
    await this.#producer.connect()
  }

  async publish(
    topic: string,
    value: string,
    key?: string,
    headers?: Record<string, string>,
  ): Promise<{ partition: number; offset: string }> {
    const prefixed = `${this.#config.topicPrefix}.${topic}`
    try {
      const result = await this.#producer.send({
        topic: prefixed,
        messages: [{ key: key ?? null, value, headers: headers as Record<string, string | Buffer> }],
      })
      const r = result[0]
      if (r === undefined) throw new Error(`kafka publish: producer returned no record for ${prefixed}`)
      return { partition: r.partition, offset: r.offset ?? '0' }
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  async subscribe(groupId: string, topics: string[], handler: (msg: KafkaMessage) => void | Promise<void>): Promise<void> {
    const consumer = this.#client.consumer({ groupId })
    await consumer.connect()
    for (const t of topics) {
      await consumer.subscribe({ topic: `${this.#config.topicPrefix}.${t}`, fromBeginning: false })
    }
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const msg: KafkaMessage = {
          topic,
          partition,
          offset: message.offset,
          key: message.key?.toString() ?? null,
          value: message.value?.toString() ?? '',
          timestamp: Number(message.timestamp),
          headers: Object.fromEntries(
            Object.entries(message.headers ?? {}).map(([k, v]) => [k, Buffer.isBuffer(v) ? v.toString() : String(v)]),
          ),
        }
        await handler(msg)
      },
    })
    this.#consumers.set(groupId, consumer)
  }

  async listTopics(): Promise<KafkaTopic[]> {
    const topics = await this.#admin.listTopics()
    const result: KafkaTopic[] = []
    for (const t of topics) {
      if (!t.startsWith(this.#config.topicPrefix + '.')) continue
      try {
        const metadata = await this.#admin.fetchTopicMetadata({ topics: [t] })
        const info = metadata.topics[0]
        result.push({
          name: t.slice(this.#config.topicPrefix.length + 1),
          partitions: info?.partitions.length ?? 0,
          replicationFactor: info?.partitions[0]?.replicas.length ?? 1,
          config: {},
        })
      } catch {
        result.push({ name: t.slice(this.#config.topicPrefix.length + 1), partitions: 0, replicationFactor: 0, config: {} })
      }
    }
    return result
  }

  async createTopic(name: string, partitions = 3, replicationFactor = 1): Promise<void> {
    const topic = `${this.#config.topicPrefix}.${name}`
    await this.#admin.createTopics({
      topics: [{ topic, numPartitions: partitions, replicationFactor }],
      waitForLeaders: true,
    })
  }

  async deleteTopic(name: string): Promise<void> {
    const topic = `${this.#config.topicPrefix}.${name}`
    await this.#admin.deleteTopics({ topics: [topic] })
  }

  async listConsumerGroups(): Promise<KafkaConsumerGroup[]> {
    const groups = await this.#admin.listGroups()
    const result: KafkaConsumerGroup[] = []
    for (const g of groups.groups) {
      try {
        const desc = await this.#admin.describeGroups([g.groupId])
        const group = desc.groups[0]
        result.push({
          groupId: group?.groupId ?? g.groupId,
          topics: [] as string[],
          members: group?.members.length ?? 0,
        })
      } catch {
        result.push({ groupId: g.groupId, topics: [], members: 0 })
      }
    }
    return result
  }

  async health(): Promise<KafkaHealth> {
    try {
      const cluster = await this.#admin.describeCluster()
      this.#lastError = undefined
      return {
        ready: true,
        brokers: cluster.brokers.length,
        controller: String(cluster.controller ?? ''),
      }
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error)
      return { ready: false, brokers: 0, controller: '', error: this.#lastError }
    }
  }

  async close(): Promise<void> {
    await this.#producer.disconnect().catch(() => undefined)
    for (const c of this.#consumers.values()) await c.disconnect().catch(() => undefined)
    await this.#admin.disconnect().catch(() => undefined)
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close()
  }
}

export function apply(ctx: Context, config: Config): void {
  const kafka = new KafkajsKafka(ctx, config)
  ctx.provide('kafka', kafka)
  void kafka.connect().catch(() => undefined)
}
