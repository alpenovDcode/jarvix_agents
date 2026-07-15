import { describe, it, expect } from 'vitest'
import { buildMarketingSvodka, type ChannelInput } from '@/lib/svodka/marketing'
import type { SheetSnapshot } from '@/lib/types'

// лист-канал: метрики повторяются по под-блокам (ЛМ), колонка B (индекс 1) — ИТОГ блока
function snap(rows: [string, number | null][]): SheetSnapshot {
  const cd: SheetSnapshot['cellData'] = {}
  rows.forEach(([label, b], i) => {
    cd[i] = { 0: { v: label } }
    if (b !== null) cd[i][1] = { v: b }
  })
  return { name: 't', rowCount: rows.length + 2, columnCount: 10, cellData: cd, mergeData: [], styles: {} }
}

const channels: ChannelInput[] = [
  {
    name: 'Посевы',
    snapshot: snap([
      ['ЛМ Статья', null],
      ['Бюджет потраченный', 60], ['Кол-во подписок', 30],
      ['ЛМ Профи', null],
      ['Бюджет потраченный', 40], ['Кол-во подписок', 20], // итог канала: бюджет 100, подписок 50
    ]),
  },
  {
    name: 'РСЯ',
    snapshot: snap([
      ['Бюджет потраченный', 200], ['Кол-во подписок', 50], ['Кол-во оплат', 3], ['Сумма оплат', 90000],
    ]),
  },
]

describe('buildMarketingSvodka (каналы)', () => {
  const s = buildMarketingSvodka(channels)

  it('итог канала = сумма колонки B по под-блокам', () => {
    const budget = s.breakdowns!.find((b) => b.id === 'b-budget')!
    expect(budget.bars).toEqual([
      { name: 'РСЯ', value: 200 },
      { name: 'Посевы', value: 100 }, // 60+40
    ])
  })

  it('KPI: суммы по всем каналам + средняя цена подписки', () => {
    const byId = Object.fromEntries(s.kpis.map((k) => [k.id, k.value]))
    expect(byId['k-budget']).toBe(300)
    expect(byId['k-subs']).toBe(100) // 50+50
    expect(byId['k-cpl']).toBe(3) // 300/100
  })

  it('цена подписки по каналам — Посевы дешевле', () => {
    const cpl = s.breakdowns!.find((b) => b.id === 'b-cpl')!
    expect(cpl.bars).toEqual([
      { name: 'Посевы', value: 2 }, // 100/50
      { name: 'РСЯ', value: 4 }, // 200/50
    ])
  })

  it('combo: бюджет + подписки по каналам', () => {
    expect(s.combo.rows).toEqual([
      { t: 'РСЯ', bar: 200, line: 50 },
      { t: 'Посевы', bar: 100, line: 50 },
    ])
  })

  it('инсайт: самая дешёвая подписка — Посевы', () => {
    expect(s.insights.find((i) => i.id === 'i-cpl')!.text).toContain('Посевы')
  })
})
