/**
 * Learning implementation over the durable memory seam.
 *
 * Knowledge, skills, and personality all persist through the `memory` seam, so
 * the learning engine inherits the same Redis hot tier and ClickHouse cold
 * tier the agent's memory already uses. A learned fact is one memory event of
 * kind `decision`; a skill is one of kind `note` carrying its steps; the user
 * profile and the agent personality are `note` events keyed by their subject.
 * @module @deepseek-ai/dsh-learning-memory
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Learning } from '@deepseek-ai/dsh-learning-core'
import type {
  AgentPersonality, KnowledgeEntry, LearningStats, SkillDefinition, UserProfile,
} from '@deepseek-ai/dsh-learning-core'
import { Memory } from '@deepseek-ai/dsh-memory-core'
import type { MemoryEvent } from '@deepseek-ai/dsh-memory-core'

export const name = 'learning-memory'
export const inject = ['memory']

export interface Config {
  /** Session the learning engine writes under. */
  sessionId: string
  /** Agent the learning engine writes under. */
  agentId: string
  /** Tags every learned knowledge entry carries. */
  knowledgeTags: string[]
  /** Maximum knowledge entries one recall returns. */
  recallLimit: number
}

export const Config: z<Partial<Config>, Config> = z.object({
  sessionId: z.string().min(1).default('vexer-learning'),
  agentId: z.string().min(1).default('vexer-agent'),
  knowledgeTags: z.array(z.string()).default(['vexer', 'knowledge']),
  recallLimit: z.number().min(1).default(10),
})

/** Tag that marks an event as learned knowledge. */
const KNOWLEDGE_TAG = 'vexer-knowledge'
/** Tag that marks an event as a generated skill. */
const SKILL_TAG = 'vexer-skill'
/** Tag prefix for one user's profile events. */
const USER_PROFILE_TAG = 'vexer-user'
/** Tag prefix for the agent personality events. */
const PERSONALITY_TAG = 'vexer-personality'

/**
 * The learning engine. Every write is a memory event, so the learning engine
 * and the agent's own memory are one durable store rather than two that can
 * disagree.
 */
export class MemoryLearning extends Learning {
  #memory: Memory
  #config: Config
  #seq = 0

  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.#memory = ctx.memory
    this.#config = config
  }

  /** Store one event and return its identifier. */
  #store(kind: MemoryEvent['kind'], text: string, tags: string[]): Promise<string> {
    const id = `${this.#config.sessionId}:${this.#seq++}`
    return this.#memory.append([{
      sessionId: this.#config.sessionId,
      agentId: this.#config.agentId,
      kind,
      text,
      tags,
      seq: this.#seq,
      at: Date.now(),
    }]).then(() => id)
  }

  async learn(content: string, source: 'session' | 'crawl' | 'tool' | 'user' | 'self', tags: string[] = []): Promise<KnowledgeEntry> {
    const id = await this.#store('decision', content, [...this.#config.knowledgeTags, KNOWLEDGE_TAG, source, ...tags])
    const now = Date.now()
    return {
      id,
      topic: tags[0] ?? source,
      content,
      source,
      confidence: 0.8,
      tags: [...this.#config.knowledgeTags, ...tags],
      createdAt: now,
      updatedAt: now,
    }
  }

  async recallKnowledge(query: string, limit = 10): Promise<readonly KnowledgeEntry[]> {
    const hits = await this.#memory.recall({
      sessionId: this.#config.sessionId,
      text: query,
      limit: Math.max(1, limit),
      kinds: ['decision', 'note'],
    })
    return hits
      .filter(hit => hit.event.tags.includes(KNOWLEDGE_TAG) || hit.event.tags.includes(SKILL_TAG))
      .map(hit => ({
        id: `${hit.event.sessionId}:${hit.event.seq}`,
        topic: hit.event.tags[0] ?? 'knowledge',
        content: hit.event.text,
        source: 'session' as const,
        confidence: hit.score,
        tags: hit.event.tags,
        createdAt: hit.event.at,
        updatedAt: hit.event.at,
      }))
  }

  async buildSkill(name: string, description: string, pattern: string, steps: string[]): Promise<SkillDefinition> {
    const text = JSON.stringify({ name, description, pattern, steps })
    await this.#store('note', text, [...this.#config.knowledgeTags, SKILL_TAG, name])
    return { name, description, pattern, steps, usageCount: 0, successRate: 0, createdAt: Date.now() }
  }

  async profileUser(userId: string): Promise<UserProfile> {
    const hits = await this.#memory.recall({
      sessionId: this.#config.sessionId,
      text: userId,
      limit: 20,
      kinds: ['note'],
    })
    const events = hits.filter(hit => hit.event.tags.some(tag => tag.startsWith(`${USER_PROFILE_TAG}:${userId}`)))
    const merged = mergeProfile(events.map(hit => hit.event.text))
    return {
      expertise: merged.expertise,
      communicationStyle: merged.communicationStyle,
      preferences: merged.preferences,
      interests: merged.interests,
      interactionCount: events.length,
      lastSeen: events[0]?.event.at ?? Date.now(),
    }
  }

  async profileAgent(): Promise<AgentPersonality> {
    const hits = await this.#memory.recall({
      sessionId: this.#config.sessionId,
      text: 'personality',
      limit: 20,
      kinds: ['note'],
    })
    const events = hits.filter(hit => hit.event.tags.includes(PERSONALITY_TAG))
    const merged = mergePersonality(events.map(hit => hit.event.text))
    return {
      verbosity: merged.verbosity,
      formality: merged.formality,
      creativity: merged.creativity,
      caution: merged.caution,
      traits: merged.traits,
      interactionCount: events.length,
      lastUpdated: events[0]?.event.at ?? Date.now(),
    }
  }

  async close(): Promise<void> {
    // The memory seam owns the store; the learning engine holds no resources of its own.
  }

  async stats(): Promise<LearningStats> {
    const [knowledge, skills, personality] = await Promise.all([
      this.#memory.recent(this.#config.sessionId, 500),
      this.recallKnowledge('skill', 100),
      this.profileAgent(),
    ])
    const knowledgeEntries = knowledge.filter(event => event.tags.includes(KNOWLEDGE_TAG)).length
    return {
      knowledgeEntries,
      skillsGenerated: skills.filter(entry => entry.tags.includes(SKILL_TAG)).length,
      userInteractions: personality.interactionCount,
      patternsDetected: skills.length,
      lastLearningCycle: knowledge[0]?.at ?? 0,
    }
  }
}

