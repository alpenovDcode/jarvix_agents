import { describe, it, expect } from 'vitest'
import { buildSvodka, type SvodkaInputs } from '@/lib/svodka/aggregate'
import type { CellScalar, ColumnType } from '@/lib/types'
import type { OkDataset } from '@/lib/analytics/widgets'

function ds(cols: { title: string; type: ColumnType }[], rows: CellScalar[][]): OkDataset {
  return {
    status: 'ok', headerRow: 0, confidence: 0.9,
    range: { startCol: 0, endCol: cols.length - 1, endRow: rows.length },
    columns: cols.map((c, i) => ({ index: i, key: `c${i}`, title: c.title, type: c.type })),
    rows,
  }
}

const inputs: SvodkaInputs = {
  ads: ds(
    [{ title: 'Дата', type: 'date' }, { title: 'Канал', type: 'category' }, { title: 'Расход', type: 'money' }, { title: 'Лиды', type: 'number' }],
    [
      ['2026-06-01', 'Instagram', 1000, 10],
      ['2026-06-01', 'Google Ads', 2000, 20],
      ['2026-06-02', 'Instagram', 1500, 15],
      ['2026-06-02', 'Google Ads', 2500, 25],
    ],
  ),
  funnel: ds(
    [{ title: 'Неделя', type: 'date' }, { title: 'Показы', type: 'number' }, { title: 'Клики', type: 'number' }, { title: 'Заявки', type: 'number' }, { title: 'Продажи', type: 'number' }],
    [
      ['2026-05-04', 1000, 100, 20, 4],
      ['2026-05-11', 1200, 120, 24, 6],
      ['2026-05-18', 1400, 140, 28, 8],
      ['2026-05-25', 1600, 160, 32, 10],
    ],
  ),
  content: ds(
    [{ title: 'Дата', type: 'date' }, { title: 'Площадка', type: 'category' }, { title: 'Охват', type: 'number' }],
    [
      ['2026-06-02', 'Instagram', 5000],
      ['2026-06-04', 'Telegram', 3000],
      ['2026-06-06', 'Instagram', 7000],
    ],
  ),
}

describe('buildSvodka', () => {
  const s = buildSvodka(inputs)

  it('KPI: суммы по метрикам и конверсия', () => {
    const byId = Object.fromEntries(s.kpis.map((k) => [k.id, k]))
    expect(byId.sales.value).toBe(28) // 4+6+8+10
    expect(byId.leads.value).toBe(70) // 10+20+15+25
    expect(byId.spend.value).toBe(7000)
    expect(byId.reach.value).toBe(15000)
    expect(byId.cr.value).toBe(26.9) // 28 продаж / 104 заявки * 100 ≈ 26.9
  })

  it('дельта продаж положительна (вторая половина > первой)', () => {
    const sales = s.kpis.find((k) => k.id === 'sales')!
    expect(sales.deltaPct).not.toBeNull()
    expect(sales.deltaPct!).toBeGreaterThan(0)
  })

  it('цели содержат факт и таргет', () => {
    const g = s.goals.find((x) => x.id === 'g-sales')!
    expect(g).toMatchObject({ value: 28, target: 1000 })
  })

  it('halfDelta сравнивает средние половин: ровный ряд ≈ 0%', () => {
    const flat = buildSvodka({
      ...inputs,
      funnel: ds(
        [{ title: 'Неделя', type: 'date' }, { title: 'Показы', type: 'number' }, { title: 'Клики', type: 'number' }, { title: 'Заявки', type: 'number' }, { title: 'Продажи', type: 'number' }],
        [
          ['2026-05-04', 1000, 100, 20, 10],
          ['2026-05-11', 1000, 100, 20, 10],
          ['2026-05-18', 1000, 100, 20, 10], // нечётная длина — раньше суммы половин давали +100%
        ],
      ),
    })
    expect(flat.kpis.find((k) => k.id === 'sales')!.deltaPct).toBe(0)
  })

  it('combo джойнит по ключу недели: пропуск продаж не сдвигает бары', () => {
    const gappy = buildSvodka({
      ...inputs,
      funnel: ds(
        [{ title: 'Неделя', type: 'date' }, { title: 'Показы', type: 'number' }, { title: 'Клики', type: 'number' }, { title: 'Заявки', type: 'number' }, { title: 'Продажи', type: 'number' }],
        [
          ['2026-05-04', 1000, 100, 20, 4],
          ['2026-05-11', 1200, 120, 24, null], // продажи не заполнены
          ['2026-05-18', 1400, 140, 28, 8],
        ],
      ),
    })
    // все 3 недели на месте, заявки привязаны к своим неделям, кумулятив не падает
    expect(gappy.combo.rows.map((r) => ({ t: r.t, bar: r.bar }))).toEqual([
      { t: '04.05', bar: 20 },
      { t: '11.05', bar: 24 },
      { t: '18.05', bar: 28 },
    ])
    expect(gappy.combo.rows.map((r) => r.line)).toEqual([4, 4, 12])
  })

  it('missing: пусто при полных данных, называет отсутствующую колонку', () => {
    expect(s.missing).toEqual([])
    const broken = buildSvodka({
      ...inputs,
      ads: ds(
        [{ title: 'Дата', type: 'date' }, { title: 'Канал', type: 'category' }, { title: 'Затраты', type: 'money' }, { title: 'Лиды', type: 'number' }],
        [['2026-06-01', 'Instagram', 1000, 10]],
      ),
    })
    expect(broken.missing).toEqual(['Рекламные каналы: «Расход»'])
  })

  it('combo: кумулятивная линия растёт до суммы продаж', () => {
    expect(s.combo.rows).toHaveLength(4)
    expect(s.combo.rows[s.combo.rows.length - 1].line).toBe(28)
    expect(s.combo.rows[0].bar).toBe(20) // заявки первой недели
  })

  it('area: лиды по дням суммируются в рамках даты', () => {
    const leads = s.areas.find((a) => a.id === 'a-leads')!
    expect(leads.points).toEqual([
      { t: '01.06', v: 30 },
      { t: '02.06', v: 40 },
    ])
  })

  it('инсайт про канал-лидер по лидам', () => {
    const ch = s.insights.find((i) => i.id === 'i-ch')!
    expect(ch.text).toContain('Google Ads') // 45 лидов против 25 у Instagram
  })
})
