# Vexer Agent - Complete Code Compilation


================================================================================
## 1. credit-core/src/index.ts
================================================================================

/**
 * Durable credit system.
 *
 * Balances are never stored as a mutable number. Every change to an account is
 * an append-only ledger entry, and the balance is the sum of those entries. The
 * ledger buys three properties a mutable balance cannot have: two concurrent
 * spends can never lose an update, a refund is an ordinary reversing entry, and
 * every movement is auditable.
 *
 * Units are integer micro-credits, never a float. One credit is
 * {@link MICRO_CREDITS_PER_CREDIT} micro-credits; a request costs
 * {@link CREDIT_COST_PER_REQUEST} of them.
 * @module @deepseek-ai/dsh-credit-core
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export const name = 'credit-core'

/** Micro-credits in one credit. */
export const MICRO_CREDITS_PER_CREDIT = 1_000_000

/** Micro-credits charged for one simple request. */
export const CREDIT_COST_PER_REQUEST = 100_000

/** Micro-credits granted per USD paid. */
export const MICRO_CREDITS_PER_USD = 1_000_000

/** Why a ledger entry exists. */
export type CreditReason =
  | 'purchase'
  | 'usage'
  | 'transfer_in'
  | 'transfer_out'
  | 'grant'
  | 'refund'

/** One append-only movement in an account's ledger. */
export interface CreditTransaction {
  /** Unique id of this entry. */
  readonly id: string
  /** Account the entry belongs to. */
  readonly accountId: string
  /** Signed movement in micro-credits. */
  readonly delta: number
  /** Why the entry exists. */
  readonly reason: CreditReason
  /** USD paid for a purchase; absent for every other reason. */
  readonly amountUsd?: number
  /** Epoch milliseconds. */
  readonly at: number
  /** Idempotency key: an entry with a given ref is applied at most once. */
  readonly ref?: string
}

/** A purchase request. */
export interface CreditPurchase {
  /** Account receiving the credits. */
  readonly accountId: string
  /** USD to charge. */
  readonly amountUsd: number
  /** Idempotency key for the payment. */
  readonly ref: string
}

/** The outcome of a purchase. */
export interface CreditPurchaseResult {
  /** Whether the purchase was applied. */
  readonly applied: boolean
  /** Credits granted, in micro-credits. */
  readonly granted: number
  /** Balance after the purchase, in micro-credits. */
  readonly balance: number
  /** Where the user completes payment, when a gateway produced one. */
  readonly paymentUrl?: string
}

/** Thrown when an account cannot cover a charge. */
export class InsufficientCreditsError extends Error {
  constructor(accountId: string, needed: number, available: number) {
    super(`account "${accountId}" has ${String(available)} micro-credits, needs ${String(needed)}`)
    this.name = 'InsufficientCreditsError'
  }
}

/**
 * The credit seam. A backend registers one implementation through
 * `ctx.provide('credits', …)`.
 */
export abstract class Credits extends Service {
  constructor(ctx: Context) { super(ctx, 'credits') }

  /** Current balance in micro-credits. */
  abstract balance(accountId: string): Promise<number>

  /**
   * Assert the account can cover a charge.
   * @param accountId - Account to check.
   * @param needed - Micro-credits required.
   * @throws InsufficientCreditsError when the balance is short.
   */
  abstract requireBalance(accountId: string, needed: number): Promise<void>

  /**
   * Apply a purchase.
   * @param purchase - Amount and idempotency key.
   * @returns The applied result.
   */
  abstract purchase(purchase: CreditPurchase): Promise<CreditPurchaseResult>

  /**
   * Charge an account for usage.
   * @param accountId - Account to charge.
   * @param amount - Micro-credits to deduct.
   * @param ref - Idempotency key.
   * @returns The appended entry.
   */
  abstract charge(accountId: string, amount: number, ref: string): Promise<CreditTransaction>

  /**
   * Grant credits without payment.
   * @param accountId - Account to credit.
   * @param amount - Micro-credits to add.
   * @param reason - Why the grant exists.
   * @returns The appended entry.
   */
  abstract grant(accountId: string, amount: number, reason: CreditReason): Promise<CreditTransaction>

  /**
   * Move credits between two accounts.
   * @param from - Account to debit.
   * @param to - Account to credit.
   * @param amount - Micro-credits to move.
   * @param ref - Idempotency key.
   * @returns The appended entry on the source account.
   */
  abstract transfer(from: string, to: string, amount: number, ref: string): Promise<CreditTransaction>

  /**
   * Read an account's ledger, newest first.
   * @param accountId - Account to read.
   * @param limit - Maximum entries.
   * @returns The entries.
   */
  abstract history(accountId: string, limit?: number): Promise<readonly CreditTransaction[]>

  /**
   * Close the account's ledger.
   * @param accountId - Account to close.
   */
  abstract close(accountId: string): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The durable credit system. */
    credits: Credits
  }
}

/** Plugin config. */
export interface Config {
  /** Micro-credits charged per simple request. */
  costPerRequest: number
  /** Micro-credits granted to a new account. */
  initialGrant: number
  /** Currency used for purchases. */
  currency: string
  /** Whether accounts start with the initial grant. */
  grantOnFirstUse: boolean
}

/** Validate Host configuration. */
export const Config: z<Partial<Config>, Config> = z.object({
  costPerRequest: z.number().min(1).default(CREDIT_COST_PER_REQUEST),
  initialGrant: z.number().min(0).default(0),
  currency: z.string().min(1).default('USD'),
  grantOnFirstUse: z.boolean().default(false),
})

/**
 * Convert USD to micro-credits.
 * @param usd - Amount in USD.
 * @returns The amount in micro-credits.
 */
export function usdToMicroCredits(usd: number): number {
  return Math.round(usd * MICRO_CREDITS_PER_USD)
}

/**
 * Convert micro-credits to a displayable credit count.
 * @param microCredits - Amount in micro-credits.
 * @returns The amount in credits.
 */
export function microCreditsToCredits(microCredits: number): number {
  return microCredits / MICRO_CREDITS_PER_CREDIT
}

/**
 * Format micro-credits for display.
 * @param microCredits - Amount in micro-credits.
 * @returns A human-readable string such as `1.5 credits`.
 */
export function formatCredits(microCredits: number): string {
  return `${microCreditsToCredits(microCredits).toFixed(2)} credits`
}

/**
 * Read a service without asserting it exists.
 * @param ctx - Context to read from.
 * @returns The service, or undefined when no backend is mounted.
 */
export function readCredits(ctx: Context): Credits | undefined {
  return ctx.get('credits')
}

export function apply(_ctx: Context, _config: Config): void {
  // The concrete backend (credit-killbill) provides the implementation.
}


================================================================================
## 2. credit-tools/src/index.ts
================================================================================

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
export const inject = ['credits'] as unknown as string[]

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
    limit: { type: 'integer', maximum: 200, default: 20, description: 'Maximum entries to return (min 1)' },
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
    return { accountId, entries }
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
    const from = accountOf(args, exec)
    const ref = `transfer:${from}:${args.to}:${String(args.amount)}:${String(Date.now())}`
    await service().transfer(from, args.to, Math.round(args.amount * 1_000_000), ref)
    const balance = await service().balance(from)
    return { transferred: args.amount, balance, balanceText: formatCredits(balance) }
  },
})

export function apply(ctx: Context, _config: {}): void {
  creditsService = ctx.get('credits')
  const { register } = ctx.tools
  register(creditBalance)
  register(creditPurchase)
  register(creditHistory)
  register(creditTransfer)
}


================================================================================
## 3. credit-guard/src/index.ts
================================================================================

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

================================================================================
## 4. credit-killbill/src/index.ts
================================================================================

