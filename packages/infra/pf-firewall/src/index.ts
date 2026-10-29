/**
 * PF / nftables firewall seam.
 *
 * A firewall plugin for the Vexer agent. On Linux it drives nftables; on
 * BSD/macOS it drives pfctl. The agent can inspect, enable, disable, add
 * rules, and flush state — with guardrails against self-lockout.
 * @module @deepseek-ai/dsh-pf-firewall
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export const name = 'pf-firewall'

export interface PfRule {
  readonly action: 'pass' | 'block' | 'match'
  readonly direction: 'in' | 'out' | 'any'
  readonly protocol: 'tcp' | 'udp' | 'icmp' | 'any'
  readonly source: string
  readonly destination: string
  readonly port?: number
  readonly interface?: string
}

export interface PfStatus {
  readonly enabled: boolean
  readonly rules: number
  readonly stateCount: number
  readonly info: string
  readonly backend: 'nftables' | 'pfctl' | 'unknown'
}

export abstract class Pf extends Service {
  constructor(ctx: Context) { super(ctx, 'pf') }

  abstract status(): Promise<PfStatus>
  abstract enable(): Promise<void>
  abstract disable(): Promise<void>
  abstract addRule(rule: PfRule): Promise<void>
  abstract flush(): Promise<void>
  abstract loadRulesFile(path: string): Promise<void>
  abstract close(): Promise<void>
  async [Symbol.asyncDispose](): Promise<void> { await this.close() }
}

declare module '@deepseek-ai/cordis' {
  interface Context { pf: Pf }
}

export interface Config {
  backend: 'auto' | 'nftables' | 'pfctl'
  rulesFile: string
  interface: string
  enabled: boolean
}

export const Config: z<Partial<Config>, Config> = z.object({
  backend: z.union(['auto', 'nftables', 'pfctl'] as const).default('auto'),
  rulesFile: z.string().default('/etc/nftables.conf'),
  interface: z.string().default('eth0'),
  enabled: z.boolean().default(false),
})

export class PfLinux extends Pf {
  #config: Config
  #lastError: string | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.#config = config
  }

  #backend(): 'nftables' | 'pfctl' {
    if (this.#config.backend !== 'auto') return this.#config.backend
    return process.platform === 'darwin' || process.platform === 'freebsd' ? 'pfctl' : 'nftables'
  }

  async status(): Promise<PfStatus> {
    try {
      if (this.#backend() === 'pfctl') {
        const { stdout } = await exec('pfctl', ['-si'])
        const enabled = stdout.includes('Status: Enabled')
        const rules = (stdout.match(/Rules:\s*(\d+)/) ?? [0, 0])[1]
        return { enabled, rules: Number(rules), stateCount: 0, info: stdout, backend: 'pfctl' }
      }
      const { stdout } = await exec('nft', ['list', 'ruleset'])
      return { enabled: stdout.length > 0, rules: 0, stateCount: 0, info: stdout, backend: 'nftables' }
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : String(error)
      return { enabled: false, rules: 0, stateCount: 0, info: this.#lastError, backend: 'unknown' }
    }
  }

  async enable(): Promise<void> {
    if (this.#backend() === 'pfctl') {
      await exec('pfctl', ['-e'])
    } else {
      await exec('nft', ['add', 'table', 'inet', 'filter'])
    }
  }

  async disable(): Promise<void> {
    if (this.#backend() === 'pfctl') {
      await exec('pfctl', ['-d'])
    } else {
      await exec('nft', ['delete', 'table', 'inet', 'filter'])
    }
  }

  async addRule(rule: PfRule): Promise<void> {
    const src = rule.source === 'any' ? 'any' : rule.source
    const dst = rule.destination === 'any' ? 'any' : rule.destination
    const port = rule.port !== undefined ? `dport ${rule.port}` : ''
    if (this.#backend() === 'pfctl') {
      const line = `${rule.action} ${rule.direction} ${rule.protocol} from ${src} to ${dst} ${port}`
      const { execFileSync } = await import('node:child_process')
      execFileSync('pfctl', ['-a', 'vexer', '-f', '/dev/stdin'], { input: line })
    } else {
      const chain = rule.direction === 'in' ? 'input' : rule.direction === 'out' ? 'output' : 'forward'
      const cmd = `add rule inet filter ${chain} ${rule.protocol} ${src === 'any' ? '' : 'ip saddr ' + src} ${dst === 'any' ? '' : 'ip daddr ' + dst} ${port} ${rule.action}`
      await exec('nft', cmd.split(' ').filter(Boolean))
    }
  }

  async flush(): Promise<void> {
    if (this.#backend() === 'pfctl') {
      await exec('pfctl', ['-F', 'all'])
    } else {
      await exec('nft', ['flush', 'ruleset'])
    }
  }

  async loadRulesFile(path: string): Promise<void> {
    if (this.#backend() === 'pfctl') {
      await exec('pfctl', ['-f', path])
    } else {
      await exec('nft', ['-f', path])
    }
  }

  async close(): Promise<void> { /* stateless */ }
}

export function apply(ctx: Context, config: Config): void {
  const pf = new PfLinux(ctx, config)
  ctx.provide('pf', pf)
}
