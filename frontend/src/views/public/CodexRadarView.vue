<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  getIntelligenceEfficiency,
  getModelRatings,
  type IntelligenceEfficiencyResponse,
  type IntelligenceRadarPoint,
  type ModelRatingsResponse,
} from '@/api/intelligenceRadar'

type RadarTab = 'overview' | 'cost' | 'history'

interface HistorySeries {
  key: string
  effort: string
  color: string
  opacity: number
  values: number[]
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000
const CHART_LEFT = 58
const CHART_RIGHT = 970
const CHART_TOP = 24
const CHART_BOTTOM = 440
const IQ_MAX = 115

const familyOrder = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5']
const effortOrder = ['ultra', 'max', 'xhigh', 'high', 'medium', 'low']
const familyColors: Record<string, string> = {
  'gpt-5.6-sol': '#f4c20a',
  'gpt-5.6-terra': '#4389ff',
  'gpt-5.6-luna': '#d7e0ed',
  'gpt-5.5': '#10d9ee',
}
const effortOpacity: Record<string, number> = {
  ultra: 1,
  max: 0.88,
  xhigh: 0.76,
  high: 0.64,
  medium: 0.52,
  low: 0.4,
}

const activeTab = ref<RadarTab>('overview')
const loading = ref(true)
const refreshing = ref(false)
const loadError = ref('')
const efficiency = ref<IntelligenceEfficiencyResponse | null>(null)
const ratings = ref<ModelRatingsResponse | null>(null)
const selectedKey = ref('')
let refreshTimer: number | undefined

const points = computed(() => {
  const source = efficiency.value?.points ?? []
  return [...source].sort((a, b) => {
    const familyDifference = familyOrder.indexOf(a.model) - familyOrder.indexOf(b.model)
    if (familyDifference !== 0) return familyDifference
    return effortOrder.indexOf(a.effort) - effortOrder.indexOf(b.effort)
  })
})

const families = computed(() => familyOrder.filter((family) => points.value.some((point) => point.model === family)))

const selectedPoint = computed(() =>
  points.value.find((point) => pointKey(point) === selectedKey.value) ?? points.value[0] ?? null,
)

const selectedFamily = computed(() => selectedPoint.value?.model ?? families.value[0] ?? '')

const highestIQ = computed(() => points.value.reduce<IntelligenceRadarPoint | null>(
  (best, point) => (!best || point.iq > best.iq ? point : best),
  null,
))

const lowestCost = computed(() => points.value.reduce<IntelligenceRadarPoint | null>(
  (best, point) => (!best || point.average_price_usd < best.average_price_usd ? point : best),
  null,
))

const ratingSamples = computed(() =>
  (ratings.value?.models ?? []).reduce((total, rating) => total + rating.count, 0),
)

const recommendations = computed(() => [...points.value]
  .filter((point) => point.iq >= 70)
  .sort((a, b) => efficiencyScore(b) - efficiencyScore(a))
  .slice(0, 4))

const topRatings = computed(() => [...(ratings.value?.models ?? [])]
  .filter((rating) => rating.count > 0)
  .sort((a, b) => b.average - a.average || b.count - a.count)
  .slice(0, 6))

const historySeries = computed<HistorySeries[]>(() => {
  const snapshots = efficiency.value?.history ?? []
  return points.value
    .filter((point) => point.model === selectedFamily.value)
    .map((point) => ({
      key: pointKey(point),
      effort: point.effort,
      color: familyColor(point.model),
      opacity: effortOpacity[point.effort] ?? 0.7,
      values: snapshots.map((snapshot) => {
        const match = snapshot.points.find((candidate) => pointKey(candidate) === pointKey(point))
        return match?.iq ?? Number.NaN
      }),
    }))
})

const historyLabels = computed(() => {
  const snapshots = efficiency.value?.history ?? []
  if (!snapshots.length) return []
  const indexes = [0, Math.floor((snapshots.length - 1) / 2), snapshots.length - 1]
  return indexes.map((index) => ({
    x: historyX(index, snapshots.length),
    label: formatShortDate(snapshots[index].at),
  }))
})

const updatedAt = computed(() => efficiency.value?.source_updated_at || ratings.value?.updated_at || '')

function pointKey(point: Pick<IntelligenceRadarPoint, 'model' | 'effort'>) {
  return `${point.model}:${point.effort}`
}

function familyName(model: string) {
  return model
    .replace('gpt-5.6-', '')
    .replace('gpt-5.5', 'GPT-5.5')
    .replace(/^./, (letter) => letter.toUpperCase())
}

function pointName(point: Pick<IntelligenceRadarPoint, 'model' | 'effort'>) {
  return `${familyName(point.model)} ${point.effort}`
}

function familyColor(model: string) {
  return familyColors[model] ?? '#8da2bd'
}

function efficiencyScore(point: IntelligenceRadarPoint) {
  return point.iq / (1 + Math.log10(1 + Math.max(point.combined_cost_index, 0)))
}

function formatNumber(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
}

function formatDate(value: string) {
  if (!value) return '等待更新'
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value)).replace('日 ', '日')
}

