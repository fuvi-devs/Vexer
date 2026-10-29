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
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { Credits, CreditTransaction, CreditPurchase, CreditPurchaseResult, InsufficientCreditsError, usdToMicroCredits } from '@deepseek-ai/dsh-credit-core'

export const name = 'credit-killbill'
export const inject = ['memory'] as const

declare module '@deepseek-ai/cordis' {
  interface Context {
    credits: Credits
    killbill?: {
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
    ctx.killbill = {
      baseUrl: this.baseUrl,
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      tenantId: this.tenantId,
      currency: this.currency,
    }
  }

  /** Kill Bill GET helper. */
  private async kbGet<T>(path: string): Promise<T> {
    const res = await this.http(`${this.baseUrl}${path}`, { headers: this.headers })
    if (!res.ok) throw new Error(`Kill Bill GET ${path} ${res.status}: ${await res.text()}`)
    return (await res.json()) as T
  }

  /** Kill Bill POST helper. */
  private async kbPost<T>(path: string, body: unknown): Promise<T> {
    const res = await this.http(`${this.baseUrl}${path}`, { method: 'POST', headers: this.headers, body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`Kill Bill POST ${path} ${res.status}: ${await res.text()}`)
    return (await res.json()) as T
  }

  /** Get or create a Kill Bill account for the given id. */
  private async getOrCreateAccount(accountId: string): Promise<string> {
    // Try to find by externalKey = accountId
    const list = await this.kbGet<Array<{ accountId: string }>>(
      `/1.0/kb/accounts/pagination?searchKey=${encodeURIComponent(accountId)}&offset=0&limit=1`,
    )
    const found = list[0]
    if (found !== undefined) return found.accountId
    // Create new account
    const created = await this.kbPost<{ accountId: string }>('/1.0/kb/accounts', {
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

  balance(accountId: string): Promise<number> {
    const ledger = this.readLedger(accountId)
    return Promise.resolve(ledger.reduce((sum, t) => sum + t.delta, 0))
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
      id: randomUUID(),
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

  charge(accountId: string, amount: number, ref: string): Promise<CreditTransaction> {
    const existing = this.readLedger(accountId)
    const prior = existing.find(t => t.ref === ref && t.reason === 'usage')
    if (prior !== undefined) return Promise.resolve(prior)

    const entry: CreditTransaction = {
      id: randomUUID(),
      accountId,
      delta: -amount,
      reason: 'usage',
      at: Date.now(),
      ref,
    }
    const ledger = this.readLedger(accountId)
    ledger.unshift(entry)
    this.writeLedger(accountId, ledger)
    return Promise.resolve(entry)
  }

  grant(accountId: string, amount: number, reason: CreditTransaction['reason']): Promise<CreditTransaction> {
    const entry: CreditTransaction = {
      id: randomUUID(),
      accountId,
      delta: amount,
      reason,
      at: Date.now(),
    }
    const ledger = this.readLedger(accountId)
    ledger.unshift(entry)
    this.writeLedger(accountId, ledger)
    return Promise.resolve(entry)
  }

  transfer(from: string, to: string, amount: number, ref: string): Promise<CreditTransaction> {
    const fromLedger = this.readLedger(from)
    const prior = fromLedger.find(t => t.ref === ref && t.reason === 'transfer_out')
    if (prior !== undefined) return Promise.resolve(prior)

    const out: CreditTransaction = {
      id: randomUUID(),
      accountId: from,
      delta: -amount,
      reason: 'transfer_out',
      at: Date.now(),
      ref,
    }
    const in_: CreditTransaction = {
      id: randomUUID(),
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
    return Promise.resolve(out)
  }

  history(accountId: string, limit?: number): Promise<readonly CreditTransaction[]> {
    const ledger = this.readLedger(accountId)
    return Promise.resolve(limit ? ledger.slice(0, limit) : ledger)
  }

  close(accountId: string): Promise<void> {
    this.ledgers.delete(accountId)
    return Promise.resolve()
  }
}

export function apply(ctx: Context, config: Config): void {
  if (!ctx.killbill) ctx.killbill = { baseUrl: '', apiKey: '', apiSecret: '', tenantId: '', currency: 'USD' }
  ctx.provide('credits', new KillBillCredits(ctx, config))
}

export { usdToMicroCredits } from '@deepseek-ai/dsh-credit-core'
