package service

import (
	"testing"
	"time"
)

func TestTrafficEventBus_PublishStoresRecent(t *testing.T) {
	bus := newTrafficEventBus()
	bus.publish(TrafficEvent{Time: time.Now(), Platform: "anthropic", Model: "claude-sonnet-4-5", DurationMs: 1200})
	bus.publish(TrafficEvent{Time: time.Now(), Platform: "openai", Model: "gpt-5", DurationMs: 800})

	recent := bus.recentEvents(10)
	if len(recent) != 2 {
		t.Fatalf("expected 2 recent events, got %d", len(recent))
	}
	if recent[0].Platform != "anthropic" || recent[1].Platform != "openai" {
		t.Fatalf("events out of order: %+v", recent)
	}
}

func TestTrafficEventBus_RingBufferTruncates(t *testing.T) {
	bus := newTrafficEventBus()
	for i := 0; i < trafficEventBufferSize+10; i++ {
		bus.publish(TrafficEvent{Time: time.Now(), Model: "m"})
		// 让速率配额每秒重置逻辑不影响测试:手动补充配额
		bus.tokens = trafficEventMaxPerSecond
	}
	recent := bus.recentEvents(trafficEventBufferSize + 10)
	if len(recent) != trafficEventBufferSize {
		t.Fatalf("expected ring buffer capped at %d, got %d", trafficEventBufferSize, len(recent))
	}
}

func TestTrafficEventBus_SubscribeReceivesAndCancelStops(t *testing.T) {
	bus := newTrafficEventBus()
	ch, cancel := bus.subscribe()

	bus.publish(TrafficEvent{Time: time.Now(), Model: "claude-opus-4-1"})
	select {
	case evt := <-ch:
		if evt.Model != "claude-opus-4-1" {
			t.Fatalf("unexpected event: %+v", evt)
		}
	case <-time.After(time.Second):
		t.Fatal("subscriber did not receive event")
	}

	cancel()
	if _, ok := <-ch; ok {
		t.Fatal("expected channel closed after cancel")
	}

	// cancel 后 publish 不应 panic 或向旧订阅者发送
	bus.publish(TrafficEvent{Time: time.Now(), Model: "gpt-5"})
	cancel() // 幂等
}

func TestTrafficEventBus_RateLimitDropsExcess(t *testing.T) {
	bus := newTrafficEventBus()
	for i := 0; i < trafficEventMaxPerSecond+3; i++ {
		bus.publish(TrafficEvent{Time: time.Now(), Model: "m"})
	}
	if got := len(bus.recentEvents(100)); got != trafficEventMaxPerSecond {
		t.Fatalf("expected rate limit at %d events, got %d", trafficEventMaxPerSecond, got)
	}
}

func TestTrafficEventBus_SlowSubscriberDoesNotBlock(t *testing.T) {
	bus := newTrafficEventBus()
	// 订阅者从不消费,channel 必然填满
	_, cancel := bus.subscribe()
	defer cancel()

	done := make(chan struct{})
	go func() {
		for i := 0; i < trafficSubscriberChanLen+5; i++ {
			bus.publish(TrafficEvent{Time: time.Now(), Model: "m"})
			bus.tokens = trafficEventMaxPerSecond // 绕过速率限制,专注验证非阻塞发送
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("publish blocked on slow subscriber")
	}
}
