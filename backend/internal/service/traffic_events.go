package service

import (
	"sync"
	"time"
)

// TrafficEvent 是匿名化的网关流量事件，驱动首页"实时请求流光"。
// 只包含可公开的信息（平台、模型、延迟、是否流式），绝不携带
// 用户 ID、账号 ID、API Key、IP 等任何可溯源标识。
type TrafficEvent struct {
	Time       time.Time `json:"time"`
	Platform   string    `json:"platform"`
	Model      string    `json:"model"`
	DurationMs int64     `json:"duration_ms"`
	Stream     bool      `json:"stream"`
	// Tag 是路由命中账号的匿名标签（AnonymizeAccountTag），
	// 供首页控制台把事件与池节点的 ROUTED 高亮联动。
	Tag        string    `json:"tag"`
}

const (
	// trafficEventBufferSize 是 ring buffer 容量；新 SSE 连接从中重放，
	// 让刚打开的页面立刻有内容。
	trafficEventBufferSize = 64
	// trafficEventMaxPerSecond 是广播速率上限，高流量时超出的事件直接丢弃，
	// 防止公开端点把内部 QPS 暴露为刷屏洪流（也避免访客连接成为背压源）。
	trafficEventMaxPerSecond = 4
	trafficSubscriberChanLen = 32
)

type trafficEventBus struct {
	mu       sync.RWMutex
	recent   []TrafficEvent // 按时间升序，最新在末尾
	subs     map[chan TrafficEvent]struct{}
	tokens   int // 每秒重置的广播配额
	lastTick time.Time
}

var defaultTrafficEventBus = newTrafficEventBus()

func newTrafficEventBus() *trafficEventBus {
	return &trafficEventBus{
		subs:     make(map[chan TrafficEvent]struct{}),
		tokens:   trafficEventMaxPerSecond,
		lastTick: time.Now(),
	}
}

// PublishTrafficEvent 发布一条匿名流量事件。非阻塞：速率超限或
// 订阅者消费过慢时丢弃，绝不阻塞计费/请求路径。
func PublishTrafficEvent(evt TrafficEvent) {
	defaultTrafficEventBus.publish(evt)
}

func (b *trafficEventBus) publish(evt TrafficEvent) {
	b.mu.Lock()
	defer b.mu.Unlock()

	now := time.Now()
	if now.Sub(b.lastTick) >= time.Second {
		b.tokens = trafficEventMaxPerSecond
		b.lastTick = now
	}
	if b.tokens <= 0 {
		return
	}
	b.tokens--

	b.recent = append(b.recent, evt)
	if len(b.recent) > trafficEventBufferSize {
		b.recent = b.recent[len(b.recent)-trafficEventBufferSize:]
	}
	for ch := range b.subs {
		select {
		case ch <- evt:
		default: // 慢订阅者丢弃该事件
		}
	}
}

// SubscribeTrafficEvents 订阅实时事件，返回 channel 与取消函数。
// 取消后 channel 会被关闭。
func SubscribeTrafficEvents() (<-chan TrafficEvent, func()) {
	return defaultTrafficEventBus.subscribe()
}

func (b *trafficEventBus) subscribe() (<-chan TrafficEvent, func()) {
	ch := make(chan TrafficEvent, trafficSubscriberChanLen)
	b.mu.Lock()
	b.subs[ch] = struct{}{}
	b.mu.Unlock()

	var once sync.Once
	cancel := func() {
		once.Do(func() {
			b.mu.Lock()
			delete(b.subs, ch)
			close(ch) // 在锁内 delete，publish 不会再向 ch 发送，close 安全
			b.mu.Unlock()
		})
	}
	return ch, cancel
}

// RecentTrafficEvents 返回最近 n 条事件（按时间升序），供新连接重放。
func RecentTrafficEvents(n int) []TrafficEvent {
	return defaultTrafficEventBus.recentEvents(n)
}

func (b *trafficEventBus) recentEvents(n int) []TrafficEvent {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if n <= 0 || n > len(b.recent) {
		n = len(b.recent)
	}
	out := make([]TrafficEvent, n)
	copy(out, b.recent[len(b.recent)-n:])
	return out
}