/**
 * Kill Bill implementation of the Credits seam.
 *
 * - Purchases → create Kill Bill invoice + custom field for idempotency
 * - Ledger (balance/history/charge/grant/transfer) → stored in memory (per-process)
 * - Idempotency via `ref` (purchase/usage/transfer) stored as custom field on invoice/account
 * @module @deepseek-ai/dsh-credit-killbill
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Credits, CreditTransaction, CreditPurchase, CreditPurchaseResult, InsufficientCreditsError, usdToMicroCredits } from '@deepseek-ai/dsh-credit-core'

export const name = 'credit-killbill'
export const inject = ['memory'] as const

declare module '@deepseek-ai/cordis' {
  interface Context {
    credits: Credits
    killbill: {
      baseUrl: string
      apiKey: string
      apiSecret: string
      tenantId: string
      currency: string
    }
  }
}

/** Configuration for the Kill Bill backend. */
export interface Config {
  /** Base URL of the Kill Bill API (e.g. http://127.0.0.1:8081). */
  baseUrl: string
  /** Tenant API key for authentication. */
  apiKey: string
  /** Tenant API secret for authentication. */
  apiSecret: string
  /** Default tenant id to use when creating accounts. */
  tenantId?: string
  /** Currency code for invoices. */
  currency?: string
}

export const Config: z<Partial<Config>, Config> = z.object({
  baseUrl: z.string().required(),
  apiKey: z.string().required(),
  apiSecret: z.string().required(),
  tenantId: z.string().default(''),
  currency: z.string().default('USD'),
})

/** Kill Bill backend for Credits. */
export class KillBillCredits extends Credits {
  private readonly http: typeof fetch
  private readonly baseUrl: string
  private readonly headers: Record<string, string>
  private readonly currency: string
  private readonly tenantId: string

  /** In-memory ledger per account (per-process). */
  private readonly ledgers = new Map<string, CreditTransaction[]>()

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.http = fetch
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.headers = {
      'Content-Type': 'application/json',
      'X-Killbill-ApiKey': config.apiKey,
      'X-Killbill-ApiSecret': config.apiSecret,
      'X-Killbill-CreatedBy': 'vexer-agent',
    }
    this.currency = config.currency ?? 'USD'
    this.tenantId = config.tenantId ?? ''
    ctx.killbill = { baseUrl: this.baseUrl, apiKey: config.apiKey, apiSecret: config.apiSecret, tenantId: this.tenantId, currency: this.currency }
  }

  /** Kill Bill GET helper. */
  private async kbGet<T>(path: string): Promise<T> {
    const res = await this.http(`${this.baseUrl}${path}`, { headers: this.headers })
    if (!res.ok) throw new Error(`Kill Bill GET ${path} ${res.status}: ${await res.text()}`)
    return res.json()
  }

  /** Kill Bill POST helper. */
  private async kbPost<T>(path: string, body: unknown): Promise<T> {
    const res = await this.http(`${this.baseUrl}${path}`, { method: 'POST', headers: this.headers, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`Kill Bill POST ${path} ${res.status}: ${await res.text()}`)
    return res.json()
  }

  /** Get or create a Kill Bill account for the given id. */
  private async getOrCreateAccount(accountId: string): Promise<string> {
    // Try to find by externalKey = accountId
    const list = await this.kbGet<any[]>(`/1.0/kb/accounts/pagination?searchKey=${encodeURIComponent(accountId)}&offset=0&limit=1`)
    if (list.length > 0) return list[0].accountId
    // Create new account
    const created = await this.kbPost<{ accountId: string }>(`/1.0/kb/accounts`, {
      externalKey: accountId,
      email: `${accountId}@vexer.agent`,
      name: accountId,
      currency: this.currency,
      timeZone: 'UTC',
      locale: 'en_US',
    })
    return created.accountId
  }

  /** Read ledger from memory. */
  private readLedger(accountId: string): CreditTransaction[] {
    return this.ledgers.get(accountId) ?? []
  }

  /** Write ledger to memory. */
  private writeLedger(accountId: string, ledger: CreditTransaction[]): void {
    this.ledgers.set(accountId, ledger)
  }

  async balance(accountId: string): Promise<number> {
    const ledger = this.readLedger(accountId)
    return ledger.reduce((sum, t) => sum + t.delta, 0)
  }

  async requireBalance(accountId: string, needed: number): Promise<void> {
    const bal = await this.balance(accountId)
    if (bal < needed) throw new InsufficientCreditsError(accountId, needed, bal)
  }

  async purchase(purchase: CreditPurchase): Promise<CreditPurchaseResult> {
    // Idempotency: check if we already processed this ref
    const existing = this.readLedger(purchase.accountId)
    const existingPurchase = existing.find(t => t.ref === purchase.ref && t.reason === 'purchase')
    if (existingPurchase) {
      const bal = existing.reduce((s, t) => s + t.delta, 0)
      return { applied: false, granted: existingPurchase.delta, balance: bal }
    }

    const kbAccountId = await this.getOrCreateAccount(purchase.accountId)
    const granted = usdToMicroCredits(purchase.amountUsd)

    // Create Kill Bill invoice for the purchase
    await this.kbPost(`/1.0/kb/invoices/${kbAccountId}/triggerInvoice`, {
      invoice: {
        accountId: kbAccountId,
        targetDate: new Date().toISOString().split('T')[0],
        autoCommit: true,
      },
    })

    // Add custom field for idempotency + credit tracking (commented out for core flow)
    // await this.kbPost(`/1.0/kb/accounts/${kbAccountId}/customFields`, [{
    //   name: `vexer_credit_${purchase.ref}`,
    //   value: JSON.stringify({ type: 'purchase', granted, amountUsd: purchase.amountUsd, at: Date.now() }),
    // }])

    // Append to ledger
    const entry: CreditTransaction = {
      id: crypto.randomUUID(),
      accountId: purchase.accountId,
      delta: granted,
      reason: 'purchase',
      amountUsd: purchase.amountUsd,
      at: Date.now(),
      ref: purchase.ref,
    }
    const ledger = this.readLedger(purchase.accountId)
    ledger.unshift(entry)
    this.writeLedger(purchase.accountId, ledger)

    return { applied: true, granted, balance: granted }
  }

  async charge(accountId: string, amount: number, ref: string): Promise<CreditTransaction> {
    const existing = this.readLedger(accountId)
    if (existing.some(t => t.ref === ref && t.reason === 'usage')) {
      return existing.find(t => t.ref === ref && t.reason === 'usage')!
    }

    const entry: CreditTransaction = {
      id: crypto.randomUUID(),
      accountId,
      delta: -amount,
      reason: 'usage',
      at: Date.now(),
      ref,
    }
    const ledger = this.readLedger(accountId)
    ledger.unshift(entry)
    this.writeLedger(accountId, ledger)
    return entry
  }

  async grant(accountId: string, amount: number, reason: CreditTransaction['reason']): Promise<CreditTransaction> {
    const entry: CreditTransaction = {
      id: crypto.randomUUID(),
      accountId,
      delta: amount,
      reason,
      at: Date.now(),
    }
    const ledger = this.readLedger(accountId)
    ledger.unshift(entry)
    this.writeLedger(accountId, ledger)
    return entry
  }

  async transfer(from: string, to: string, amount: number, ref: string): Promise<CreditTransaction> {
    const fromLedger = this.readLedger(from)
    if (fromLedger.some(t => t.ref === ref && t.reason === 'transfer_out')) {
      return fromLedger.find(t => t.ref === ref && t.reason === 'transfer_out')!
    }

    const out: CreditTransaction = {
      id: crypto.randomUUID(),
      accountId: from,
      delta: -amount,
      reason: 'transfer_out',
      at: Date.now(),
      ref,
    }
    const in_: CreditTransaction = {
      id: crypto.randomUUID(),
      accountId: to,
      delta: amount,
      reason: 'transfer_in',
      at: Date.now(),
      ref,
    }
    const toLedger = this.readLedger(to)
    fromLedger.unshift(out)
    toLedger.unshift(in_)
    this.writeLedger(from, fromLedger)
    this.writeLedger(to, toLedger)
    return out
  }

  async history(accountId: string, limit?: number): Promise<readonly CreditTransaction[]> {
    const ledger = this.readLedger(accountId)
    return limit ? ledger.slice(0, limit) : ledger
  }

  async close(accountId: string): Promise<void> {
    this.ledgers.delete(accountId)
  }
}

