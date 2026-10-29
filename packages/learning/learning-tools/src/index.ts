/**
 * Agent-facing tools for self-learning.
 * @module @deepseek-ai/dsh-learning-tools
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { Learning } from '@deepseek-ai/dsh-learning-core'
import type { KnowledgeEntry } from '@deepseek-ai/dsh-learning-core'

let learningService: Learning | undefined
export const name = 'learning-tools'
export const inject = ['learning']

/** Resolve the injected learning service, failing loudly when the plugin loaded without it. */
function requireLearning(): Learning {
  if (learningService === undefined) {
    throw new Error('learning-tools: learning service is not available')
  }
  return learningService
}

export interface Config {}

export const Config: z<Partial<Config>, Config> = z.object({})

declare module '@deepseek-ai/cordis' {
  interface Context { learning: Learning }
}

export const learn = defineTool({
  name: 'learn',
  description: 'Learn from content: facts, patterns, observations. Stores knowledge in the durable knowledge base with tags and confidence. Use this to remember important information for future recall.',
  parameters: {
    content: { type: 'string', required: true, description: 'Content to learn' },
    source: { type: 'string', required: true, enum: ['session', 'crawl', 'tool', 'user', 'self'], description: 'Source of the knowledge' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
  },
  output: { schema: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, topic: { type: 'string' }, confidence: { type: 'number' } } },
    render: (_a, v) => [{ type: 'text', text: `Learned: ${v.topic} (confidence=${(v.confidence ?? 0).toFixed(2)})` }] },
  async execute(args: { content: string; source: string; tags?: string[] }, _exec) {
    const learning = requireLearning()
    const entry = await learning.learn(args.content, args.source as 'session' | 'crawl' | 'tool' | 'user' | 'self', args.tags)
    return { id: entry.id, topic: entry.topic, confidence: entry.confidence }
  },
})

export const recallKnowledge = defineTool({
  name: 'recall_knowledge',
  description: 'Recall knowledge from the durable knowledge base by query. Returns relevant knowledge entries with confidence scores.',
  parameters: {
    query: { type: 'string', required: true, description: 'Query to search knowledge for' },
    limit: { type: 'integer', default: 10, description: 'Maximum entries to return' },
  },
  output: { schema: { type: 'object', additionalProperties: false, properties: { entries: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {} } } } },
    render: (_a, v) => {
      const entries = (v.entries ?? []) as KnowledgeEntry[]
      if (entries.length === 0) return [{ type: 'text', text: 'No relevant knowledge found.' }]
      return [{ type: 'text', text: entries.map(e => `[${e.confidence.toFixed(2)}] ${e.topic}: ${e.content.slice(0, 200)}`).join('\n') }]
    },
  },
  async execute(args: { query: string; limit?: number }, _exec) {
    const learning = requireLearning()
    const entries = await learning.recallKnowledge(args.query, args.limit ?? 10)
    return { entries: [...entries] }
  },
})

export const buildSkill = defineTool({
  name: 'build_skill',
  description: 'Build a new skill from observed patterns. Skills are reusable procedures the agent can apply to similar tasks.',
  parameters: {
    name: { type: 'string', required: true, description: 'Skill name' },
    description: { type: 'string', required: true, description: 'What the skill does' },
    pattern: { type: 'string', required: true, description: 'Pattern that triggers this skill' },
    steps: { type: 'array', required: true, items: { type: 'string' }, description: 'Steps to execute' },
  },
  output: { schema: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, successRate: { type: 'number' } } },
    render: (_a, v) => [{ type: 'text', text: `Skill built: ${v.name} (success rate: ${((v.successRate ?? 0) * 100).toFixed(0)}%)` }] },
  async execute(args: { name: string; description: string; pattern: string; steps: string[] }, _exec) {
    const learning = requireLearning()
    const skill = await learning.buildSkill(args.name, args.description, args.pattern, args.steps)
    return { name: skill.name, successRate: skill.successRate }
  },
})

export const profileUser = defineTool({
  name: 'profile_user',
  description: 'Get or update the user profile: expertise level, communication style, preferences, interests. The agent uses this to personalize responses.',
  parameters: {
    userId: { type: 'string', required: true, description: 'User identifier' },
  },
  output: { schema: { type: 'object', additionalProperties: false, properties: { expertise: { type: 'string' }, communicationStyle: { type: 'string' }, interactionCount: { type: 'integer' } } },
    render: (_a, v) => [{ type: 'text', text: `User: ${v.expertise} level, ${v.communicationStyle} style, ${v.interactionCount} interactions` }] },
  async execute(args: { userId: string }, _exec) {
    const learning = requireLearning()
    const profile = await learning.profileUser(args.userId)
    return {
      expertise: profile.expertise,
      communicationStyle: profile.communicationStyle,
      preferences: profile.preferences,
      interests: profile.interests,
      interactionCount: profile.interactionCount,
    }
  },
})

export const profileAgent = defineTool({
  name: 'profile_agent',
  description: 'Get or update the agent personality: verbosity, formality, creativity, caution, and traits. The agent evolves its personality over time based on interactions.',
  parameters: {},
  output: { schema: { type: 'object', additionalProperties: false, properties: { traits: { type: 'array', items: { type: 'string' } }, interactionCount: { type: 'integer' } } },
    render: (_a, v) => [{ type: 'text', text: `Agent traits: ${(v.traits ?? []).join(', ')} (${v.interactionCount ?? 0} interactions)` }] },
  async execute(_args: {}, _exec) {
    const learning = requireLearning()
    const personality = await learning.profileAgent()
    return {
      traits: [...personality.traits],
      verbosity: personality.verbosity,
      formality: personality.formality,
      creativity: personality.creativity,
      caution: personality.caution,
      interactionCount: personality.interactionCount,
    }
  },
})

export const learningStats = defineTool({
  name: 'learning_stats',
  description: 'Get learning statistics: knowledge entries, skills generated, user interactions, patterns detected, last learning cycle.',
  parameters: {},
  output: { schema: { type: 'object', additionalProperties: false, properties: { knowledgeEntries: { type: 'integer' }, skillsGenerated: { type: 'integer' }, userInteractions: { type: 'integer' } } },
    render: (_a, v) => [{ type: 'text', text: `Knowledge: ${v.knowledgeEntries}, Skills: ${v.skillsGenerated}, Interactions: ${v.userInteractions}` }] },
  async execute(_args: {}, _exec) {
    const learning = requireLearning()
    const stats = await learning.stats()
    return stats
  },
})

export function apply(ctx: Context, _config: {}): void {
  learningService = ctx.get('learning')
  ctx.tools.register(learn)
  ctx.tools.register(recallKnowledge)
  ctx.tools.register(buildSkill)
  ctx.tools.register(profileUser)
  ctx.tools.register(profileAgent)
  ctx.tools.register(learningStats)
}
