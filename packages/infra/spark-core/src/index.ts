/**
 * Apache Spark seam.
 * @module @deepseek-ai/dsh-spark-core
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'

export const name = 'spark-core'

export interface SparkJobConfig {
  readonly appName: string
  readonly mainClass?: string
  readonly jarPath?: string
  readonly pythonScript?: string
  readonly args?: readonly string[]
  readonly sparkConf?: Readonly<Record<string, string>>
  readonly executorMemory?: string
  readonly numExecutors?: number
}

export interface SparkJobStatus {
  readonly jobId: string
  readonly appId: string
  readonly name: string
  readonly state: 'SUBMITTED' | 'RUNNING' | 'FINISHED' | 'FAILED' | 'KILLED' | 'UNKNOWN'
  readonly startTime: number
  readonly finishTime?: number
  readonly error?: string
  readonly logsUrl?: string
}

export interface SparkClusterInfo {
  readonly masterUrl: string
  readonly version: string
  readonly aliveWorkers: number
  readonly totalCores: number
  readonly totalMemory: string
  readonly activeApps: number
}

export abstract class Spark extends Service {
  constructor(ctx: Context) { super(ctx, 'spark') }

  abstract submitJob(config: SparkJobConfig): Promise<SparkJobStatus>
  abstract jobStatus(jobId: string): Promise<SparkJobStatus>
  abstract cancel(jobId: string): Promise<void>
  abstract listApps(): Promise<SparkJobStatus[]>
  abstract clusterInfo(): Promise<SparkClusterInfo>
  abstract health(): Promise<{ ready: boolean; error?: string }>
  abstract close(): Promise<void>
  async [Symbol.asyncDispose](): Promise<void> { await this.close() }
}

declare module '@deepseek-ai/cordis' {
  interface Context { spark: Spark }
}

export interface Config {
  masterUrl: string
  sparkConnectUrl: string
  appName: string
  executorMemory: string
  numExecutors: number
}

export const Config = {
  masterUrl: 'spark://localhost:7077',
  sparkConnectUrl: 'sc://localhost:15002',
  appName: 'vexer-agent',
  executorMemory: '2g',
  numExecutors: 2,
}

export function apply(_ctx: Context, _config: Config): void {
  // The concrete backend (spark-connect) provides the implementation.
}
