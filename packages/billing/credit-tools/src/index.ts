/**
 * Agent-facing tools for the credit system.
 * @module @deepseek-ai/dsh-credit-tools
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { Credits, formatCredits } from '@deepseek-ai/dsh-credit-core'
import type { CreditTransaction } from '@deepseek-ai/dsh-credit-core'

export const name = 'credit-tools'
export const inject = ['credits']

export interface Config {}

export const Config: z<Partial<Config>, Config> = z.object({})

declare module '@deepseek-ai/cordis' {
  interface Context { credits: Credits }
}

let creditsService: Credits | undefined

/** Read the credit service, failing loudly when no backend is mounted. */
function service(): Credits {
  if (creditsService === undefined) throw new Error('credit-tools: no credits backend is mounted')
  return creditsService
}

/** The account a call acts on: the agent's own id unless one is given. */
function accountOf(args: { accountId?: string }, exec: { agent?: { id: string } }): string {
  const accountId = args.accountId ?? exec.agent?.id
  if (accountId === undefined) throw new Error('credit-tools: no account id in arguments and no agent in scope')
  return accountId
}

export const creditBalance = defineTool({
  name: 'credit_balance',
  description: 'Check the credit balance of an account. One credit pays for one simple request; one US dollar buys ten credits.',
  parameters: {
    accountId: { type: 'string', description: 'Account to check (defaults to the current agent)' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        accountId: { type: 'string' },
        balance: { type: 'number' },
        balanceText: { type: 'string' },
      },
    },
    render: (_args, value) => [{
      type: 'text',
      text: `${(value as { accountId: string }).accountId}: ${(value as { balanceText: string }).balanceText}`,
    }],
  },
  async execute(args: { accountId?: string }, exec) {
    const accountId = accountOf(args, exec)
    const balance = await service().balance(accountId)
    return { accountId, balance, balanceText: formatCredits(balance) }
  },
})

export const creditPurchase = defineTool({
  name: 'credit_purchase',
  description: 'Buy credits. One US dollar buys ten credits; one credit pays for one simple request. Returns the payment link when a gateway produced one.',
  parameters: {
    amountUsd: { type: 'number', required: true, description: 'Amount in US dollars to pay' },
    accountId: { type: 'string', description: 'Account to credit (defaults to the current agent)' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        applied: { type: 'boolean' },
        granted: { type: 'number' },
        grantedText: { type: 'string' },
        balance: { type: 'number' },
        balanceText: { type: 'string' },
        paymentUrl: { type: 'string' },
      },
    },
    render: (_args, value) => {
      const v = value as { applied: boolean; grantedText: string; balanceText: string; paymentUrl?: string }
      const link = v.paymentUrl === undefined ? '' : `\nPay at: ${v.paymentUrl}`
      return [{ type: 'text', text: `${v.applied ? 'Purchased' : 'Not applied'}: ${v.grantedText} — balance ${v.balanceText}${link}` }]
    },
  },
  async execute(args: { amountUsd: number; accountId?: string }, exec) {
    const accountId = accountOf(args, exec)
    const ref = `purchase:${accountId}:${String(args.amountUsd)}:${String(Date.now())}`
    const result = await service().purchase({ accountId, amountUsd: args.amountUsd, ref })
    return {
      applied: result.applied,
      granted: result.granted,
      grantedText: formatCredits(result.granted),
      balance: result.balance,
      balanceText: formatCredits(result.balance),
      ...(result.paymentUrl === undefined ? {} : { paymentUrl: result.paymentUrl }),
    }
  },
})

export const creditHistory = defineTool({
  name: 'credit_history',
  description: 'Read an account credit ledger: purchases, usage charges, transfers, and grants, newest first.',
  parameters: {
    accountId: { type: 'string', description: 'Account to read (defaults to the current agent)' },
    limit: { type: 'integer', default: 20, description: 'Maximum events to return' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        accountId: { type: 'string' },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: { type: 'string' },
              accountId: { type: 'string' },
              delta: { type: 'number' },
              reason: { type: 'string' },
              amountUsd: { type: 'number' },
              at: { type: 'number' },
              ref: { type: 'string' },
            },
          },
        },
      },
    },
    render: (_args, value) => {
      const v = value as { accountId: string; entries: CreditTransaction[] }
      if (v.entries.length === 0) return [{ type: 'text', text: 'No credit movements recorded.' }]
      return [{
        type: 'text',
        text: v.entries.map(e => `${new Date(e.at).toISOString()} ${e.reason} ${e.delta >= 0 ? '+' : ''}${formatCredits(e.delta)}`).join('\n'),
      }]
    },
  },
  async execute(args: { accountId?: string; limit?: number }, exec) {
    const accountId = accountOf(args, exec)
    const entries = await service().history(accountId, args.limit ?? 20)
    return { accountId, entries: [...entries] }
  },
})

export const creditTransfer = defineTool({
  name: 'credit_transfer',
  description: 'Move credits from one account to another. Both sides are recorded in their ledgers.',
  parameters: {
    to: { type: 'string', required: true, description: 'Account receiving the credits' },
    amount: { type: 'number', required: true, description: 'Credits to move (whole credits)' },
    from: { type: 'string', description: 'Account to debit (defaults to the current agent)' },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        transferred: { type: 'number' },
        balance: { type: 'number' },
        balanceText: { type: 'string' },
      },
    },
    render: (_args, value) => {
      const v = value as { transferred: number; balanceText: string }
      return [{ type: 'text', text: `Transferred ${String(v.transferred)} credits — balance ${v.balanceText}` }]
    },
  },
  async execute(args: { to: string; amount: number; from?: string }, exec) {
    const fromArg = args.from !== undefined ? { accountId: args.from } : {}
    const from = accountOf(fromArg, exec)
    const ref = `transfer:${from}:${args.to}:${String(args.amount)}:${String(Date.now())}`
    await service().transfer(from, args.to, Math.round(args.amount * 1_000_000), ref)
    const balance = await service().balance(from)
    return { transferred: args.amount, balance, balanceText: formatCredits(balance) }
  },
})

export function apply(ctx: Context, _config: {}): void {
  creditsService = ctx.get('credits')
  ctx.tools.register(creditBalance)
  ctx.tools.register(creditPurchase)
  ctx.tools.register(creditHistory)
  ctx.tools.register(creditTransfer)
}
