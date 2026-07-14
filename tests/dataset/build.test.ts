import { describe, it, expect } from 'vitest'
import { buildDataset } from '@/lib/dataset/build'
import type { SheetSnapshot, SnapshotCell, SnapshotStyle } from '@/lib/types'

function snap(cellData: Record<number, Record<number, SnapshotCell>>, styles: Record<string, SnapshotStyle> = {}): SheetSnapshot {
  return { name: 'S', rowCount: 100, columnCount: 26, mergeData: [], styles, cellData }
}

// 4 строки данных: «Канал» должен дать уникальность 2/4 = 0.5 (порог category)
const marketing = snap(
  {
    0: { 0: { v: 'Дата' }, 1: { v: 'Канал' }, 2: { v: 'Расход' }, 3: { v: 'Лиды' } },
    1: { 0: { v: 46174, s: 'd' }, 1: { v: 'VK' }, 2: { v: 1000, s: 'c' }, 3: { v: 10 } },
    2: { 0: { v: 46175, s: 'd' }, 1: { v: 'Яндекс' }, 2: { v: 2000, s: 'c' }, 3: { v: 25 } },
    3: { 0: { v: 46176, s: 'd' }, 1: { v: 'VK' }, 2: { v: 1500, s: 'c' }, 3: { v: 15 } },
    4: { 0: { v: 46177, s: 'd' }, 1: { v: 'VK' }, 2: { v: 500, s: 'c' }, 3: { v: 5 } },
  },
  { d: { nfType: 'DATE', n: { pattern: 'dd.mm.yyyy' } }, c: { nfType: 'CURRENCY', n: { pattern: '#,##0 ₸' } } },
)

describe('buildDataset', () => {
  it('строит типизированный dataset из чистого листа', () => {
    const d = buildDataset(marketing)
    if (d.status !== 'ok') throw new Error(`ожидали ok, получили ${d.status}`)
    expect(d.columns.map((c) => c.type)).toEqual(['date', 'category', 'money', 'number'])
    expect(d.columns.map((c) => c.title)).toEqual(['Дата', 'Канал', 'Расход', 'Лиды'])
    expect(d.rows[0]).toEqual(['2026-06-01', 'VK', 1000, 10])
    expect(d.rows).toHaveLength(4)
  })

  it('пустой лист → empty', () => {
    expect(buildDataset(snap({})).status).toBe('empty')
  })

  it('лист без распознаваемых заголовков → needs_mapping', () => {
    const messy = snap({
      0: { 0: { v: 'Свободный текст в углу' } },
      5: { 3: { v: 123 } },
    })
    expect(buildDataset(messy).status).toBe('needs_mapping')
  })
})
