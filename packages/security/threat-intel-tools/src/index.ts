/**
 * Agent-facing tools for threat intelligence.
 * @module @deepseek-ai/dsh-threat-intel-tools
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ThreatIntel } from '@deepseek-ai/dsh-threat-intel-core'

let threatIntelService: ThreatIntel | undefined
export const name = 'threat-intel-tools'
export const inject = ['threatIntel']

/** Resolve the injected threat-intel service, failing loudly when the plugin loaded without it. */
function requireThreatIntel(): ThreatIntel {
  if (threatIntelService === undefined) {
    throw new Error('threat-intel-tools: threat-intel service is not available')
  }
  return threatIntelService
}

export interface Config {}

export const Config: z<Partial<Config>, Config> = z.object({})

declare module '@deepseek-ai/cordis' {
  interface Context { threatIntel: ThreatIntel }
}

export const threatAnalyze = defineTool({
  name: 'threat_analyze',
  description: 'Analyze an IP address or pattern for threat risk. Returns risk score, classification, reasons, and recommended action.',
  parameters: { target: { type: 'string', required: true, description: 'IP address or pattern to analyze' } },
  output: { schema: { type: 'object', additionalProperties: false, properties: { riskScore: { type: 'number' }, classification: { type: 'string' }, recommendedAction: { type: 'string' } } },
    render: (_a, v) => [{ type: 'text', text: `${v.classification ?? 'unknown'} (score=${(v.riskScore ?? 0).toFixed(2)}) → ${v.recommendedAction ?? 'monitor'}` }] },
  async execute(args: { target: string }, _exec) {
    const threatIntel = requireThreatIntel()
    const analysis = await threatIntel.analyze(args.target)
    return {
      riskScore: analysis.riskScore,
      classification: analysis.classification,
      recommendedAction: analysis.recommendedAction,
      reasons: analysis.reasons,
      eventCount: analysis.eventCount,
    }
  },
})

export const threatBlock = defineTool({
  name: 'threat_block',
  description: 'Block an IP address or pattern in the firewall. The firewall learns from this block and adapts future rules.',
  parameters: {
    target: { type: 'string', required: true, description: 'IP or pattern to block' },
    reason: { type: 'string', required: true, description: 'Reason for blocking' },
    duration: { type: 'integer', description: 'Block duration in seconds (0 = permanent)' },
  },
  output: { schema: { type: 'object', additionalProperties: false, properties: { success: { type: 'boolean' } } },
    render: (_a, v) => [{ type: 'text', text: v.success ? 'Blocked.' : 'Failed to block.' }] },
  async execute(args: { target: string; reason: string; duration?: number }, _exec) {
    const threatIntel = requireThreatIntel()
    await threatIntel.block(args.target, args.reason, args.duration)
    return { success: true }
  },
})

export const threatWhitelist = defineTool({
  name: 'threat_whitelist',
  description: 'Whitelist an IP address or pattern — it will not be blocked in the future.',
  parameters: {
    target: { type: 'string', required: true, description: 'IP or pattern to whitelist' },
    reason: { type: 'string', required: true, description: 'Reason for whitelisting' },
  },
  output: { schema: { type: 'object', additionalProperties: false, properties: { success: { type: 'boolean' } } },
    render: (_a, v) => [{ type: 'text', text: v.success ? 'Whitelisted.' : 'Failed to whitelist.' }] },
  async execute(args: { target: string; reason: string }, _exec) {
    const threatIntel = requireThreatIntel()
    await threatIntel.whitelist(args.target, args.reason)
    return { success: true }
  },
})

export const threatReport = defineTool({
  name: 'threat_report',
  description: 'Generate a threat report: total events, blocked/allowed/flagged counts, top threats, and time range.',
  parameters: {
    from: { type: 'integer', description: 'Start timestamp (epoch ms)' },
    to: { type: 'integer', description: 'End timestamp (epoch ms)' },
  },
  output: { schema: { type: 'object', additionalProperties: false, properties: { totalEvents: { type: 'integer' }, blockedCount: { type: 'integer' }, topThreats: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {} } } } },
    render: (_a, v) => [{ type: 'text', text: `Events: ${v.totalEvents ?? 0}, Blocked: ${v.blockedCount ?? 0}, Top threats: ${(v.topThreats ?? []).length}` }] },
  async execute(args: { from?: number; to?: number }, _exec) {
    const threatIntel = requireThreatIntel()
    const timeRange = args.from && args.to ? { from: args.from, to: args.to } : undefined
    const report = await threatIntel.report(timeRange)
    return { ...report, topThreats: [...report.topThreats] }
  },
})

export const threatTop = defineTool({
  name: 'threat_top',
  description: 'Get the top threats by risk score. Use to identify the most dangerous IPs and patterns.',
  parameters: { limit: { type: 'integer', default: 10, description: 'Number of top threats to return' } },
  output: {
    schema: { type: 'object', additionalProperties: false, properties: { threats: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {} } } } },
    render: (_a, v) => {
      const threats = (v.threats ?? []) as Array<{ ip: string; riskScore: number; classification: string }>
      return [{ type: 'text', text: threats.map(t => `${t.ip} (score=${t.riskScore.toFixed(2)}, ${t.classification})`).join('\n') || 'No threats recorded.' }]
    },
  },
  async execute(args: { limit?: number }, _exec) {
    const threatIntel = requireThreatIntel()
    const threats = await threatIntel.topThreats(args.limit ?? 10)
    return { threats: [...threats] }
  },
})

export function apply(ctx: Context, _config: {}): void {
  threatIntelService = ctx.get('threatIntel')
  ctx.tools.register(threatAnalyze)
  ctx.tools.register(threatBlock)
  ctx.tools.register(threatWhitelist)
  ctx.tools.register(threatReport)
  ctx.tools.register(threatTop)
}
