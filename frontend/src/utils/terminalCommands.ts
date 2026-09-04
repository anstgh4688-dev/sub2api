// 首页控制台交互式终端的命令解析。纯函数、无副作用,方便单测。
// 输出全部使用英文,与控制台已有的 "ACCOUNT_POOL · LIVE" 终端风格一致。

export interface TerminalAccount {
  tag: string
  platform: string
  state: 'ok' | 'limited' | 'down' | 'disabled'
}

export interface TerminalOutput {
  text: string
  accent?: 'ok' | 'info' | 'warn' | 'err'
}

export interface TerminalResult {
  outputs: TerminalOutput[]
  /** clear 为 true 时先清空事件流再渲染输出 */
  clear?: boolean
}

/** stats 命令所需的最小事件结构（与 useTrafficStream 的 TrafficEvent 兼容） */
export interface TrafficEventLike {
  platform: string
  model: string
  duration_ms: number
}

const MODEL_CATALOG: Array<{ platform: string; models: string[] }> = [
  { platform: 'anthropic', models: ['claude-opus-4-1', 'claude-sonnet-4-5', 'claude-haiku-4-5'] },
  { platform: 'openai', models: ['gpt-5', 'gpt-5-codex'] },
  { platform: 'gemini', models: ['gemini-3-pro', 'gemini-2.5-flash'] },
  { platform: 'antigravity', models: ['antigravity'] }
]

const HELP_LINES: TerminalOutput[] = [
  { text: 'available commands:', accent: 'info' },
  { text: '  pool.status          account pool summary' },
  { text: '  models.ls            list supported models' },
  { text: '  route --model <m>    simulate a routing decision' },
  { text: '  stats                live traffic statistics' },
  { text: '  ping                 check pool reachability' },
  { text: '  docs                 documentation link' },
  { text: '  whoami               identify your session' },
  { text: '  clear                wipe the stream' },
  { text: '  help                 this message' }
]

function padRight(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

function poolStatus(accounts: TerminalAccount[], lastRoutedTag?: string): TerminalOutput[] {
  const count = (state: TerminalAccount['state']) => accounts.filter((a) => a.state === state).length
  const ok = count('ok')
  const limited = count('limited')
  const unavailable = count('down') + count('disabled')

  const parts = [`${accounts.length} nodes`, `${ok} ok`]
  if (limited) parts.push(`${limited} limited`)
  if (unavailable) parts.push(`${unavailable} unavailable`)

  const lines: TerminalOutput[] = [
    { text: `pool: ${parts.join(' · ')}`, accent: 'info' },
    { text: `failover armed < 1s · sticky sessions on` }
  ]
  if (lastRoutedTag) {
    lines.push({ text: `last routed: ${lastRoutedTag}`, accent: 'ok' })
  }
  return lines
}

function listModels(): TerminalOutput[] {
  return MODEL_CATALOG.map((entry) => ({
    text: `${padRight(entry.platform, 12)}${entry.models.join(' · ')}`
  }))
}

function simulateRoute(args: string[], accounts: TerminalAccount[]): TerminalOutput[] {
  const modelFlagIndex = args.indexOf('--model')
  const model = modelFlagIndex >= 0 ? args[modelFlagIndex + 1] : undefined
  if (!model) {
    return [{ text: "usage: route --model <model> — e.g. route --model claude-sonnet-4-5", accent: 'warn' }]
  }

  const candidates = accounts.filter((a) => a.state === 'ok')
  if (!candidates.length) {
    return [{ text: 'no routable nodes — pool degraded', accent: 'err' }]
  }
  const picked = candidates[Math.floor(Math.random() * candidates.length)]
  const decisionMs = 8 + Math.floor(Math.random() * 22)
  return [
    { text: `route ${model} → ${picked.tag} (${picked.platform})`, accent: 'ok' },
    { text: `state ok · decision ${decisionMs}ms · sticky session armed` }
  ]
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`
}

function trafficStats(events: TrafficEventLike[]): TerminalOutput[] {
  if (!events.length) {
    return [{ text: 'no events in window yet — wait for traffic', accent: 'warn' }]
  }
  const durations = events.map((e) => e.duration_ms).sort((a, b) => a - b)
  const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length
  const p50 = durations[Math.floor(durations.length / 2)]
  const fastest = durations[0]

  const byPlatform = new Map<string, number>()
  for (const e of events) {
    byPlatform.set(e.platform, (byPlatform.get(e.platform) ?? 0) + 1)
  }
  const ranked = [...byPlatform.entries()].sort((a, b) => b[1] - a[1])

  return [
    { text: `window: last ${events.length} events`, accent: 'info' },
    {
      text: `latency avg ${formatSeconds(avg)} · p50 ${formatSeconds(p50)} · fastest ${formatSeconds(fastest)}`
    },
    { text: `platforms ${ranked.map(([p, n]) => `${p}(${n})`).join(' · ')}` }
  ]
}

export function execTerminalCommand(
  raw: string,
  ctx: {
    accounts: TerminalAccount[]
    events?: TrafficEventLike[]
    docUrl?: string
    lastRoutedTag?: string
  }
): TerminalResult {
  const input = raw.trim()
  if (!input) return { outputs: [] }

  const [command, ...args] = input.split(/\s+/)
  switch (command.toLowerCase()) {
    case 'help':
      return { outputs: HELP_LINES }
    case 'pool.status':
      return { outputs: poolStatus(ctx.accounts, ctx.lastRoutedTag) }
    case 'models.ls':
      return { outputs: listModels() }
    case 'route':
      return { outputs: simulateRoute(args, ctx.accounts) }
    case 'stats':
      return { outputs: trafficStats(ctx.events ?? []) }
    case 'ping': {
      const ms = 6 + Math.floor(Math.random() * 30)
      return { outputs: [{ text: `pong · ${ms}ms · pool reachable`, accent: 'ok' }] }
    }
    case 'docs':
      return ctx.docUrl
        ? { outputs: [{ text: `docs → ${ctx.docUrl}`, accent: 'info' }] }
        : { outputs: [{ text: 'docs url not configured', accent: 'warn' }] }
    case 'whoami':
      return {
        outputs: [
          { text: 'guest · anonymous · zero telemetry', accent: 'info' },
          { text: 'request a key to become routable traffic' }
        ]
      }
    case 'clear':
      return { outputs: [], clear: true }
    case 'exit':
    case 'quit':
      return { outputs: [{ text: 'there is no escape. only pool.', accent: 'warn' }] }
    default:
      return { outputs: [{ text: `command not found: ${command} — type 'help'`, accent: 'err' }] }
  }
}
