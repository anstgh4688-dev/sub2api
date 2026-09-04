import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export interface TrafficEvent {
  time: string
  platform: string
  model: string
  duration_ms: number
  stream: boolean
  /** 路由命中账号的匿名标签（与 /api/v1/pool/status 节点 tag 一致），驱动 ROUTED 联动 */
  tag: string
}

interface UseTrafficStreamOptions {
  /** 本地合成事件生成器：SSE 不可用（旧后端/离线）时的回退，保证控制台始终"活着" */
  fallback: () => TrafficEvent
  /** 每条事件（真实或合成）到达时触发，方便视图层直接映射成展示行 */
  onEvent?: (evt: TrafficEvent) => void
  /** 事件缓冲上限，超出丢弃最旧的 */
  maxItems?: number
  /** SSE 握手超时毫秒数：超时仍未 open 判定后端无端点，进入回退模式 */
  handshakeMs?: number
}

/**
 * 连接后端匿名流量事件流（SSE /api/v1/events/traffic）。
 * 连接建立后由真实流量驱动；握手失败/环境不支持时回退到本地合成事件。
 */
export function useTrafficStream(options: UseTrafficStreamOptions): {
  events: Ref<TrafficEvent[]>
  live: Ref<boolean>
} {
  const maxItems = options.maxItems ?? 50
  const events = ref<TrafficEvent[]>([])
  const live = ref(false)

  let source: EventSource | null = null
  let fallbackTimer: number | undefined
  let handshakeTimer: number | undefined

  function push(evt: TrafficEvent) {
    events.value.push(evt)
    if (events.value.length > maxItems) {
      events.value.splice(0, events.value.length - maxItems)
    }
    options.onEvent?.(evt)
  }

  function startFallback() {
    if (fallbackTimer !== undefined) return
    const tick = () => {
      push(options.fallback())
      fallbackTimer = window.setTimeout(tick, 1800 + Math.random() * 2400)
    }
    tick()
  }

  function stopStream() {
    source?.close()
    source = null
    if (handshakeTimer !== undefined) {
      window.clearTimeout(handshakeTimer)
      handshakeTimer = undefined
    }
  }

  onMounted(() => {
    if (typeof EventSource === 'undefined') {
      startFallback()
      return
    }

    source = new EventSource('/api/v1/events/traffic')
    source.onopen = () => {
      live.value = true
      if (handshakeTimer !== undefined) {
        window.clearTimeout(handshakeTimer)
        handshakeTimer = undefined
      }
    }
    source.onmessage = (msg) => {
      try {
        push(JSON.parse(msg.data as string) as TrafficEvent)
      } catch {
        // 忽略畸形帧，保持流存活
      }
    }
    // 后端无此端点（404）时浏览器会静默重试；握手超时未 open 即回退本地合成。
    // 连接建立后再断开由 EventSource 自动重连，不启用合成，避免真假数据混杂。
    handshakeTimer = window.setTimeout(() => {
      if (!live.value) {
        stopStream()
        startFallback()
      }
    }, options.handshakeMs ?? 4000)
  })

  onBeforeUnmount(() => {
    stopStream()
    if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer)
  })

  return { events, live }
}
