/**
 * Self-learning seam.
 *
 * The agent is not static — it learns from every interaction, builds
 * knowledge bases, generates skills, and develops a personality. This seam
 * exposes the learning engine to the agent and other systems.
 *
 * The learning system uses:
 * - Memory (Redis + ClickHouse) for durable knowledge storage
 * - Kafka for event streaming (pattern detection)
 * - Spark for pattern analysis and skill generation
 * - Nutch for deep web crawling (knowledge acquisition)
 *
 * The firewall feeds threat patterns back into the learning system,
 * so the agent learns from security events too.
 * @module @deepseek-ai/dsh-learning-core
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export const name = 'learning-core'

export interface KnowledgeEntry {
  readonly id: string
  readonly topic: string
  readonly content: string
  readonly source: 'session' | 'crawl' | 'tool' | 'user' | 'self'
  readonly confidence: number
  readonly tags: readonly string[]
  readonly createdAt: number
  readonly updatedAt: number
}

export interface SkillDefinition {
  readonly name: string
  readonly description: string
  readonly pattern: string
  readonly steps: readonly string[]
  readonly usageCount: number
  readonly successRate: number
  readonly createdAt: number
}

export interface UserProfile {
  readonly expertise: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  readonly communicationStyle: 'formal' | 'casual' | 'concise' | 'verbose'
  readonly preferences: Readonly<Record<string, string>>
  readonly interests: readonly string[]
  readonly interactionCount: number
  readonly lastSeen: number
}

export interface AgentPersonality {
  readonly verbosity: number
  readonly formality: number
  readonly creativity: number
  readonly caution: number
  readonly traits: readonly string[]
  readonly interactionCount: number
  readonly lastUpdated: number
}

export interface LearningStats {
  readonly knowledgeEntries: number
  readonly skillsGenerated: number
  readonly userInteractions: number
  readonly patternsDetected: number
  readonly lastLearningCycle: number
}

export abstract class Learning extends Service {
  constructor(ctx: Context) { super(ctx, 'learning') }

  /** Learn from text/content. */
  abstract learn(content: string, source: 'session' | 'crawl' | 'tool' | 'user' | 'self', tags?: string[]): Promise<KnowledgeEntry>

  /** Recall knowledge by query. */
  abstract recallKnowledge(query: string, limit?: number): Promise<readonly KnowledgeEntry[]>

  /** Build a skill from observed patterns. */
  abstract buildSkill(name: string, description: string, pattern: string, steps: string[]): Promise<SkillDefinition>

  /** Get or update user profile. */
  abstract profileUser(userId: string): Promise<UserProfile>

  /** Get or update agent personality. */
  abstract profileAgent(): Promise<AgentPersonality>

  /** Get learning stats. */
  abstract stats(): Promise<LearningStats>

  /** Close. */
  abstract close(): Promise<void>
  async [Symbol.asyncDispose](): Promise<void> { await this.close() }
}

declare module '@deepseek-ai/cordis' {
  interface Context { learning: Learning }
}

export interface Config {
  knowledgeMaxEntries: number
  skillMinUsage: number
  personalityUpdateInterval: number
  learnFromFirewall: boolean
  learnFromCrawl: boolean
  learnFromSessions: boolean
}

export const Config: z<Partial<Config>, Config> = z.object({
  knowledgeMaxEntries: z.number().min(1).default(100000),
  skillMinUsage: z.number().min(1).default(5),
  personalityUpdateInterval: z.number().min(1).default(100),
  learnFromFirewall: z.boolean().default(false),
  learnFromCrawl: z.boolean().default(false),
  learnFromSessions: z.boolean().default(true),
})

export function apply(_ctx: Context, _config: Config): void {
  // The concrete backend provides the implementation.
}