/** Merged shape the profile parsers fill in. */
interface ProfileFields {
  expertise: UserProfile['expertise']
  communicationStyle: UserProfile['communicationStyle']
  preferences: Record<string, string>
  interests: string[]
}

/** Parse the stored profile notes into the merged profile. */
function mergeProfile(notes: readonly string[]): ProfileFields {
  const merged: ProfileFields = {
    expertise: 'intermediate',
    communicationStyle: 'concise',
    preferences: {},
    interests: [],
  }
  for (const note of notes) {
    try {
      const parsed = JSON.parse(note) as Partial<ProfileFields>
      if (parsed.expertise !== undefined) merged.expertise = parsed.expertise
      if (parsed.communicationStyle !== undefined) merged.communicationStyle = parsed.communicationStyle
      if (parsed.preferences !== undefined) merged.preferences = { ...merged.preferences, ...parsed.preferences }
      if (parsed.interests !== undefined) merged.interests = [...new Set([...merged.interests, ...parsed.interests])]
    } catch {
      // A note that is not a profile fragment carries no profile fields.
    }
  }
  return merged
}

/** Merged shape the personality parser fills in. */
interface PersonalityFields {
  verbosity: number
  formality: number
  creativity: number
  caution: number
  traits: string[]
}

/** Parse the stored personality notes into the merged personality. */
function mergePersonality(notes: readonly string[]): PersonalityFields {
  const merged: PersonalityFields = { verbosity: 0.5, formality: 0.5, creativity: 0.5, caution: 0.5, traits: [] }
  for (const note of notes) {
    try {
      const parsed = JSON.parse(note) as Partial<PersonalityFields>
      if (parsed.verbosity !== undefined) merged.verbosity = parsed.verbosity
      if (parsed.formality !== undefined) merged.formality = parsed.formality
      if (parsed.creativity !== undefined) merged.creativity = parsed.creativity
      if (parsed.caution !== undefined) merged.caution = parsed.caution
      if (parsed.traits !== undefined) merged.traits = [...new Set([...merged.traits, ...parsed.traits])]
    } catch {
      // A note that is not a personality fragment carries no personality fields.
    }
  }
  return merged
}

export function apply(ctx: Context, config: Config): void {
  ctx.provide('learning', new MemoryLearning(ctx, config))
}
