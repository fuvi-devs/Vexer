/**
 * Per-request credit charging.
 *
 * The guard sits on the `agent/request` waterfall — the exact boundary where
 * one model request becomes real work. Before the request runs the guard
 * asserts the account can cover it; when the request fails the guard refunds,
 * because the model produced nothing the customer can use. A successful
 * request is charged once, keyed by agent and turn so a retried step is never
 * billed twice.
 * @module @deepseek-ai/dsh-credit-guard
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Credits, InsufficientCreditsError } from '@deepseek-ai/dsh-credit-core'

export const name = 'credit-guard'

export interface Config {
  /** Micro-credits charged per model request. */
  costPerRequest: number
  /** Refund a request that failed. */
  refundOnFailure: boolean
  /** Accounts the guard never charges. */
  exemptAccounts: string[]
}

export const Config: z<Partial<Config>, Config> = z.object({
  costPerRequest: z.number().min(0).default(100_000),
  refundOnFailure: z.boolean().default(true),
  exemptAccounts: z.array(z.string()).default([]),
})

declare module '@deepseek-ai/cordis' {
  interface Context { credits: Credits }
  interface Events {
    'agent/request': (payload: { agent: { id: string }; turn: number; step: number; signal: AbortSignal }, next: () => Promise<unknown>) => Promise<unknown>
  }
}

interface AgentRequestPayload {
  agent: { id: string }
  turn: number
  step: number
  signal: AbortSignal
}

/** The key that identifies one billable request. */
function requestKey(agentId: string, turn: number, step: number): string {
  return `${agentId}:${String(turn)}:${String(step)}`
}

export function apply(ctx: Context, config: Config): void {
  const credits = ctx.get('credits')
  if (credits === undefined) return

  /** Keys of the requests already charged, so a retry is never billed twice. */
  const charged = new Set<string>()

  ctx.on('agent/request', async (payload: AgentRequestPayload, next: () => Promise<unknown>) => {
    const agentId = payload.agent.id
    if (config.exemptAccounts.includes(agentId)) return next()

    const key = requestKey(agentId, payload.turn, payload.step)
    if (charged.has(key)) return next()

    try {
      await credits.requireBalance(agentId, config.costPerRequest)
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        ctx.logger.warn(`credit-guard: denying request for ${agentId}: ${error.message}`)
        throw error
      }
      throw error
    }

    try {
      const config_ = await next()
      await credits.charge(agentId, config.costPerRequest, `usage:${key}`)
      charged.add(key)
      return config_
    } catch (error) {
      if (config.refundOnFailure) {
        // The request never produced billable work; no charge was taken.
        ctx.logger.debug(`credit-guard: request ${key} failed, nothing charged`)
      }
      throw error
    }
  })
}