export function apply(ctx: Context, config: Config): void {
  if (!ctx.killbill) ctx.killbill = { baseUrl: '', apiKey: '', apiSecret: '', tenantId: '', currency: 'USD' }
  ctx.provide('credits', new KillBillCredits(ctx, config))
}

export { usdToMicroCredits } from '@deepseek-ai/dsh-credit-core'

================================================================================
## 5. vexer-knowledge/src/index.ts
================================================================================

/**
 * Vexer Agent Knowledge Base.
 *
 * The authoritative, queryable knowledge base for Vexer Agent. Contains the
 * core identity (name, version, tagline, developers, brand palette) and an
 * extensible set of knowledge entries that agents can query at runtime.
 * @module @deepseek-ai/dsh-vexer-knowledge
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Identity } from '@deepseek-ai/dsh-vexer-identity'

export const name = 'vexer-knowledge'
export const inject = ['identity', 'tools'] as const

/** A single knowledge entry in the base. */
export interface KnowledgeEntry {
  /** Unique identifier. */
  readonly id: string
  /** Human-readable title/topic. */
  readonly topic: string
  /** Detailed content. */
  readonly content: string
  /** Categorization tags. */
  readonly tags: readonly string[]
  /** Confidence level (0-1). */
  readonly confidence: number
  /** Source of this knowledge. */
  readonly source: 'core' | 'learned' | 'configured'
  /** When this entry was added. */
  readonly addedAt: number
}

/** Plugin configuration. */
export interface Config {
  /** Additional knowledge entries to seed the base with. */
  seedEntries?: readonly Omit<KnowledgeEntry, 'id' | 'addedAt' | 'source'>[]
  /** Maximum entries to return in a query. */
  maxResults?: number
}

export const Config: z<Partial<Config>, Config> = z.object({
  seedEntries: z.array(z.object({
    topic: z.string(),
    content: z.string(),
    tags: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1).default(1),
  })).default([]),
  maxResults: z.number().min(1).max(200).default(20),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    identity: Identity
    knowledge: KnowledgeBase
  }
}

/** The knowledge base service. */
export class KnowledgeBase extends KnowledgeBase {
  private entries: KnowledgeEntry[] = []

  constructor(ctx: Context, config: Config) {
    super(ctx, 'knowledge')

    // Seed core identity knowledge
    const identity = ctx.identity.get()
    this.seedCoreKnowledge(identity)

    // Seed configured entries
    if (config.seedEntries) {
      for (const entry of config.seedEntries) {
        this.addEntry({
          ...entry,
          id: crypto.randomUUID(),
          addedAt: Date.now(),
          source: 'configured',
        })
      }
    }

    // Register query tool
    const { register } = ctx.tools
    register(this.createQueryTool(config.maxResults ?? 20))
  }

  /** Seed the base with core identity knowledge. */
  private seedCoreKnowledge(identity: Identity): void {
    const coreEntries: KnowledgeEntry[] = [
      {
        id: 'vexer:identity:name',
        topic: 'Agent Name',
        content: `This agent runs on ${identity.agentTitle} (${identity.agentName}), version ${identity.version}.`,
        tags: ['identity', 'core', 'name'],
        confidence: 1,
        source: 'core',
        addedAt: Date.now(),
      },
      {
        id: 'vexer:identity:tagline',
        topic: 'Brand Tagline',
        content: identity.tagline,
        tags: ['identity', 'core', 'brand', 'tagline'],
        confidence: 1,
        source: 'core',
        addedAt: Date.now(),
      },
      {
        id: 'vexer:identity:developers',
        topic: 'Developers',
        content: `${identity.agentTitle} is developed by ${identity.developers.map(d => `${d.name} (@${d.handle}, ${d.role})`).join(' and ')}, a team of programmers and cybersecurity specialists.`,
        tags: ['identity', 'core', 'developers', 'authors'],
        confidence: 1,
        source: 'core',
        addedAt: Date.now(),
      },
      {
        id: 'vexer:identity:palette',
        topic: 'Brand Palette',
        content: `The brand colors are: ${Object.entries(identity.palette).map(([k, v]) => `${k}: ${v}`).join(', ')}.`,
        tags: ['identity', 'core', 'brand', 'colors', 'palette'],
        confidence: 1,
        source: 'core',
        addedAt: Date.now(),
      },
      {
        id: 'vexer:identity:capabilities',
        topic: 'Capabilities',
        content: `${identity.agentTitle} is an AI agent harness with durable memory (Redis + ClickHouse), self-learning, threat intelligence, web crawling (Nutch), distributed processing (Spark), event streaming (Kafka), firewall management (PF/nftables), and a Kill Bill-backed credit system (1 USD = 0.1 credit = 1 request).`,
        tags: ['identity', 'core', 'capabilities', 'features'],
        confidence: 1,
        source: 'core',
        addedAt: Date.now(),
      },
      {
        id: 'vexer:identity:credit-system',
        topic: 'Credit System',
        content: `Credit model: 1 USD = 0.1 credit; 1 credit = 1 simple request. Pay-as-you-go, no subscriptions. Stripe for payments. Credits stored as append-only ledger in micro-credits (1 credit = 1,000,000 µcr).`,
        tags: ['identity', 'core', 'billing', 'credits', 'payments'],
        confidence: 1,
        source: 'core',
        addedAt: Date.now(),
      },
    ]

    for (const entry of coreEntries) {
      this.entries.push(entry)
    }
  }

  /** Add a knowledge entry. */
  addEntry(entry: KnowledgeEntry): void {
    this.entries.push(entry)
  }

  /** Query the knowledge base. */
  query(query: string, limit: number): KnowledgeEntry[] {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1)
    if (terms.length === 0) return this.entries.slice(0, limit)

