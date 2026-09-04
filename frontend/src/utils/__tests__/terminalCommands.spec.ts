import { describe, expect, it } from 'vitest'

import { execTerminalCommand, type TerminalAccount } from '../terminalCommands'

const accounts: TerminalAccount[] = [
  { tag: 'node_a7f3b2c1', platform: 'anthropic', state: 'ok' },
  { tag: 'node_92d1f4e8', platform: 'openai', state: 'ok' },
  { tag: 'node_b7a3c5d9', platform: 'antigravity', state: 'limited' }
]

describe('execTerminalCommand', () => {
  it('returns nothing for empty input', () => {
    expect(execTerminalCommand('   ', { accounts }).outputs).toHaveLength(0)
  })

  it('lists commands on help', () => {
    const { outputs } = execTerminalCommand('help', { accounts })
    expect(outputs[0].text).toContain('available commands')
    expect(outputs.some((o) => o.text.includes('pool.status'))).toBe(true)
    expect(outputs.some((o) => o.text.includes('route --model'))).toBe(true)
  })

  it('summarizes the pool on pool.status', () => {
    const { outputs } = execTerminalCommand('pool.status', { accounts, lastRoutedTag: 'node_a7f3b2c1' })
    expect(outputs[0].text).toBe('pool: 3 nodes · 2 ok · 1 limited')
    expect(outputs.some((o) => o.text.includes('last routed: node_a7f3b2c1'))).toBe(true)
  })

  it('lists the model catalog on models.ls', () => {
    const { outputs } = execTerminalCommand('models.ls', { accounts })
    expect(outputs.some((o) => o.text.includes('claude-sonnet-4-5'))).toBe(true)
    expect(outputs.some((o) => o.text.includes('gpt-5'))).toBe(true)
  })

  it('routes to an ok node', () => {
    const { outputs } = execTerminalCommand('route --model gpt-5', { accounts })
    expect(outputs[0].text).toMatch(/^route gpt-5 → node_(a7f3b2c1|92d1f4e8) \((anthropic|openai)\)$/)
    expect(outputs[0].accent).toBe('ok')
  })

  it('never routes to non-ok nodes', () => {
    const degraded: TerminalAccount[] = [
      { tag: 'node_x1y2z3a4', platform: 'openai', state: 'limited' },
      { tag: 'node_b5c6d7e8', platform: 'gemini', state: 'down' }
    ]
    const { outputs } = execTerminalCommand('route --model gpt-5', { accounts: degraded })
    expect(outputs[0].text).toContain('no routable nodes')
    expect(outputs[0].accent).toBe('err')
  })

  it('rejects route without a model argument', () => {
    const { outputs } = execTerminalCommand('route', { accounts })
    expect(outputs[0].text).toContain('usage: route --model')
    expect(outputs[0].accent).toBe('warn')
  })

  it('clears the stream on clear', () => {
    const result = execTerminalCommand('clear', { accounts })
    expect(result.clear).toBe(true)
    expect(result.outputs).toHaveLength(0)
  })

  it('answers whoami with the anonymous identity', () => {
    const { outputs } = execTerminalCommand('whoami', { accounts })
    expect(outputs[0].text).toContain('guest')
    expect(outputs[0].text).toContain('zero telemetry')
  })

  it('reports unknown commands with a help hint', () => {
    const { outputs } = execTerminalCommand('rm -rf /', { accounts })
    expect(outputs[0].text).toContain('command not found: rm')
    expect(outputs[0].accent).toBe('err')
  })

  it('warns on stats when no events have arrived yet', () => {
    const { outputs } = execTerminalCommand('stats', { accounts, events: [] })
    expect(outputs[0].text).toContain('no events in window yet')
    expect(outputs[0].accent).toBe('warn')
  })

  it('summarizes the event window on stats', () => {
    const events = [
      { platform: 'anthropic', model: 'claude-sonnet-4-5', duration_ms: 1000 },
      { platform: 'anthropic', model: 'claude-opus-4-1', duration_ms: 2000 },
      { platform: 'openai', model: 'gpt-5', duration_ms: 3000 }
    ]
    const { outputs } = execTerminalCommand('stats', { accounts, events })
    expect(outputs[0].text).toBe('window: last 3 events')
    expect(outputs[1].text).toContain('avg 2.00s')
    expect(outputs[1].text).toContain('p50 2.00s')
    expect(outputs[1].text).toContain('fastest 1.00s')
    expect(outputs[2].text).toContain('anthropic(2)')
    expect(outputs[2].text).toContain('openai(1)')
  })

  it('answers pong on ping', () => {
    const { outputs } = execTerminalCommand('ping', { accounts })
    expect(outputs[0].text).toMatch(/^pong · \d+ms · pool reachable$/)
    expect(outputs[0].accent).toBe('ok')
  })

  it('prints the docs link when configured', () => {
    const { outputs } = execTerminalCommand('docs', { accounts, docUrl: 'https://docs.example.com' })
    expect(outputs[0].text).toBe('docs → https://docs.example.com')
  })

  it('warns on docs when no url is configured', () => {
    const { outputs } = execTerminalCommand('docs', { accounts })
    expect(outputs[0].accent).toBe('warn')
  })
})
