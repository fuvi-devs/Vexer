/**
 * Nutch client over the Nutch REST API.
 * @module @deepseek-ai/dsh-nutch-client
 */

import { Nutch } from '@deepseek-ai/dsh-nutch-core'
import type { Context } from '@deepseek-ai/cordis'
import type { NutchCrawlConfig, NutchCrawledPage, NutchCrawlStatus } from '@deepseek-ai/dsh-nutch-core'
import z from '@deepseek-ai/schemastery'

export const name = 'nutch-client'
export const inject = ['nutch']

export interface Config {
  restUrl: string
  username: string
  password: string
  defaultDepth: number
  defaultTopN: number
}

export const Config: z<Partial<Config>, Config> = z.object({
  restUrl: z.string().min(1).default('http://localhost:8080'),
  username: z.string().default(''),
  password: z.string().default(''),
  defaultDepth: z.number().min(1).default(3),
  defaultTopN: z.number().min(1).default(100),
})

export class NutchRest extends Nutch {
  #config: Config
  #lastError: string | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.#config = config
  }

  #headers(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.#config.username && this.#config.password) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${this.#config.username}:${this.#config.password}`).toString('base64')
    }
    return headers
  }

  #url(path: string): string {
    return `${this.#config.restUrl.replace(/\/$/, '')}${path}`
  }

  async crawl(config: { seedUrls: string[]; depth: number; topN: number }): Promise<NutchCrawlConfig> {
    const startedAt = Date.now()
    const crawlId = `crawl-${startedAt}`
    try {
      await fetch(this.#url('/rest/crawl'), {
        method: 'POST',
        headers: this.#headers(),
        body: JSON.stringify({ seedUrls: config.seedUrls, depth: config.depth, topN: config.topN, crawlId }),
      })
      return { seedUrls: config.seedUrls, depth: config.depth, topN: config.topN, crawlId, status: 'running', startedAt }
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error)
      return { seedUrls: config.seedUrls, depth: config.depth, topN: config.topN, crawlId, status: 'failed', startedAt }
    }
  }

  async status(crawlId: string): Promise<NutchCrawlStatus> {
    try {
      const res = await fetch(this.#url(`/rest/crawl/${crawlId}/status`), { headers: this.#headers() })
      const data = await res.json() as {
        fetched?: number
        skipped?: number
        queued?: number
        status?: string
        startedAt?: number
        finishedAt?: number
      }
      return {
        crawlId,
        status: (data.status as NutchCrawlStatus['status'] | undefined) ?? 'running',
        fetched: data.fetched ?? 0,
        skipped: data.skipped ?? 0,
        queued: data.queued ?? 0,
        startedAt: data.startedAt ?? Date.now(),
        ...(data.finishedAt !== undefined ? { finishedAt: data.finishedAt } : {}),
      }
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error)
      return { crawlId, status: 'failed', fetched: 0, skipped: 0, queued: 0, startedAt: Date.now(), error: this.#lastError }
    }
  }

  async stop(crawlId: string): Promise<void> {
    await fetch(this.#url(`/rest/crawl/${crawlId}/stop`), { method: 'POST', headers: this.#headers() })
  }

  async listUrls(crawlId: string, limit = 100): Promise<NutchCrawledPage[]> {
    try {
      const res = await fetch(this.#url(`/rest/crawl/${crawlId}/urls?limit=${limit}`), { headers: this.#headers() })
      const data = await res.json() as { urls?: Array<{ url: string; title?: string; text?: string; fetchedAt?: number; depth?: number }> }
      return (data.urls ?? []).map(u => ({
        url: u.url, title: u.title ?? '', text: u.text ?? '',
        fetchedAt: u.fetchedAt ?? Date.now(), depth: u.depth ?? 0,
      }))
    } catch {
      return []
    }
  }

  async health(): Promise<{ ready: boolean; error?: string }> {
    try {
      const res = await fetch(this.#url('/rest/health'), { headers: this.#headers() })
      return { ready: res.ok }
    } catch (error) {
      return { ready: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async close(): Promise<void> { /* HTTP client is stateless */ }
}

export function apply(ctx: Context, config: Config): void {
  const nutch = new NutchRest(ctx, config)
  ctx.provide('nutch', nutch)
}