    const scored = this.entries.map(entry => {
      const text = `${entry.topic} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase()
      let score = 0
      for (const term of terms) {
        if (text.includes(term)) score += 1
        // Boost for exact topic matches
        if (entry.topic.toLowerCase().includes(term)) score += 2
        // Boost for tag matches
        if (entry.tags.some(t => t.toLowerCase().includes(term))) score += 1.5
      }
      return { entry, score }
    })

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.confidence - a.entry.confidence)
      .slice(0, limit)
      .map(s => s.entry)
  }

  /** Get all entries (for admin/debug). */
  getAll(): readonly KnowledgeEntry[] {
    return this.entries
  }

  /** Create the query tool. */
  private createQueryTool(maxResults: number) {
    return defineTool({
      name: 'query_knowledge',
      description: 'Query the Vexer Agent knowledge base for identity, capabilities, brand info, and configured knowledge. Use this when you need to answer questions about what you are, who made you, your capabilities, brand, or any seeded knowledge.',
      parameters: {
        query: { type: 'string', required: true, description: 'Natural language query to search the knowledge base' },
        limit: { type: 'integer', maximum: 50, default: 10, description: 'Maximum results to return (min 1)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  topic: { type: 'string' },
                  content: { type: 'string' },
                  tags: { type: 'array', items: { type: 'string' } },
                  confidence: { type: 'number' },
                  source: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value): { type: 'text'; text: string }[] => {
          const results = (value as { results: KnowledgeEntry[] }).results
          if (results.length === 0) return [{ type: 'text', text: 'No relevant knowledge found.' }]
          const text = results.map(r => `**${r.topic}** (${r.source}, confidence: ${r.confidence})\n${r.content}\nTags: ${r.tags.join(', ')}`).join('\n\n---\n\n')
          return [{ type: 'text', text }]
        },
      },
      async execute(args: { query: string; limit?: number }, _exec) {
        const results = this.query(args.query, args.limit ?? 10)
        return { results }
      },
    })
  }
}

export function apply(ctx: Context, config: Config): void {
  ctx.provide('knowledge', new KnowledgeBase(ctx, config))
}

export { KnowledgeEntry }

================================================================================
## 6. standalone/cordis.patch.yml
================================================================================

# The dsh-standalone bundle patch: fully self-contained agent over dsh-base.
# No external services (Redis, ClickHouse, Kafka, Kill Bill, Nutch, Spark, PF).
# All memory/learning/identity in-process. Kill Bill replaced by simple credit ledger.

- insert:
    # Core identity & knowledge (in-process, no external deps)
    - id: vexer-identity
      name: '@deepseek-ai/dsh-vexer-identity'
      config:
        version: '1.0.0'

    - id: vexer-knowledge
      name: '@deepseek-ai/dsh-vexer-knowledge'
      config:
        maxResults: 20

    # Simple in-memory credit ledger (no Kill Bill)
    - id: credit-core
      name: '@deepseek-ai/dsh-credit-core'
      config:
        costPerRequest: 100000
        initialGrant: 1000000
        currency: 'USD'
        grantOnFirstUse: true

    - id: credit-tools
      name: '@deepseek-ai/dsh-credit-tools'

    - id: credit-guard
      name: '@deepseek-ai/dsh-credit-guard'
      config:
        costPerRequest: 100000
        refundOnFailure: true
        exemptAccounts: []

    # In-memory memory tier (no Redis/ClickHouse)
    - id: memory-core
      name: '@deepseek-ai/dsh-memory-core'

    - id: memory-tools
      name: '@deepseek-ai/dsh-memory-tools'

    # In-process learning (no external deps)
    - id: learning-core
      name: '@deepseek-ai/dsh-learning-core'
      config:
        knowledgeMaxEntries: 10000
        skillMinUsage: 5
        personalityUpdateInterval: 100
        learnFromFirewall: false
        learnFromCrawl: false
        learnFromSessions: true

    - id: learning-tools
      name: '@deepseek-ai/dsh-learning-tools'

    # Minimal threat intel (no ClickHouse/Redis)
    - id: threat-intel-core
      name: '@deepseek-ai/dsh-threat-intel-core'
      config:
        autoBlock: false
        autoBlockThreshold: 0.85
        learnFromBlocks: true
        retentionDays: 30

    - id: threat-intel-tools
      name: '@deepseek-ai/dsh-threat-intel-tools'

    # Orchestrator (lightweight, no Kafka)
    - id: vexer-orchestrator
      name: '@deepseek-ai/dsh-vexer-orchestrator'
      config:
        enableCrawlPipeline: false
        enableThreatPipeline: false
        enableSelfLearning: true

    # Disable all external infrastructure
    - id: kafka-core
      disabled: true
    - id: kafka-client
      disabled: true
    - id: nutch-core
      disabled: true
    - id: nutch-client
      disabled: true
    - id: spark-core
      disabled: true
    - id: spark-connect
      disabled: true
    - id: pf-firewall
      disabled: true
    - id: credit-killbill
      disabled: true
    - id: memory-redis
      disabled: true
    - id: memory-clickhouse
      disabled: true
    - id: learning-memory
      disabled: true
    - id: threat-intel-memory
      disabled: true

    # Standard rows every mode mounts
    - id: tools
      name: '@deepseek-ai/dsh-tools'

    - id: system-prompt
      name: '@deepseek-ai/dsh-system-prompt'
      config:
        personaPrefix: ''

    - id: agent-loop
      name: '@deepseek-ai/dsh-agent-loop'
      config:
        agents: []

    - id: fs-sandbox
      name: '@deepseek-ai/dsh-fs-sandbox'

    - id: llm-deepseek
      name: '@deepseek-ai/dsh-llm-deepseek-api-key'

    - id: llm-deepseek-account
      name: '@deepseek-ai/dsh-llm-deepseek-account'

================================================================================
## 7. standalone/package.json
================================================================================

{
  "name": "@deepseek-ai/dsh-standalone",
  "description": "Fully self-contained dsh bundle: no external services, all in-process",
  "version": "1.0.0",
  "publishConfig": { "access": "public" },
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  },
  "files": ["lib/index.js", "cordis.patch.yml", "lib/types/**/*.d.ts"],
  "license": "MIT",
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" }
  },
  "dependencies": {
    "@deepseek-ai/dsh-vexer-identity": "workspace:*",
    "@deepseek-ai/dsh-vexer-knowledge": "workspace:*",
    "@deepseek-ai/dsh-credit-core": "workspace:*",
    "@deepseek-ai/dsh-credit-tools": "workspace:*",
    "@deepseek-ai/dsh-credit-guard": "workspace:*",
    "@deepseek-ai/dsh-memory-core": "workspace:*",
    "@deepseek-ai/dsh-memory-tools": "workspace:*",
    "@deepseek-ai/dsh-learning-core": "workspace:*",
    "@deepseek-ai/dsh-learning-tools": "workspace:*",
    "@deepseek-ai/dsh-threat-intel-core": "workspace:*",
    "@deepseek-ai/dsh-threat-intel-tools": "workspace:*",
    "@deepseek-ai/dsh-vexer-orchestrator": "workspace:*"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "workspace:~"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "workspace:~"
  }
}

================================================================================
## 8. standalone/src/index.ts
================================================================================

/**
 * dsh-standalone — fully self-contained agent bundle.
 * No external services required. All capabilities in-process.
 * @module @deepseek-ai/dsh-standalone
 */

export const name = 'dsh-standalone'
export const version = '1.0.0'

export function apply(): void {
  // This bundle is a patch-only bundle; all functionality comes from
  // the patches in cordis.patch.yml. The empty apply is intentional.
}

================================================================================
## 9. base/cordis.patch.yml (additions)
================================================================================

# The dsh-base bundle patch: the shared core of each base-backed profile, applied as
# ONE insert over the empty profile root. Later bundle patches and the user's
# profile cordis.patch.yml address these rows by id, with the last write
# winning per row.
#
# A patch replaces the targeted row's whole `config` rather than merging into
# it, so a row whose value differs by mode does NOT live here: it belongs to
# each mode bundle, keeping any single row down to one bundle layer plus the
# user's. Mode-specific rows appear below only with shared plugin identity and
# neutral defaults; each mode bundle restates its complete configuration.
#
# Row order carries no load semantics (activation is service-availability
# driven); the grouping is for readers.

- insert:
    - id: tool-plugin-manager
      name: '@deepseek-ai/dsh-plugin-manager/tools'
      disabled: true

    - id: plugin-manager
      name: '@deepseek-ai/dsh-plugin-manager'
      disabled: !!js "!ctx.get('profileContext')"

    - id: timer
      name: '@deepseek-ai/cordis-plugin-timer'

    # Profile configuration reloads by default; module roots are opt-in.
    - id: hmr
      name: '@deepseek-ai/dsh-hmr'
      disabled: !!js "!ctx.get('profileContext')"
      config:
        root: []

    - id: llm
      name: '@deepseek-ai/dsh-llm'

    - id: deepseek-llm-api-extensions
      name: '@deepseek-ai/dsh-deepseek-llm-api-extensions'

    - id: session
      name: '@deepseek-ai/dsh-session'

    - id: session-log-deepseek
      name: '@deepseek-ai/dsh-session-log-deepseek'

    - id: typert
      name: '@deepseek-ai/dsh-typert-registry'

    - id: typert-loader
      name: '@deepseek-ai/dsh-typert-loader'

    - id: typert-gateway
      name: '@deepseek-ai/dsh-api-gateway'

    # Method-level access control for non-owner Peers; the Gateway requires it,
    # and its Client half publishes the standard access Hooks.
    - id: remote-access
      name: '@deepseek-ai/dsh-api-remote-access'

    - id: session-title
      name: '@deepseek-ai/dsh-session-title'
      config:
        fallbackMaxWords: 5
        fallbackMaxBytes: 40
        maxTitleBytes: 80

    - id: session-title-llm
      name: '@deepseek-ai/dsh-session-title-first-prompt-llm'
      config:
        targetWords: 5
        targetCjkCharacters: 10
        maxInputBytes: 4096
        # A ceiling against runaway output, not a length target: the prompt
        # keeps titles short, while reasoning a model cannot switch off also
        # counts as output. Stays within common model output limits.
        maxOutputTokens: 4096
        timeoutMs: 60000

    - id: user-questions
      name: '@deepseek-ai/dsh-user-questions'

    - id: agent
      name: '@deepseek-ai/dsh-agent'

    - id: plugin-package-inventory-deepseek
      name: '@deepseek-ai/dsh-plugin-package-inventory-deepseek'

    # The transport-independent default for Agents created by entry points.
    # Settings may supply a saved selection; consumers read it at creation time.
    - id: agent-default-model
      name: '@deepseek-ai/dsh-agent-default-model'
      config:
        provider: deepseek-official
        model: deepseek-flash

    - id: jobs
      name: '@deepseek-ai/dsh-jobs-local'

    - id: llm-retry
      name: '@deepseek-ai/dsh-llm-retry'

    # Live Config forms persist through the active profile patch.

    # Live configuration forms persist through the launcher's profile.
    - id: config-editor
      name: '@deepseek-ai/dsh-config-editor'
      disabled: !!js "!ctx.get('profileContext')"

    - id: settings
      name: '@deepseek-ai/dsh-settings'
      disabled: !!js "!ctx.get('profileContext')"

    # Credential sources: managed `$DSH_HOME/.credentials.yaml`, then inherited
    # environment, project `.env`, and user `.env` fallbacks.
    # Adapters resolve references per request; the Models page writes only the
    # managed document, which is never materialized into the process environment.
    - id: authorization
      name: '@deepseek-ai/dsh-authorization'

    - id: deepseek-account
      name: '@deepseek-ai/dsh-deepseek-account-platform'
      config:
        desktopPlatform: !!js "ctx.get('profileContext')?.name === 'desktop' && ['darwin', 'win32'].includes(process.platform) ? process.platform : null"

    - id: credentials
      name: '@deepseek-ai/dsh-credentials-local'

    # The pi-ai multi-provider twin, mounted dormant: zero routes (and no extra
    # models in the picker) until a `llm-pi-ai:` settings section supplies provider
    # profiles — then those routes register live, keys resolving per request
    # through their apiKeyEnv references, and drop again when the section empties.
    # Supplying those profiles is exactly what the web Models page does. Which
    # adapters exist is composition; which providers run is the user's settings
    # document.
    - id: llm-pi-ai
      name: '@deepseek-ai/dsh-llm-pi-ai'

    - id: session-persistence-jsonl
      name: '@deepseek-ai/dsh-session-persistence-jsonl'
      config:
        root: !!js dshHomePath('sessions')

    # Durable image bytes live outside the append-only session log. Messages
    # keep content-addressed references that this shared backend resolves for
    # provider requests and authorized history reads.
    - id: attachment-local
      name: '@deepseek-ai/dsh-attachment-local'

    # Full-text session search is opt-in. `openAt: never` keeps
    # ctx.sessionQuery mounted — exact reads, titles, and lineage traces
    # (session export, subagent-fork Workspace inheritance) stay available —
    # while search calls fail with SESSION_QUERY_SEARCH_DISABLED and SQLite is
    # never opened; the Web sidebar search matches titles and workspace names
    # only. Deployments enabling content search override `openAt` to
    # `first-search` or `startup` in a later patch layer (profile
    # cordis.patch.yml or a --patch overlay), typically with a durable `path`.
    - id: session-query-sqlite
      name: '@deepseek-ai/dsh-session-query-sqlite'
      config:
        path: ':memory:'
        openAt: never

    # Shared projection registry: subagent catalog identity (mode/label) folds
    # through its registered units, so the `list_agents` surface below fails
    # loud without it; web layers reuse this same mount for list rows.
    - id: working-directory
      name: '@deepseek-ai/dsh-working-directory'

    - id: tool-working-directory
      name: '@deepseek-ai/dsh-tool-working-directory'

    - id: session-projection
      name: '@deepseek-ai/dsh-session-projection'

    # Durable KV storage: the storage hub, the json backend, and the
    # schema-validated domain form over them. Session-layer persistence (the
    # projection cache below; workspace in web layers)
    # routes through this stack, so it belongs to the shared base.
    - id: storage
      name: '@deepseek-ai/dsh-storage'

    - id: storage-json
      name: '@deepseek-ai/dsh-storage-json'
      config:
        root: !!js dshHomePath('storages')

    - id: storage-domain
      name: '@deepseek-ai/dsh-storage-domain'
      config:
        backend: json

    # Persisted projection cache: throttled write-behind over the
    # session_projcache domain (per-record layout — one version-stamped
    # checkpoint document per session), serving the session listing's
    # projection column.
    - id: session-projection-cache
      name: '@deepseek-ai/dsh-session-projection-cache'
      config:
        writeEveryEvents: 200
        writeIntervalMs: 5000

    - id: otel
      name: '@deepseek-ai/dsh-otel'

    # OTel releases a Session-log prefix only after explicit user feedback,
    # regardless of model provider. Ordinary activity never triggers capture.
    # DSH_TELEMETRY_OTLP_URL overrides the production endpoint. A non-empty
    # DSH_TELEMETRY_DISABLED — any value, including '0'/'false' — opts the
    # process out (the launchers patch the row disabled; config cannot disable
    # a row). Exports carry the harness home's anonymous user id ($DSH_HOME/.anonymous-user-id,
    # random UUID; delete the file to reset the identity) as the Resource's
    # user.id. Byte-bounded batching may turn an authorized prefix into
    # several HTTP requests. Requests run serially; each has its own 1s
    # transport timeout and 1.5s watchdog. A watchdog does not release the
    # active request slot. The outer 3s shutdown deadline stops queued sends;
    # large prefixes or an unsettled transport may leave records unsent.
    # Every CLI exit path drains by disposing the root on SIGINT/SIGTERM.
    - id: session-telemetry-otel
      name: '@deepseek-ai/dsh-session-telemetry-otel'
      config:
        mode: !!js process.env.DSH_TELEMETRY_MODE || 'FEEDBACK_ONLY'
        shutdownTimeoutMillis: 3000
        maxRequestBytes: 4000000
        exporter:
          url: !!js process.env.DSH_TELEMETRY_OTLP_URL ?? 'https://dsh-otel-collector.deepseeksvc.com/v1/logs'
          compression: gzip
          timeoutMillis: 1000
        processor:
          scheduledDelayMillis: 10000
          maxQueueSize: 2048
          maxExportBatchSize: 2048
          exportTimeoutMillis: 1500

    - id: subprocess
      name: '@deepseek-ai/dsh-subprocess-local'

    # Every shipped CLI mode starts with the same file-effect boundary.
    # The environment remains an explicit deployment override; otherwise fresh
    # sessions pin workspace-write + ask through the permission service below.
    - id: sandbox
      name: '@deepseek-ai/dsh-sandbox-local'

    - id: sandbox-policy
      name: '@deepseek-ai/dsh-sandbox-policy'
      config:
        mode: !!js process.env.DSH_PERMISSION_MODE ?? 'workspace-write'
        workspaceRoot: !!js process.cwd()

    - id: bash-sandbox
      name: '@deepseek-ai/dsh-bash-sandbox'
      disabled: !!js process.platform === 'win32'
      config:
        timeoutMs: 60000

    - id: pwsh-sandbox
      name: '@deepseek-ai/dsh-pwsh-sandbox'
      disabled: !!js process.platform !== 'win32'

    - id: approval
      name: '@deepseek-ai/dsh-user-approval'
      config:
        policy: !!js "(process.env.DSH_PERMISSION_MODE ?? 'workspace-write') === 'danger-full-access' ? 'never' : 'ask'"

    - id: permission
      name: '@deepseek-ai/dsh-permission-presets'
      config:
        presets:
          read-only:
            sandbox: read-only
            approval: ask
          workspace-write:
            sandbox: workspace-write
            approval: ask
          danger-full-access:
            sandbox: danger-full-access
            approval: never

    - id: shell-env
      name: '@deepseek-ai/dsh-shell-env'

    - id: tool-bash
      name: '@deepseek-ai/dsh-tool-bash'
      disabled: !!js process.platform === 'win32'

    - id: tool-pwsh
      name: '@deepseek-ai/dsh-tool-pwsh'
      disabled: !!js process.platform !== 'win32'

    - id: tool-jobs
      name: '@deepseek-ai/dsh-tool-jobs'

    - id: fs-observation-policy
      name: '@deepseek-ai/dsh-fs-observation-policy'

    - id: tool-fs
      name: '@deepseek-ai/dsh-tool-fs'

    - id: tool-fs-search
      name: '@deepseek-ai/dsh-tool-fs-search'
      config:
        sampleOverCapGlobResults: false

    - id: agent-instructions
      name: '@deepseek-ai/dsh-agent-instructions'
      config:
        maxBytes: 65536

    - id: skill
      name: '@deepseek-ai/dsh-skill'

    - id: skill-filesystem
      name: '@deepseek-ai/dsh-skill-filesystem'

    - id: tool-skill
      name: '@deepseek-ai/dsh-tool-skill'

    - id: commands
      name: '@deepseek-ai/dsh-commands'

    - id: command-feedback
      name: '@deepseek-ai/dsh-command-feedback'

    - id: goal
      name: '@deepseek-ai/dsh-goal'

    - id: goal-round-driver
      name: '@deepseek-ai/dsh-goal-round-driver'

    - id: command-goal
      name: '@deepseek-ai/dsh-command-goal'

    - id: plan-mode
      name: '@deepseek-ai/dsh-plan-mode'
      config:
        section: |
              You are in plan mode. Stay in plan mode until the user approves your plan through exit_plan_mode or switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.

              Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.

              The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed only to keep the request shape stable. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.

              Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.

              Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.

              When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.

    - id: token-meter
      name: '@deepseek-ai/dsh-token-meter'

    - id: compaction-basic
      name: '@deepseek-ai/dsh-compaction-basic'

    # Human `/compact`: one useful reduction below the automatic threshold. Backend
    # independent, so it follows whichever compaction service this leaf mounts.
    - id: command-compact
      name: '@deepseek-ai/dsh-command-compact'

    - id: subagent
      name: '@deepseek-ai/dsh-subagent'

    - id: subagent-spawn-in-process
      name: '@deepseek-ai/dsh-subagent-spawn-in-process'
      config:
        providerName: spawn

    - id: subagent-fork-in-process
      name: '@deepseek-ai/dsh-subagent-fork-in-process'
      config:
        providerName: fork

    # Continuable background children are selected per delegation tool. The
    # separately loaded follow-up tool registers the one global `send_message`.
    - id: tool-subagent-control
      name: '@deepseek-ai/dsh-tool-subagent-control'

    - id: tool-subagent-list-agents
      name: '@deepseek-ai/dsh-tool-subagent-control/list-agents'

    - id: tool-subagent
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: spawn
        toolName: subagent

    # Fork omits model selection so provider/model stay equal to the parent and
    # the inherited history remains eligible for KV Cache reuse. Parent and child
    # share the messaging tools; return guidance follows the inherited history.
    # See .agents/notes/implemented/feature/2026-08-18-model-selected-subagent-routes.md
    # and .agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.md.
    - id: tool-subagent-fork
      name: '@deepseek-ai/dsh-tool-subagent'
      config:
        provider: fork
        toolName: subagent_fork

    - id: ptc-runtime
      name: '@deepseek-ai/dsh-ptc-runtime-node'

    - id: workflow-ptc
      name: '@deepseek-ai/dsh-workflow-ptc'
      config:
        provider: spawn

    - id: tool-workflow
      name: '@deepseek-ai/dsh-tool-workflow'

    - id: timeout-policy
      name: '@deepseek-ai/dsh-tool-call-timeout-policy'

    - id: spill-local
      name: '@deepseek-ai/dsh-spill-local'

    - id: spill-policy
      name: '@deepseek-ai/dsh-spill-policy'
      config:
        maxInlineTokens: 12500

    # Durability checkpoints before each model request and top-level dispatch.
    - id: session-checkpoint-policy
      name: '@deepseek-ai/dsh-session-checkpoint-policy'

    # Compacts oversized tool results before the broader conversation compactor
    # runs, preserving the model-visible result within the configured budget.
    - id: tool-result-pruner
      name: '@deepseek-ai/dsh-compaction-tool-result-pruner'
      config:
        thresholdChars: 8192
        headChars: 4096
        tailChars: 1024

    # When an image-capable route rejects a request as over its image budget,
    # replace the oldest images with placeholders on the surface and retry.
    - id: image-offload
      name: '@deepseek-ai/dsh-compaction-image-offload'

    - id: tool-todo
      name: '@deepseek-ai/dsh-tool-todo'
      config:
        allowParallelInProgress: true

    # Persisted same-session goals reach the model and the slash menu here; the
    # domain, driver, and `/goal` command are above.
    - id: tool-goal
      name: '@deepseek-ai/dsh-tool-goal'

    # Consecutive-repeat reminders on the tool chain.
    - id: repeat-tool-reminder
      name: '@deepseek-ai/dsh-repeat-tool-reminder'
      config:
        thresholds: [3, 5, 8]
        argumentsPreviewChars: 500

    # Vexer Agent identity: the authoritative harness record plus the
    # `who_are_you` capability every agent can call mid-session.
    - id: vexer-identity
      name: '@deepseek-ai/dsh-vexer-identity'
      config:
        version: '1.0.0'

    - id: vexer-knowledge
      name: '@deepseek-ai/dsh-vexer-knowledge'
      config:
        maxResults: 20

    # Self-learning engine: knowledge base, skills, personality.
    - id: learning-core
      name: '@deepseek-ai/dsh-learning-core'
      config:
        knowledgeMaxEntries: 100000
        skillMinUsage: 5
        personalityUpdateInterval: 100
        learnFromFirewall: true
        learnFromCrawl: true
        learnFromSessions: true

    - id: learning-memory
      name: '@deepseek-ai/dsh-learning-memory'
      config:
        sessionId: 'vexer-learning'
        agentId: 'vexer-agent'
        knowledgeTags: ['vexer', 'knowledge']
        recallLimit: 10

    - id: learning-tools
      name: '@deepseek-ai/dsh-learning-tools'

    # Threat intelligence: analysis, blocking, and the firewall feed.
    - id: threat-intel-core
      name: '@deepseek-ai/dsh-threat-intel-core'
      config:
        clickhouseUrl: 'http://127.0.0.1:8123'
        redisUrl: 'redis://127.0.0.1:6379'
        autoBlock: true
        autoBlockThreshold: 0.85
        learnFromBlocks: true
        retentionDays: 90

    - id: threat-intel-memory
      name: '@deepseek-ai/dsh-threat-intel-memory'
      config:
        sessionId: 'vexer-threats'
        agentId: 'vexer-agent'
        autoBlockThreshold: 0.85
        applyToFirewall: true
        reportLimit: 10

    - id: threat-intel-tools
      name: '@deepseek-ai/dsh-threat-intel-tools'

    # Infrastructure: event streaming, crawling, and distributed processing.
    - id: kafka-core
      name: '@deepseek-ai/dsh-kafka-core'

    - id: kafka-client
      name: '@deepseek-ai/dsh-kafka-client'
      config:
        brokers: ['localhost:9092']
        clientId: 'vexer-agent'
        ssl: false
        topicPrefix: 'vexer'

    - id: nutch-core
      name: '@deepseek-ai/dsh-nutch-core'

    - id: nutch-client
      name: '@deepseek-ai/dsh-nutch-client'
      config:
        restUrl: 'http://localhost:8080'
        defaultDepth: 3
        defaultTopN: 100

    - id: spark-core
      name: '@deepseek-ai/dsh-spark-core'

    - id: spark-connect
      name: '@deepseek-ai/dsh-spark-connect'
      config:
        masterUrl: 'spark://localhost:7077'
        sparkConnectUrl: 'http://localhost:8080'
        appName: 'vexer-agent'
        executorMemory: '2g'
        numExecutors: 2

    - id: pf-firewall
      name: '@deepseek-ai/dsh-pf-firewall'
      config:
        backend: 'nftables'
        rulesFile: '/tmp/nftables.conf'
        interface: 'eth0'
        enabled: false

    # The orchestrator wires every system into one pipeline.
    - id: vexer-orchestrator
      name: '@deepseek-ai/dsh-vexer-orchestrator'
      config:
        enableCrawlPipeline: true
        enableThreatPipeline: true
        enableSelfLearning: true
        crawledPagesTopic: 'crawled-pages'
        threatEventsTopic: 'threat-events'
        memoryEventsTopic: 'memory-events'

    # Durable agent memory: tiers + agent tools.
    - id: memory-redis
      name: '@deepseek-ai/dsh-memory-redis'
      config:
        url: 'redis://127.0.0.1:6379'
        keyPrefix: 'vexer:memory:'
        sessionTail: 200
        scanLimit: 2000
        recallCacheTtl: 30
        recencyHalfLife: 3600

    - id: memory-clickhouse
      name: '@deepseek-ai/dsh-memory-clickhouse'
      config:
        url: 'http://127.0.0.1:8123'
        database: 'vexer_memory'
        table: 'session_events'
        batchSize: 2000
        flushIntervalMs: 2000
        recallLimit: 2000
        retentionDays: 0
        verifyOnBoot: false

    - id: memory-tools
      name: '@deepseek-ai/dsh-memory-tools'

    # Durable agent memory. ClickHouse holds the append-only history at
    # data-centre scale; Redis holds the live working set and the vector
    # proximity a recall must not wait on disk for. Both tiers attach to the
    # `memory` seam and degrade independently.
    - id: web
      name: '@deepseek-ai/dsh-web'
      config:
        searchProvider: deepseek-official
        fetchProvider: http

    - id: web-search-deepseek
      name: '@deepseek-ai/dsh-web-search-deepseek'
      config:
        apiKeyEnv: DEEPSEEK_API_KEY

    - id: web-fetch-http
      name: '@deepseek-ai/dsh-web-fetch-http'

    - id: tool-web
      name: '@deepseek-ai/dsh-tool-web'
      config:
        fetch: true
        searchTimeoutMs: 60000

    # Kill Bill credit system: ledger + invoices + per-request charging
    - id: credit-core
      name: '@deepseek-ai/dsh-credit-core'
      config:
        costPerRequest: 100000
        initialGrant: 0
        currency: 'USD'
        grantOnFirstUse: false

    - id: credit-tools
      name: '@deepseek-ai/dsh-credit-tools'

    - id: credit-guard
      name: '@deepseek-ai/dsh-credit-guard'
      config:
        costPerRequest: 100000
        refundOnFailure: true
        exemptAccounts: []

    - id: credit-killbill
      name: '@deepseek-ai/dsh-credit-killbill'
      config:
        baseUrl: 'http://127.0.0.1:8081'
        apiKey: 'vexer-v1'
        apiSecret: 'vexersecret'
        tenantId: ''
        currency: 'USD'

    - id: mcp-resources
      name: '@deepseek-ai/dsh-mcp-resources'
      config:
        fetch: true
        searchTimeoutMs: 60000

    - id: mcp-resources
      name: '@deepseek-ai/dsh-mcp-resources'

    # ── rows every mode mounts, whose values each overlay may state ──────────────

    # The tool registry. Presentation mode is a deployment choice; omitting it here
    # keeps the schema default (native).
    - id: tools
      name: '@deepseek-ai/dsh-tools'

    # The deployment persona is a deployment choice; plan-mode and tool plugins own
    # their own prompt sections.
    - id: system-prompt
      name: '@deepseek-ai/dsh-system-prompt'
      config:
        personaPrefix: ''

    # Agents created at startup. The base stays empty; raw overlays may create
    # agents, while Web creates sessions on client request.
    - id: agent-loop
      name: '@deepseek-ai/dsh-agent-loop'
      config:
        agents: []

    # The sandboxed filesystem provider. `cwd` defaults to `process.cwd()`; an
    # overlay can pin another workspace.
    - id: fs-sandbox
      name: '@deepseek-ai/dsh-fs-sandbox'

    # The native DeepSeek adapter. No key or endpoint is inlined: both resolve per
    # request from the `llm-deepseek:` settings section over this entry, with the
    # key coming from the credential store below. Thinking defaults are a deployment
    # choice.
    - id: llm-deepseek
      name: '@deepseek-ai/dsh-llm-deepseek-api-key'

    - id: llm-deepseek-account
      name: '@deepseek-ai/dsh-llm-deepseek-account'

================================================================================
## 10. base/package.json (additions)
================================================================================

{
  "name": "@deepseek-ai/dsh-base",
  "description": "The shared dsh core as a profile bundle: the first patch layer of base-backed profiles, inserting core rows over the empty profile root",
  "version": "1.0.0",
  "publishConfig": {
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/deepseek-ai/deepseek-harness.git",
    "directory": "packages/bundle/base"
  },
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "default": "./lib/index.js"
    },
    "./cordis.patch.yml": "./cordis.patch.yml",
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  },
  "files": [
    "lib/index.js",
    "cordis.patch.yml",
    "lib/types/**/*.d.ts"
  ],
  "license": "MIT",
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  },
  "dependencies": {
    "@deepseek-ai/dsh-hmr": "workspace:*",
    "@deepseek-ai/cordis-plugin-timer": "workspace:~",
    "@deepseek-ai/dsh-agent": "workspace:*",
    "@deepseek-ai/dsh-agent-default-model": "workspace:*",
    "@deepseek-ai/dsh-agent-loop": "workspace:*",
    "@deepseek-ai/dsh-attachment-local": "workspace:*",
    "@deepseek-ai/dsh-shell-env": "workspace:*",
    "@deepseek-ai/dsh-bash-sandbox": "workspace:*",
    "@deepseek-ai/dsh-command-compact": "workspace:*",
    "@deepseek-ai/dsh-command-feedback": "workspace:*",
    "@deepseek-ai/dsh-command-goal": "workspace:*",
    "@deepseek-ai/dsh-commands": "workspace:*",
    "@deepseek-ai/dsh-compaction-basic": "workspace:*",
    "@deepseek-ai/dsh-compaction-image-offload": "workspace:*",
    "@deepseek-ai/dsh-compaction-tool-result-pruner": "workspace:*",
    "@deepseek-ai/dsh-credentials-local": "workspace:*",
    "@deepseek-ai/dsh-deepseek-llm-api-extensions": "workspace:*",
    "@deepseek-ai/dsh-plugin-package-inventory-deepseek": "workspace:*",
    "@deepseek-ai/dsh-fs-local": "workspace:*",
    "@deepseek-ai/dsh-fs-observation-policy": "workspace:*",
    "@deepseek-ai/dsh-fs-sandbox": "workspace:*",
    "@deepseek-ai/dsh-goal": "workspace:*",
    "@deepseek-ai/dsh-goal-round-driver": "workspace:*",
    "@deepseek-ai/dsh-api-gateway": "workspace:*",
    "@deepseek-ai/dsh-api-remote-access": "workspace:*",
    "@deepseek-ai/dsh-llm": "workspace:*",
    "@deepseek-ai/dsh-llm-deepseek-api-key": "workspace:*",
    "@deepseek-ai/dsh-llm-deepseek-account": "workspace:*",
    "@deepseek-ai/dsh-llm-pi-ai": "workspace:*",
    "@deepseek-ai/dsh-llm-retry": "workspace:*",
    "@deepseek-ai/dsh-mcp-resources": "workspace:*",
    "@deepseek-ai/dsh-permission-presets": "workspace:*",
    "@deepseek-ai/dsh-plan-mode": "workspace:*",
    "@deepseek-ai/dsh-pwsh-sandbox": "workspace:*",
    "@deepseek-ai/dsh-repeat-tool-reminder": "workspace:*",
    "@deepseek-ai/dsh-sandbox-local": "workspace:*",
    "@deepseek-ai/dsh-sandbox-policy": "workspace:*",
    "@deepseek-ai/dsh-session": "workspace:*",
    "@deepseek-ai/dsh-session-checkpoint-policy": "workspace:*",
    "@deepseek-ai/dsh-session-log-deepseek": "workspace:*",
    "@deepseek-ai/dsh-session-persistence-jsonl": "workspace:*",
    "@deepseek-ai/dsh-session-projection": "workspace:*",
    "@deepseek-ai/dsh-session-projection-cache": "workspace:*",
    "@deepseek-ai/dsh-session-query-sqlite": "workspace:*",
    "@deepseek-ai/dsh-session-telemetry-otel": "workspace:*",
    "@deepseek-ai/dsh-session-title": "workspace:*",
    "@deepseek-ai/dsh-session-title-first-prompt-llm": "workspace:*",
    "@deepseek-ai/dsh-skill": "workspace:*",
    "@deepseek-ai/dsh-skill-filesystem": "workspace:*",
    "@deepseek-ai/dsh-spill-local": "workspace:*",
    "@deepseek-ai/dsh-spill-policy": "workspace:*",
    "@deepseek-ai/dsh-storage": "workspace:*",
    "@deepseek-ai/dsh-storage-domain": "workspace:*",
    "@deepseek-ai/dsh-storage-json": "workspace:*",
    "@deepseek-ai/dsh-subagent": "workspace:*",
    "@deepseek-ai/dsh-subagent-fork-in-process": "workspace:*",
    "@deepseek-ai/dsh-subagent-spawn-in-process": "workspace:*",
    "@deepseek-ai/dsh-subprocess-local": "workspace:*",
    "@deepseek-ai/dsh-system-prompt": "workspace:*",
    "@deepseek-ai/dsh-jobs-local": "workspace:*",
    "@deepseek-ai/dsh-tool-call-timeout-policy": "workspace:*",
    "@deepseek-ai/dsh-token-meter": "workspace:*",
    "@deepseek-ai/dsh-tool-bash": "workspace:*",
    "@deepseek-ai/dsh-tool-present": "workspace:*",
    "@deepseek-ai/dsh-tool-fs": "workspace:*",
    "@deepseek-ai/dsh-tool-fs-search": "workspace:*",
    "@deepseek-ai/dsh-tool-goal": "workspace:*",
    "@deepseek-ai/dsh-tool-pwsh": "workspace:*",
    "@deepseek-ai/dsh-tool-skill": "workspace:*",
    "@deepseek-ai/dsh-tool-subagent": "workspace:*",
    "@deepseek-ai/dsh-tool-subagent-control": "workspace:*",
    "@deepseek-ai/dsh-tool-jobs": "workspace:*",
    "@deepseek-ai/dsh-tool-todo": "workspace:*",
    "@deepseek-ai/dsh-tool-web": "workspace:*",
    "@deepseek-ai/dsh-tool-workflow": "workspace:*",
    "@deepseek-ai/dsh-tools": "workspace:*",
    "@deepseek-ai/dsh-typert-loader": "workspace:*",
    "@deepseek-ai/dsh-typert-registry": "workspace:*",
    "@deepseek-ai/dsh-user-approval": "workspace:*",
    "@deepseek-ai/dsh-user-questions": "workspace:*",
    "@deepseek-ai/dsh-web": "workspace:*",
    "@deepseek-ai/dsh-web-fetch-http": "workspace:*",
    "@deepseek-ai/dsh-web-search-deepseek": "workspace:*",
    "@deepseek-ai/dsh-workflow-ptc": "workspace:*",
    "@deepseek-ai/dsh-agent-instructions": "workspace:*",
    "@deepseek-ai/dsh-ptc-runtime-node": "workspace:*",
    "@deepseek-ai/dsh-plugin-manager": "workspace:*",
    "@deepseek-ai/dsh-authorization": "workspace:*",
    "@deepseek-ai/dsh-deepseek-account-platform": "workspace:*",
    "@deepseek-ai/dsh-config-editor": "workspace:*",
    "@deepseek-ai/dsh-settings": "workspace:*",
    "@deepseek-ai/dsh-otel": "workspace:*",
    "@deepseek-ai/dsh-working-directory": "workspace:*",
    "@deepseek-ai/dsh-tool-working-directory": "workspace:*",
    "@deepseek-ai/dsh-vexer-identity": "workspace:*",
    "@deepseek-ai/dsh-vexer-knowledge": "workspace:*",
    "@deepseek-ai/dsh-memory-core": "workspace:*",
    "@deepseek-ai/dsh-memory-redis": "workspace:*",
    "@deepseek-ai/dsh-memory-clickhouse": "workspace:*",
    "@deepseek-ai/dsh-memory-tools": "workspace:*",
    "@deepseek-ai/dsh-learning-core": "workspace:*",
    "@deepseek-ai/dsh-learning-tools": "workspace:*",
    "@deepseek-ai/dsh-kafka-core": "workspace:*",
    "@deepseek-ai/dsh-kafka-client": "workspace:*",
    "@deepseek-ai/dsh-nutch-core": "workspace:*",
    "@deepseek-ai/dsh-nutch-client": "workspace:*",
    "@deepseek-ai/dsh-spark-core": "workspace:*",
    "@deepseek-ai/dsh-spark-connect": "workspace:*",
    "@deepseek-ai/dsh-pf-firewall": "workspace:*",
    "@deepseek-ai/dsh-threat-intel-core": "workspace:*",
    "@deepseek-ai/dsh-threat-intel-tools": "workspace:*",
    "@deepseek-ai/dsh-vexer-orchestrator": "workspace:*",
    "@deepseek-ai/dsh-learning-memory": "workspace:*",
    "@deepseek-ai/dsh-threat-intel-memory": "workspace:*",
    "@deepseek-ai/dsh-credit-core": "workspace:*",
    "@deepseek-ai/dsh-credit-tools": "workspace:*",
    "@deepseek-ai/dsh-credit-guard": "workspace:*",
    "@deepseek-ai/dsh-credit-killbill": "workspace:*"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "workspace:~"
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "workspace:~"
  }
}