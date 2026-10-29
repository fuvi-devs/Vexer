/**
 * Apache Nutch web-crawler seam.
 *
 * Nutch is the acquisition layer of the Vexer memory pipeline: it crawls
 * the web from seed URLs, extracts text, and publishes pages to Kafka for
 * Spark to process and ClickHouse to store.
 * @module @deepseek-ai/dsh-nutch-core
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'nutch-core'

export interface NutchCrawlConfig {
  readonly seedUrls: readonly string[]
  readonly depth: number
  readonly topN: number
  readonly crawlId: string
  readonly status: 'running' | 'finished' | 'stopped' | 'failed'
  readonly startedAt: number
  readonly finishedAt?: number
}

export interface NutchCrawledPage {
  readonly url: string
  readonly title: string
  readonly text: string
  readonly fetchedAt: number
  readonly depth: number
}

export interface NutchCrawlStatus {
  readonly crawlId: string
  readonly status: 'running' | 'finished' | 'stopped' | 'failed'
  readonly fetched: number
  readonly skipped: number
  readonly queued: number
  readonly startedAt: number
  readonly finishedAt?: number
  readonly error?: string
}

export abstract class Nutch extends Service {
  constructor(ctx: Context) { super(ctx, 'nutch') }

  abstract crawl(config: { seedUrls: string[]; depth: number; topN: number }): Promise<NutchCrawlConfig>
  abstract status(crawlId: string): Promise<NutchCrawlStatus>
  abstract stop(crawlId: string): Promise<void>
  abstract listUrls(crawlId: string, limit?: number): Promise<NutchCrawledPage[]>
  abstract health(): Promise<{ ready: boolean; error?: string }>
  abstract close(): Promise<void>
  async [Symbol.asyncDispose](): Promise<void> { await this.close() }
}

declare module '@deepseek-ai/cordis' {
  interface Context { nutch: Nutch }
}

export interface Config {
  restUrl: string
  username: string
  password: string
  defaultDepth: number
  defaultTopN: number
}

export const Config = {
  restUrl: 'http://localhost:8080',
  username: '',
  password: '',
  defaultDepth: 3,
  defaultTopN: 100,
}

export function apply(_ctx: Context, _config: Config): void {
  // The concrete backend (nutch-client) provides the implementation.
}
