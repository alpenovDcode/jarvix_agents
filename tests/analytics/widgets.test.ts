import { describe, it, expect } from 'vitest'
import { buildWidgets, WIDGET_LIMIT, type OkDataset } from '@/lib/analytics/widgets'
import type { CellScalar, ColumnType } from '@/lib/types'

function ds(cols: { title: string; type: ColumnType }[], rows: CellScalar[][]): OkDataset {
  return {
    status: 'ok', headerRow: 0, confidence: 0.9,
    range: { startCol: 0, endCol: cols.length - 1, endRow: rows.length },
    columns: cols.map((c, i) => ({ index: i, key: `c${i}`, title: c.title, type: c.type })),
    rows,
  }
}

const base = ds(
  [
    { title: 'Дата', type: 'date' },
    { title: 'Канал', type: 'category' },
    { title: 'Расход', type: 'money' },
  ],
  [
    ['2026-06-01', 'VK', 100],
    ['2026-06-01', 'Яндекс', 300],
    ['2026-06-02', 'VK', 200],
    ['2026-06-03', 'VK', 400],
  ],
)

describe('buildWidgets', () => {
  it('rowcount и kpi со статистикой', () => {
    const { widgets } = buildWidgets(base)
    const rowcount = widgets.find((w) => w.kind === 'rowcount')!
    expect(rowcount).toMatchObject({ count: 4 })
    const kpi = widgets.find((w) => w.kind === 'kpi')!
    expect(kpi).toMatchObject({
      column: 'Расход', format: 'money',
      stats: { sum: 1000, avg: 250, median: 250, min: 100, max: 400, count: 4 },
    })
  })

  it('timeseries: дневная гранулярность, суммирование по дате, рост', () => {
    const { widgets } = buildWidgets(base)
    const ts = widgets.find((w) => w.kind === 'timeseries')!
    if (ts.kind !== 'timeseries') throw new Error('unreachable')
    expect(ts.granularity).toBe('day')
    expect(ts.points).toEqual([
      { t: '2026-06-01', v: 400 },
      { t: '2026-06-02', v: 200 },
      { t: '2026-06-03', v: 400 },
    ])
    expect(ts.growthPct).toBe(100) // 400 против 200
  })

  it('growthPct = null, когда предыдущий период равен 0', () => {
    const d = ds(
      [{ title: 'Дата', type: 'date' }, { title: 'Лиды', type: 'number' }],
      [['2026-06-01', 0], ['2026-06-02', 50]],
    )
    const ts = buildWidgets(d).widgets.find((w) => w.kind === 'timeseries')!
    if (ts.kind !== 'timeseries') throw new Error('unreachable')
    expect(ts.growthPct).toBeNull()
  })

  it('месячная гранулярность на длинном интервале', () => {
    const d = ds(
      [{ title: 'Дата', type: 'date' }, { title: 'Лиды', type: 'number' }],
      [['2025-01-05', 1], ['2025-06-10', 2], ['2025-12-20', 3]],
    )
    const ts = buildWidgets(d).widgets.find((w) => w.kind === 'timeseries')!
    if (ts.kind !== 'timeseries') throw new Error('unreachable')
    expect(ts.granularity).toBe('month')
    expect(ts.points[0]).toEqual({ t: '2025-01', v: 1 })
  })

  it('breakdown: топ по количеству с долями', () => {
    const { widgets } = buildWidgets(base)
    const br = widgets.find((w) => w.kind === 'breakdown')!
    if (br.kind !== 'breakdown') throw new Error('unreachable')
    expect(br.items).toEqual([
      { name: 'VK', count: 3, sharePct: 75 },
      { name: 'Яндекс', count: 1, sharePct: 25 },
    ])
  })

  it('slice: сумма метрики по категории, по убыванию', () => {
    const { widgets } = buildWidgets(base)
    const sl = widgets.find((w) => w.kind === 'slice')!
    if (sl.kind !== 'slice') throw new Error('unreachable')
    expect(sl.items).toEqual([
      { name: 'VK', value: 700 },
      { name: 'Яндекс', value: 300 },
    ])
  })

  it('без колонки-даты нет timeseries', () => {
    const d = ds([{ title: 'Канал', type: 'category' }, { title: 'Лиды', type: 'number' }], [['VK', 1]])
    expect(buildWidgets(d).widgets.some((w) => w.kind === 'timeseries')).toBe(false)
  })

  it('ограничение WIDGET_LIMIT с подсчётом отброшенного', () => {
    const cols: { title: string; type: ColumnType }[] = [{ title: 'Дата', type: 'date' }]
    for (let i = 0; i < 60; i++) cols.push({ title: `М${i}`, type: 'number' })
    const rows = [['2026-06-01', ...Array(60).fill(1)] as CellScalar[], ['2026-06-02', ...Array(60).fill(2)] as CellScalar[]]
    const { widgets, truncated } = buildWidgets(ds(cols, rows))
    expect(widgets.length).toBeLessThanOrEqual(WIDGET_LIMIT)
    expect(truncated).toBeGreaterThan(0)
  })
})
