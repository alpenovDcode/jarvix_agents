import type { CellScalar, ColumnType, DatasetBuild, DatasetColumn } from '@/lib/types'

export type OkDataset = Extract<DatasetBuild, { status: 'ok' }>
export type ValueFormat = 'number' | 'money' | 'percent'

export type Widget =
  | { kind: 'rowcount'; id: string; title: string; count: number }
  | { kind: 'kpi'; id: string; title: string; column: string; format: ValueFormat
      stats: { sum: number; avg: number; median: number; min: number; max: number; count: number } }
  | { kind: 'timeseries'; id: string; title: string; dateColumn: string; metricColumn: string
      granularity: 'day' | 'week' | 'month'; points: { t: string; v: number }[]
      growthPct: number | null; format: ValueFormat }
  | { kind: 'breakdown'; id: string; title: string; column: string
      items: { name: string; count: number; sharePct: number }[] }
  | { kind: 'slice'; id: string; title: string; categoryColumn: string; metricColumn: string
      agg: 'sum'; items: { name: string; value: number }[]; format: ValueFormat }

export const WIDGET_LIMIT = 40
const NUMERIC: ColumnType[] = ['number', 'money', 'percent']
const TOP_N = 10

const formatOf = (t: ColumnType): ValueFormat => (t === 'money' ? 'money' : t === 'percent' ? 'percent' : 'number')
const round1 = (n: number) => Math.round(n * 10) / 10

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function bucketKey(iso: string, g: 'day' | 'week' | 'month'): string {
  if (g === 'day') return iso
  if (g === 'month') return iso.slice(0, 7)
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)) // понедельник недели
  return d.toISOString().slice(0, 10)
}

export function buildWidgets(d: OkDataset): { widgets: Widget[]; truncated: number } {
  const widgets: Widget[] = []
  const pos = (c: DatasetColumn) => d.columns.indexOf(c)
  const numericCols = d.columns.filter((c) => NUMERIC.includes(c.type))
  const categoryCols = d.columns.filter((c) => c.type === 'category')
  const dateCol = d.columns.find((c) => c.type === 'date')

  widgets.push({ kind: 'rowcount', id: 'rowcount', title: 'Строк данных', count: d.rows.length })

  for (const col of numericCols) {
    const p = pos(col)
    const nums = d.rows.map((r) => r[p]).filter((v): v is number => typeof v === 'number')
    if (!nums.length) continue
    const sorted = [...nums].sort((a, b) => a - b)
    const sum = nums.reduce((a, b) => a + b, 0)
    widgets.push({
      kind: 'kpi', id: `kpi:${col.key}`, title: col.title, column: col.title, format: formatOf(col.type),
      stats: { sum, avg: sum / nums.length, median: median(sorted), min: sorted[0], max: sorted[sorted.length - 1], count: nums.length },
    })
  }

  if (dateCol) {
    const datePos = pos(dateCol)
    for (const col of numericCols) {
      const metricPos = pos(col)
      const pairs = d.rows
        .map((r) => ({ t: r[datePos], v: r[metricPos] }))
        .filter((p): p is { t: string; v: number } => typeof p.t === 'string' && typeof p.v === 'number')
      if (pairs.length < 2) continue
      const days = pairs.map((p) => p.t).sort()
      const spanDays = (Date.parse(days[days.length - 1]) - Date.parse(days[0])) / 86_400_000
      const granularity: 'day' | 'week' | 'month' = spanDays > 180 ? 'month' : spanDays > 45 ? 'week' : 'day'
      const buckets = new Map<string, number>()
      for (const p of pairs) {
        const key = bucketKey(p.t, granularity)
        buckets.set(key, (buckets.get(key) ?? 0) + p.v)
      }
      const points = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, v]) => ({ t, v }))
      let growthPct: number | null = null
      if (points.length >= 2) {
        const prev = points[points.length - 2].v
        const last = points[points.length - 1].v
        growthPct = prev === 0 ? null : round1(((last - prev) / Math.abs(prev)) * 100)
      }
      widgets.push({
        kind: 'timeseries', id: `ts:${col.key}`, title: `${col.title} — динамика`,
        dateColumn: dateCol.title, metricColumn: col.title, granularity, points, growthPct, format: formatOf(col.type),
      })
    }
  }

  for (const col of categoryCols) {
    const p = pos(col)
    const counts = new Map<string, number>()
    let total = 0
    for (const r of d.rows) {
      const v = r[p]
      if (v === null || v === '') continue
      total++
      counts.set(String(v), (counts.get(String(v)) ?? 0) + 1)
    }
    if (!total) continue
    const items = [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, TOP_N)
      .map(([name, count]) => ({ name, count, sharePct: round1((count / total) * 100) }))
    widgets.push({ kind: 'breakdown', id: `br:${col.key}`, title: `${col.title} — структура`, column: col.title, items })
  }

  for (const cat of categoryCols.slice(0, 2)) {
    for (const metric of numericCols.slice(0, 3)) {
      const cp = pos(cat)
      const mp = pos(metric)
      const sums = new Map<string, number>()
      for (const r of d.rows) {
        const name = r[cp]
        const v = r[mp]
        if (name === null || name === '' || typeof v !== 'number') continue
        sums.set(String(name), (sums.get(String(name)) ?? 0) + v)
      }
      if (!sums.size) continue
      const items = [...sums.entries()].sort(([, a], [, b]) => b - a).slice(0, TOP_N)
        .map(([name, value]) => ({ name, value }))
      widgets.push({
        kind: 'slice', id: `sl:${cat.key}:${metric.key}`, title: `${metric.title} по «${cat.title}»`,
        categoryColumn: cat.title, metricColumn: metric.title, agg: 'sum', items, format: formatOf(metric.type),
      })
    }
  }

  const truncated = Math.max(0, widgets.length - WIDGET_LIMIT)
  return { widgets: widgets.slice(0, WIDGET_LIMIT), truncated }
}