function scatterX(point: IntelligenceRadarPoint) {
  const cost = Math.max(point.combined_cost_index, 0.01)
  const normalized = (Math.log10(cost) + 2) / 4
  return CHART_LEFT + Math.min(1, Math.max(0, normalized)) * (CHART_RIGHT - CHART_LEFT)
}

function chartY(iq: number) {
  return CHART_BOTTOM - (Math.max(0, Math.min(IQ_MAX, iq)) / IQ_MAX) * (CHART_BOTTOM - CHART_TOP)
}

function historyX(index: number, count: number) {
  if (count <= 1) return CHART_LEFT
  return CHART_LEFT + (index / (count - 1)) * (CHART_RIGHT - CHART_LEFT)
}

function historyPolyline(values: number[]) {
  return values
    .map((value, index) => Number.isFinite(value) ? `${historyX(index, values.length)},${chartY(value)}` : '')
    .filter(Boolean)
    .join(' ')
}

async function refreshData(manual = false) {
  if (manual) refreshing.value = true
  loadError.value = ''
  try {
    const [efficiencyData, ratingsData] = await Promise.all([
      getIntelligenceEfficiency(),
      getModelRatings(14),
    ])
    efficiency.value = efficiencyData
    ratings.value = ratingsData
    if (!selectedKey.value && efficiencyData.points.length) {
      selectedKey.value = pointKey(efficiencyData.points[0])
    }
  } catch (error) {
    console.error('Failed to load intelligence radar data:', error)
    loadError.value = '智能雷达数据加载失败，请检查后端代理与上游接口。'
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

onMounted(() => {
  refreshData()
  refreshTimer = window.setInterval(() => refreshData(), REFRESH_INTERVAL_MS)
})

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<template>
  <main class="radar-shell">
    <header class="radar-header">
      <div class="brand-block">
        <span class="brand-mark" aria-hidden="true">◎</span>
        <div>
          <p>CODEX SIGNAL DESK</p>
          <h1>智能雷达</h1>
        </div>
      </div>
      <div class="header-meta">
        <span><i></i> 数据在线</span>
        <time>{{ formatDate(updatedAt) }}</time>
        <button class="icon-button" :class="{ spinning: refreshing }" title="刷新数据" aria-label="刷新数据" @click="refreshData(true)">↻</button>
      </div>
    </header>

    <section v-if="loading" class="state-panel">
      <span class="loader"></span>
      <strong>正在同步雷达数据</strong>
    </section>

    <section v-else-if="loadError" class="state-panel error-panel">
      <strong>{{ loadError }}</strong>
      <button @click="refreshData(true)">重新加载</button>
    </section>

    <template v-else>
      <section class="summary-strip">
        <article>
          <span>有效档位</span>
          <strong>{{ points.length }}</strong>
          <small>{{ families.length }} 个模型族</small>
        </article>
        <article>
          <span>最高 IQ</span>
          <strong>{{ formatNumber(highestIQ?.iq ?? 0) }}</strong>
          <small>{{ highestIQ ? pointName(highestIQ) : '—' }}</small>
        </article>
        <article>
          <span>最低平均成本</span>
          <strong>{{ formatCurrency(lowestCost?.average_price_usd ?? 0) }}</strong>
          <small>{{ lowestCost ? pointName(lowestCost) : '—' }}</small>
        </article>
        <article>
          <span>社区评分样本</span>
          <strong>{{ ratingSamples }}</strong>
          <small>滚动 24 小时</small>
        </article>
      </section>

      <nav class="radar-tabs" aria-label="智能雷达视图">
        <button :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">效率面板</button>
        <button :class="{ active: activeTab === 'cost' }" @click="activeTab = 'cost'">成本 × IQ</button>
        <button :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">48 小时趋势</button>
      </nav>

      <section v-if="activeTab === 'overview'" class="overview-layout">
        <div class="main-column">
          <section class="panel recommendation-panel">
            <div class="panel-heading">
              <div><p>RECOMMENDED</p><h2>效率推荐</h2></div>
              <span>IQ ≥ 70 · 综合成本排序</span>
            </div>
            <div class="recommendation-grid">
              <button
                v-for="(point, index) in recommendations"
                :key="pointKey(point)"
                class="recommendation-card"
                :style="{ '--family-color': familyColor(point.model) }"
                @click="selectedKey = pointKey(point); activeTab = 'history'"
              >
                <span class="rank">0{{ index + 1 }}</span>
                <div><small>{{ pointName(point) }}</small><strong>{{ formatNumber(point.iq) }}</strong></div>
                <dl><dt>成本</dt><dd>{{ formatCurrency(point.average_price_usd) }}</dd><dt>耗时</dt><dd>{{ formatNumber(point.average_minutes) }} 分</dd></dl>
              </button>
            </div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <div><p>INTELLIGENCE EFFICIENCY</p><h2>模型档位</h2></div>
              <span>{{ formatDate(updatedAt) }} 更新</span>
            </div>
            <div class="family-section" v-for="family in families" :key="family">
              <h3 :style="{ color: familyColor(family) }">{{ familyName(family) }}</h3>
              <div class="model-grid">
                <button
                  v-for="point in points.filter((item) => item.model === family)"
                  :key="pointKey(point)"
                  class="model-card"
                  :class="{ selected: selectedKey === pointKey(point) }"
                  :style="{ '--family-color': familyColor(point.model) }"
                  @click="selectedKey = pointKey(point)"
                >
                  <header><span>{{ point.effort }}</span><b>{{ formatCurrency(point.average_price_usd) }}</b></header>
                  <strong>{{ formatNumber(point.iq) }}</strong>
                  <footer><span>IQ</span><span>{{ formatNumber(point.average_minutes) }} 分钟</span></footer>
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside class="side-column">
          <section class="panel rating-panel">
            <div class="panel-heading"><div><p>COMMUNITY PULSE</p><h2>社区评分</h2></div></div>
            <div v-for="rating in topRatings" :key="rating.id" class="rating-row">
              <div><strong>{{ rating.label.replace('GPT-5.6 ', '') }}</strong><small>{{ rating.count }} 票</small></div>
              <span>{{ formatNumber(rating.average) }}</span>
              <i><b :style="{ width: `${rating.average * 10}%` }"></b></i>
            </div>
          </section>

          <section v-if="selectedPoint" class="panel focus-panel" :style="{ '--family-color': familyColor(selectedPoint.model) }">
            <p>FOCUS</p>
            <h2>{{ pointName(selectedPoint) }}</h2>
            <strong>{{ formatNumber(selectedPoint.iq) }} <small>IQ</small></strong>
            <dl><dt>通过任务</dt><dd>{{ selectedPoint.passed }} / {{ selectedPoint.valid_tasks }}</dd><dt>平均成本</dt><dd>{{ formatCurrency(selectedPoint.average_price_usd) }}</dd><dt>平均耗时</dt><dd>{{ formatNumber(selectedPoint.average_minutes) }} 分钟</dd><dt>综合成本指数</dt><dd>{{ formatNumber(selectedPoint.combined_cost_index, 2) }}</dd></dl>
          </section>
        </aside>
      </section>

      <section v-else-if="activeTab === 'cost'" class="panel chart-panel">
        <div class="panel-heading">
          <div><p>RELATIVE COST MAP</p><h2>综合成本 × IQ</h2></div>
          <div class="chart-legend"><span v-for="family in families" :key="family" :style="{ '--legend': familyColor(family) }"><i></i>{{ familyName(family) }}</span></div>
        </div>
        <div class="chart-wrap">
          <svg viewBox="0 0 1000 500" role="img" aria-label="综合成本与 IQ 散点图">
            <g class="grid-lines"><line v-for="value in [0, 25, 50, 75, 100]" :key="value" :x1="CHART_LEFT" :x2="CHART_RIGHT" :y1="chartY(value)" :y2="chartY(value)" /></g>
            <line class="axis-line" :x1="CHART_LEFT" :x2="CHART_LEFT" :y1="CHART_TOP" :y2="CHART_BOTTOM" />
            <line class="axis-line" :x1="CHART_LEFT" :x2="CHART_RIGHT" :y1="CHART_BOTTOM" :y2="CHART_BOTTOM" />
            <g class="axis-labels"><text v-for="value in [0, 25, 50, 75, 100]" :key="value" x="47" :y="chartY(value) + 4" text-anchor="end">{{ value }}</text><text x="500" y="485" text-anchor="middle">相对综合成本指数 · 对数刻度</text><text x="16" y="235" transform="rotate(-90 16 235)" text-anchor="middle">IQ</text></g>
            <g
              v-for="point in points"
              :key="pointKey(point)"
              class="scatter-point"
              :class="{ selected: selectedKey === pointKey(point) }"
              role="button"
              tabindex="0"
              @click="selectedKey = pointKey(point)"
              @keydown.enter="selectedKey = pointKey(point)"
            >
              <circle :cx="scatterX(point)" :cy="chartY(point.iq)" :r="selectedKey === pointKey(point) ? 9 : 6" :fill="familyColor(point.model)"><title>{{ pointName(point) }}：IQ {{ formatNumber(point.iq) }}，成本指数 {{ formatNumber(point.combined_cost_index, 2) }}</title></circle>
              <text v-if="selectedKey === pointKey(point)" :x="scatterX(point) + 12" :y="chartY(point.iq) - 10">{{ pointName(point) }}</text>
            </g>
          </svg>
        </div>
      </section>

      <section v-else class="panel chart-panel history-panel">
        <div class="panel-heading history-heading">
          <div><p>ROLLING HISTORY</p><h2>近 48 小时 IQ 趋势</h2></div>
          <div class="family-switcher">
            <button v-for="family in families" :key="family" :class="{ active: selectedFamily === family }" :style="{ '--family-color': familyColor(family) }" @click="selectedKey = pointKey(points.find((point) => point.model === family)!)">{{ familyName(family) }}</button>
          </div>
        </div>
        <div class="series-legend"><span v-for="series in historySeries" :key="series.key" :style="{ color: series.color, opacity: series.opacity }"><i :style="{ background: series.color }"></i>{{ series.effort }}</span></div>
        <div class="chart-wrap history-chart">
          <svg viewBox="0 0 1000 500" role="img" aria-label="近 48 小时模型 IQ 历史趋势图">
            <g class="grid-lines"><line v-for="value in [0, 25, 50, 75, 100]" :key="value" :x1="CHART_LEFT" :x2="CHART_RIGHT" :y1="chartY(value)" :y2="chartY(value)" /></g>
            <line class="axis-line" :x1="CHART_LEFT" :x2="CHART_LEFT" :y1="CHART_TOP" :y2="CHART_BOTTOM" />
            <line class="axis-line" :x1="CHART_LEFT" :x2="CHART_RIGHT" :y1="CHART_BOTTOM" :y2="CHART_BOTTOM" />
            <g class="axis-labels"><text v-for="value in [0, 25, 50, 75, 100]" :key="value" x="47" :y="chartY(value) + 4" text-anchor="end">{{ value }}</text><text v-for="label in historyLabels" :key="label.x" :x="label.x" y="472" text-anchor="middle">{{ label.label }}</text></g>
            <polyline v-for="series in historySeries" :key="series.key" class="history-line" :points="historyPolyline(series.values)" :stroke="series.color" :opacity="series.opacity" />
          </svg>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
:global(body) { background: #070c14; }
* { box-sizing: border-box; }
button { font: inherit; letter-spacing: 0; }
.radar-shell { min-height: 100vh; padding-bottom: 48px; background: radial-gradient(circle at 84% -20%, #18324a 0, #0c1727 28%, #070c14 63%); color: #e6eef9; font-family: "Avenir Next", "PingFang SC", sans-serif; letter-spacing: 0; }
.radar-header { min-height: 82px; padding: 15px clamp(18px, 3vw, 48px); display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 1px solid #26374c; background: #0a1320e8; backdrop-filter: blur(16px); }
.brand-block, .header-meta { display: flex; align-items: center; gap: 14px; }.brand-mark { width: 44px; height: 44px; display: grid; place-items: center; border: 1px solid #39506d; border-radius: 50%; color: #22d9ed; font-size: 30px; }.brand-block p, .panel-heading p, .focus-panel > p { margin: 0 0 2px; color: #5fd6e5; font-size: 10px; font-weight: 850; letter-spacing: 1.6px; }.brand-block h1 { margin: 0; font-size: 25px; letter-spacing: 0; }.header-meta { color: #92a1b5; font-size: 12px; font-weight: 700; }.header-meta > span { color: #62dc9c; }.header-meta > span i { display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: #27d47e; box-shadow: 0 0 10px #27d47e; }.icon-button { width: 37px; height: 37px; border: 1px solid #38516d; border-radius: 7px; background: #101d2e; color: #8ecbff; font-size: 23px; cursor: pointer; }.icon-button:hover { border-color: #10d9ee; }.spinning { animation: spin .8s linear infinite; }
.summary-strip, .radar-tabs, .overview-layout, .chart-panel { width: min(1540px, calc(100% - 36px)); margin-left: auto; margin-right: auto; }.summary-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid #273b55; border-radius: 8px; overflow: hidden; margin-top: 22px; background: #0e1929; }.summary-strip article { min-height: 116px; padding: 18px 22px; display: flex; flex-direction: column; justify-content: center; border-right: 1px solid #273b55; }.summary-strip article:last-child { border-right: 0; }.summary-strip span { color: #8798ae; font-size: 12px; font-weight: 760; }.summary-strip strong { margin: 6px 0 2px; color: #f4f8ff; font-size: 31px; line-height: 1; }.summary-strip small { color: #36d8e9; font-size: 11px; font-weight: 700; }
.radar-tabs { display: flex; gap: 4px; margin-top: 18px; border-bottom: 1px solid #273b55; }.radar-tabs button { min-width: 120px; padding: 13px 18px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #8392a7; font-size: 13px; font-weight: 800; cursor: pointer; }.radar-tabs button:hover, .radar-tabs button.active { color: #ecf5ff; border-bottom-color: #10d9ee; }
.overview-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; margin-top: 18px; }.main-column, .side-column { display: flex; flex-direction: column; gap: 16px; min-width: 0; }.panel { border: 1px solid #283d57; border-radius: 8px; background: #0f1928; box-shadow: 0 16px 36px #00000025; }.main-column .panel, .side-column .panel { padding: 20px; }.panel-heading { min-height: 42px; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 17px; }.panel-heading h2, .focus-panel h2 { margin: 0; font-size: 21px; letter-spacing: 0; }.panel-heading > span { color: #8392a6; font-size: 11px; font-weight: 700; }
.recommendation-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }.recommendation-card { min-height: 132px; display: grid; grid-template-columns: 30px minmax(0, 1fr); grid-template-rows: 1fr auto; gap: 8px; padding: 15px; text-align: left; border: 1px solid color-mix(in srgb, var(--family-color) 48%, #26384e); border-top: 3px solid var(--family-color); border-radius: 7px; background: color-mix(in srgb, var(--family-color) 5%, #101a29); color: #dfe8f5; cursor: pointer; }.recommendation-card:hover { transform: translateY(-2px); background: color-mix(in srgb, var(--family-color) 9%, #101a29); }.recommendation-card .rank { color: var(--family-color); font-family: ui-monospace, monospace; font-size: 12px; font-weight: 800; }.recommendation-card small { display: block; color: #aab7c8; font-size: 11px; font-weight: 750; white-space: nowrap; }.recommendation-card strong { display: block; margin-top: 8px; color: var(--family-color); font-size: 32px; line-height: 1; }.recommendation-card dl { grid-column: 1 / -1; display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 4px 6px; margin: 5px 0 0; color: #8494a9; font-size: 9px; }.recommendation-card dd { margin: 0; color: #d8e2ef; font-weight: 780; white-space: nowrap; }
.family-section { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 12px; align-items: start; margin-top: 10px; }.family-section h3 { margin: 17px 0 0; font-size: 16px; }.model-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 9px; }.model-card { min-width: 0; height: 118px; padding: 0; overflow: hidden; border: 1px solid color-mix(in srgb, var(--family-color) 45%, #34455a); border-top: 4px solid var(--family-color); border-radius: 7px; background: color-mix(in srgb, var(--family-color) 5%, #111c2b); color: #e4edf9; text-align: left; cursor: pointer; }.model-card:hover, .model-card.selected { box-shadow: 0 0 0 2px color-mix(in srgb, var(--family-color) 50%, transparent); }.model-card header, .model-card footer { height: 31px; padding: 0 10px; display: flex; align-items: center; justify-content: space-between; gap: 6px; border-bottom: 1px solid color-mix(in srgb, var(--family-color) 25%, #2a3b50); color: #9dabbc; font-size: 10px; font-weight: 750; }.model-card header b { color: var(--family-color); white-space: nowrap; }.model-card > strong { display: block; height: 49px; padding: 9px 10px 0; color: var(--family-color); font-size: clamp(25px, 2.3vw, 36px); line-height: 1; white-space: nowrap; }.model-card footer { height: 34px; border-top: 1px solid color-mix(in srgb, var(--family-color) 25%, #2a3b50); border-bottom: 0; }
.rating-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 12px 0; border-bottom: 1px solid #25374d; }.rating-row:last-child { border-bottom: 0; }.rating-row div { min-width: 0; }.rating-row strong, .rating-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.rating-row strong { font-size: 12px; }.rating-row small { color: #788a9f; font-size: 10px; margin-top: 2px; }.rating-row > span { color: #f3c313; font-size: 19px; font-weight: 850; }.rating-row > i { grid-column: 1 / -1; height: 3px; border-radius: 3px; background: #28374a; overflow: hidden; }.rating-row > i b { display: block; height: 100%; background: #f3c313; }.focus-panel { border-color: color-mix(in srgb, var(--family-color) 45%, #2a3a50); }.focus-panel > strong { display: block; margin: 22px 0; color: var(--family-color); font-size: 48px; line-height: 1; }.focus-panel > strong small { font-size: 12px; }.focus-panel dl { display: grid; grid-template-columns: 1fr auto; gap: 10px 8px; margin: 0; font-size: 11px; }.focus-panel dt { color: #8192a8; }.focus-panel dd { margin: 0; color: #dce6f3; font-weight: 800; }
.chart-panel { margin-top: 18px; padding: 22px; }.chart-legend, .series-legend { display: flex; flex-wrap: wrap; gap: 14px; color: #8fa0b4; font-size: 10px; font-weight: 760; }.chart-legend span, .series-legend span { display: flex; align-items: center; gap: 6px; }.chart-legend i, .series-legend i { width: 18px; height: 3px; background: var(--legend); box-shadow: 0 0 8px var(--legend); }.chart-wrap { width: 100%; aspect-ratio: 2 / 1; min-height: 380px; }.chart-wrap svg { width: 100%; height: 100%; overflow: visible; }.grid-lines line { stroke: #263b54; stroke-width: 1; stroke-dasharray: 3 5; }.axis-line { stroke: #8798ad; stroke-width: 1.4; }.axis-labels { fill: #8b9cb1; font-size: 11px; font-family: ui-monospace, monospace; }.scatter-point { cursor: pointer; outline: none; }.scatter-point circle { stroke: #0d1725; stroke-width: 3; transition: r .15s ease; }.scatter-point:hover circle, .scatter-point:focus circle { stroke: #f1f6ff; }.scatter-point text { fill: #e4edf9; font-size: 11px; font-weight: 800; }.history-heading { align-items: center; }.family-switcher { display: flex; flex-wrap: wrap; gap: 6px; }.family-switcher button { padding: 7px 11px; border: 1px solid #32475f; border-radius: 5px; background: #111d2d; color: #8898ac; font-size: 10px; font-weight: 800; cursor: pointer; }.family-switcher button.active { color: var(--family-color); border-color: var(--family-color); }.series-legend { margin: -4px 0 10px; }.history-line { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; }.state-panel { width: min(720px, calc(100% - 36px)); min-height: 340px; margin: 46px auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; border: 1px solid #2b3d55; border-radius: 8px; background: #0f1928; color: #9eafc3; }.loader { width: 32px; height: 32px; border: 3px solid #2d435d; border-top-color: #10d9ee; border-radius: 50%; animation: spin .8s linear infinite; }.error-panel { color: #ff9b91; }.error-panel button { padding: 9px 14px; border: 1px solid #b94e49; border-radius: 6px; background: #351b1d; color: #ffd4d0; cursor: pointer; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1180px) { .overview-layout { grid-template-columns: 1fr; }.side-column { display: grid; grid-template-columns: 1fr 1fr; }.recommendation-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.model-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 720px) { .radar-header { align-items: flex-start; padding: 13px 14px; }.brand-mark { width: 38px; height: 38px; font-size: 25px; }.brand-block h1 { font-size: 20px; }.header-meta > span, .header-meta time { display: none; }.summary-strip, .radar-tabs, .overview-layout, .chart-panel { width: calc(100% - 24px); }.summary-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }.summary-strip article { min-height: 95px; padding: 14px; border-bottom: 1px solid #273b55; }.summary-strip article:nth-child(2) { border-right: 0; }.summary-strip strong { font-size: 25px; }.radar-tabs { overflow-x: auto; }.radar-tabs button { min-width: 106px; padding: 11px 12px; white-space: nowrap; }.main-column .panel, .side-column .panel, .chart-panel { padding: 14px; }.panel-heading { flex-direction: column; gap: 6px; }.recommendation-grid { grid-template-columns: 1fr; }.recommendation-card { min-height: 116px; }.family-section { grid-template-columns: 1fr; }.family-section h3 { margin: 12px 0 0; }.model-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.model-card > strong { font-size: 30px; }.side-column { display: grid; grid-template-columns: 1fr; }.chart-wrap { min-height: 300px; aspect-ratio: 1 / 1; overflow-x: auto; }.chart-wrap svg { min-width: 620px; }.history-heading { align-items: flex-start; }.focus-panel > strong { font-size: 42px; } }
</style>
