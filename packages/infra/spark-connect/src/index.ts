/**
 * Apache Spark Connect client.
 * NOTE: @spark/spark-connect may not be available; this uses the Spark Connect
 * REST API via HTTP as a fallback (available in Spark 3.4+).
 * @module @deepseek-ai/dsh-spark-connect
 */

import { Spark } from '@deepseek-ai/dsh-spark-core'
import type { Context } from '@deepseek-ai/cordis'
import type { SparkJobConfig, SparkJobStatus, SparkClusterInfo } from '@deepseek-ai/dsh-spark-core'
import z from '@deepseek-ai/schemastery'

export const name = 'spark-connect'
export const inject = ['spark']

export interface Config {
  masterUrl: string
  sparkConnectUrl: string
  appName: string
  executorMemory: string
  numExecutors: number
}

export const Config: z<Partial<Config>, Config> = z.object({
  masterUrl: z.string().min(1).default('spark://localhost:7077'),
  sparkConnectUrl: z.string().min(1).default('sc://localhost:15002'),
  appName: z.string().min(1).default('vexer-agent'),
  executorMemory: z.string().min(1).default('2g'),
  numExecutors: z.number().min(1).default(2),
})

export class SparkRest extends Spark {
  #config: Config
  #lastError: string | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.#config = config
  }

  #url(path: string): string {
    return `${this.#config.sparkConnectUrl.replace(/\/$/, '')}${path}`
  }

  async submitJob(config: SparkJobConfig): Promise<SparkJobStatus> {
    const jobId = `job-${Date.now()}`
    const startedAt = Date.now()
    try {
      await fetch(this.#url('/submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appName: config.appName,
          mainClass: config.mainClass,
          jarPath: config.jarPath,
          pythonScript: config.pythonScript,
          args: config.args ?? [],
          sparkConf: {
            'spark.executor.memory': config.executorMemory ?? this.#config.executorMemory,
            'spark.executor.instances': String(config.numExecutors ?? this.#config.numExecutors),
            ...(config.sparkConf ?? {}),
          },
        }),
      })
      return { jobId, appId: jobId, name: config.appName, state: 'SUBMITTED', startTime: startedAt }
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error)
      return { jobId, appId: jobId, name: config.appName, state: 'FAILED', startTime: startedAt, error: this.#lastError }
    }
  }

  async jobStatus(jobId: string): Promise<SparkJobStatus> {
    try {
      const res = await fetch(this.#url(`/status/${jobId}`))
      const data = await res.json() as {
        appId?: string
        name?: string
        state?: string
        startTime?: number
        finishTime?: number
        error?: string
        logsUrl?: string
      }
      return {
        jobId,
        appId: data.appId ?? jobId,
        name: data.name ?? jobId,
        state: (data.state as SparkJobStatus['state'] | undefined) ?? 'UNKNOWN',
        startTime: data.startTime ?? Date.now(),
        ...(data.finishTime !== undefined ? { finishTime: data.finishTime } : {}),
        ...(data.error !== undefined ? { error: data.error } : {}),
        ...(data.logsUrl !== undefined ? { logsUrl: data.logsUrl } : {}),
      }
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error)
      return { jobId, appId: jobId, name: jobId, state: 'UNKNOWN', startTime: Date.now(), error: this.#lastError }
    }
  }

  async cancel(jobId: string): Promise<void> {
    await fetch(this.#url(`/cancel/${jobId}`), { method: 'POST' })
  }

  async listApps(): Promise<SparkJobStatus[]> {
    try {
      const res = await fetch(this.#url('/apps'))
      const data = await res.json() as {
        apps?: Array<{ jobId: string; appId?: string; name?: string; state?: string; startTime?: number; finishTime?: number }>
      }
      return (data.apps ?? []).map(a => ({
        jobId: a.jobId, appId: a.appId ?? a.jobId, name: a.name ?? a.jobId,
        state: (a.state as SparkJobStatus['state'] | undefined) ?? 'UNKNOWN',
        startTime: a.startTime ?? Date.now(),
        ...(a.finishTime !== undefined ? { finishTime: a.finishTime } : {}),
      }))
    } catch {
      return []
    }
  }

  async clusterInfo(): Promise<SparkClusterInfo> {
    try {
      const res = await fetch(this.#url('/cluster'))
      const data = await res.json() as {
        masterUrl?: string
        version?: string
        aliveWorkers?: number
        totalCores?: number
        totalMemory?: string
        activeApps?: number
      }
      return {
        masterUrl: data.masterUrl ?? this.#config.masterUrl,
        version: data.version ?? 'unknown',
        aliveWorkers: data.aliveWorkers ?? 0,
        totalCores: data.totalCores ?? 0,
        totalMemory: data.totalMemory ?? '0',
        activeApps: data.activeApps ?? 0,
      }
    } catch {
      return { masterUrl: this.#config.masterUrl, version: 'unknown', aliveWorkers: 0, totalCores: 0, totalMemory: '0', activeApps: 0 }
    }
  }

  async health(): Promise<{ ready: boolean; error?: string }> {
    try {
      const res = await fetch(this.#url('/health'))
      return { ready: res.ok }
    } catch (error) {
      return { ready: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async close(): Promise<void> { /* stateless HTTP client */ }
}

export function apply(ctx: Context, config: Config): void {
  const spark = new SparkRest(ctx, config)
  ctx.provide('spark', spark)
}
