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
