import { apiClient } from './client'

export interface IntelligenceRadarPoint {
  model: string
  effort: string
  iq: number
  passed: number
  valid_tasks: number
  average_price_usd: number
  average_minutes: number
  combined_cost_index: number
}

export interface IntelligenceRadarSnapshot {
  at: string
  points: IntelligenceRadarPoint[]
}

export interface IntelligenceEfficiencyResponse {
  source_updated_at: string
  points: IntelligenceRadarPoint[]
  history: IntelligenceRadarSnapshot[]
}

export interface ModelRating {
  id: string
  label: string
  group: string
  average: number
  count: number
}

export interface ModelRatingsResponse {
  updated_at: string
  refresh_seconds: number
  models: ModelRating[]
  history: Array<{ day: string; models: ModelRating[] }>
}

export async function getIntelligenceEfficiency(): Promise<IntelligenceEfficiencyResponse> {
	const { data } = await apiClient.get<IntelligenceEfficiencyResponse>('/intelligence-radar/efficiency')
	return data
}

export async function getModelRatings(history: number = 14): Promise<ModelRatingsResponse> {
	const { data } = await apiClient.get<ModelRatingsResponse>('/intelligence-radar/ratings', { params: { history } })
	return data
}
