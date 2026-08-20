import { describe, expect, it } from 'vitest'
import { isEligibleImageKey } from '../types'
import type { ApiKey } from '@/types'

function makeKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 1,
    user_id: 1,
    key: 'sk-test',
    name: 'test',
    status: 'active',
    group_id: 1,
    ip_whitelist: [],
    ip_blacklist: [],
    last_used_at: null,
    last_used_ip: null,
    quota: 0,
    quota_used: 0,
    expires_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    current_concurrency: 1,
    rate_limit_5h: 0,
    rate_limit_1d: 0,
    rate_limit_7d: 0,
    usage_5h: 0,
    usage_1d: 0,
    usage_7d: 0,
    window_5h_start: null,
    window_1d_start: null,
    window_7d_start: null,
    reset_5h_at: null,
    reset_1d_at: null,
    reset_7d_at: null,
    ...overrides,
  }
}

describe('isEligibleImageKey', () => {
  const baseGroup = {
    id: 1,
    name: 'g',
    platform: 'openai' as const,
    status: 'active' as const,
    allow_image_generation: true,
  }

  it('accepts eligible active keys for the three supported platforms', () => {
    for (const platform of ['openai', 'gemini', 'grok'] as const) {
      expect(isEligibleImageKey(makeKey({ group: { ...baseGroup, platform } }))).toBe(true)
    }
  })

  it('rejects inactive keys, missing groups, disabled groups', () => {
    expect(isEligibleImageKey(makeKey({ status: 'inactive', group: baseGroup }))).toBe(false)
    expect(isEligibleImageKey(makeKey({ status: 'quota_exhausted', group: baseGroup }))).toBe(false)
    expect(isEligibleImageKey(makeKey({ group: undefined }))).toBe(false)
    expect(isEligibleImageKey(makeKey({ group: { ...baseGroup, status: 'inactive' } }))).toBe(false)
    expect(
      isEligibleImageKey(makeKey({ group: { ...baseGroup, allow_image_generation: false } })),
    ).toBe(false)
  })

  it('rejects composite and unsupported platforms', () => {
    expect(isEligibleImageKey(makeKey({ group: { ...baseGroup, platform: 'composite' } }))).toBe(false)
    expect(isEligibleImageKey(makeKey({ group: { ...baseGroup, platform: 'anthropic' } }))).toBe(false)
    expect(isEligibleImageKey(makeKey({ group: { ...baseGroup, platform: 'antigravity' } }))).toBe(false)
  })

  it('rejects null/undefined input', () => {
    expect(isEligibleImageKey(null)).toBe(false)
    expect(isEligibleImageKey(undefined)).toBe(false)
  })
})
