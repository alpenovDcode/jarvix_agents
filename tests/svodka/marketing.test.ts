import { describe, it, expect } from 'vitest'
import { buildMarketingSvodka, type ChannelInput } from '@/lib/svodka/marketing'
import type { SheetSnapshot } from '@/lib/types'

// лист с метками в A и значениями в заданной колонке
function sheet(rows: (number | string | null)[][]): SheetSnapshot {
  const cd: SheetSnapshot['cellData'] = {}
  rows.forEach((row, r) => {
    cd[r] = {}
    row.forEach((v, c) => { if (v !== null && v !== undefined) cd[r][c] = { v: v as string | number } })
  })
  return { name: 't', rowCount: rows.length + 2, columnCount: 12, cellData: cd, mergeData: [], styles: {} }
}

// каналы: ИТОГ в колонке B (индекс 1), метрики по под-блокам
const channels: ChannelInput[] = [
  { name: 'Посевы', snapshot: sheet([['ЛМ1'], ['Бюджет потраченный', 60], ['Кол-во подписок', 30], ['ЛМ2'], ['Бюджет потраченный', 40], ['Кол-во подписок', 20]]) },
  { name: 'РСЯ', snapshot: sheet([['Бюджет потраченный', 200], ['Кол-во подписок', 50]]) },
]
// Трафик ALL: факт в колонке C (индекс 2)
const trafficAll = sheet([
  ['Май', 'ПЛАН', 'ФАКТ'],
  ['Бюджет потраченный', null, 338038],
  ['Активаций бота', null, 523],
  ['Подписчиков', null, 228],
  ['Сумма оплат', null, 607345],
  ['Romi', null, 0.8],
])
// SEO: итоговая строка «Май …» + дневные
const seo = sheet([
  ['Дата', 'Показов', 'Кликов', 'Просмотров'],
  ['Май 2026', 16345, 700, 126],
  [null, 297, 16], [null, 281, 5], [null, 289, 14],
])
const baza = sheet([
  ['Новые подписчики', 'Итог'],
  ['Макс канал', 1490], ['ТГ канал подписки', 2536], ['Всего новых в базе', 4026],
])

describe('buildMarketingSvodka (многосекционная)', () => {
  const s = buildMarketingSvodka({ channels, trafficAll, seo, baza })

  it('верхние KPI берутся из «Трафик ALL» (колонка C)', () => {
    const byId = Object.fromEntries(s.kpis.map((k) => [k.id, k.value]))
    expect(byId['k-budget']).toBe(338038)
    expect(byId['k-act']).toBe(523)
    expect(byId['k-rev']).toBe(607345)
  })

  it('каналы: бюджет по каналам суммирован по под-блокам', () => {
    const b = s.breakdowns!.find((x) => x.id === 'b-budget')!
    expect(b.bars).toEqual([{ name: 'РСЯ', value: 200 }, { name: 'Посевы', value: 100 }])
  })

  it('раздел SEO: KPI показов/кликов/CTR', () => {
    const sec = s.sections!.find((x) => x.id === 's-seo')!
    const byId = Object.fromEntries(sec.kpis!.map((k) => [k.id, k.value]))
    expect(byId['seo-imp']).toBe(16345)
    expect(byId['seo-clk']).toBe(700)
    expect(byId['seo-ctr']).toBe(4.3) // 700/16345
  })

  it('раздел SEO: дневная динамика кликов', () => {
    const sec = s.sections!.find((x) => x.id === 's-seo')!
    expect(sec.areas![0].points).toEqual([{ t: '1', v: 16 }, { t: '2', v: 5 }, { t: '3', v: 14 }])
  })

  it('раздел База: источники подписчиков', () => {
    const sec = s.sections!.find((x) => x.id === 's-baza')!
    const bars = sec.breakdowns![0].bars
    expect(bars).toEqual([{ name: 'ТГ канал', value: 2536 }, { name: 'Макс канал', value: 1490 }])
  })
})
