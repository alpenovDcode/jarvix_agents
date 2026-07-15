import { round1 } from '@/lib/analytics/widgets'
import { fmtInt, fmtRub } from '@/lib/viz'
import type { SheetSnapshot } from '@/lib/types'
import type { Breakdown, Insight, Kpi, Svodka } from '@/lib/svodka/aggregate'

// Кураторская сводка «Сводная маркетинг» по КАНАЛАМ привлечения (основные листы:
// Посевы, РСЯ, Цой, INST ЛМ). В каждом листе метрики повторяются по под-блокам
// (лид-магниты / периоды), а колонка B — ИТОГ по блоку. Итог канала = сумма B
// по всем вхождениям метрики. Метрики матчатся по названию.

export interface ChannelInput { name: string; snapshot: SheetSnapshot }

const cell = (s: SheetSnapshot, r: number, c: number): unknown => s.cellData[r]?.[c]?.v
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Сумма колонки B (ИТОГ, индекс 1) по всем строкам, чья метка начинается с key. */
function sumByLabel(s: SheetSnapshot, key: string): number {
  const k = key.toLowerCase()
  let total = 0
  for (const r of Object.keys(s.cellData).map(Number)) {
    if (str(cell(s, r, 0)).toLowerCase().startsWith(k)) {
      const v = cell(s, r, 1)
      if (typeof v === 'number' && Number.isFinite(v)) total += v
    }
  }
  return total
}

interface ChannelTotals { name: string; budget: number; activations: number; subs: number; pays: number; revenue: number }

function totals(ch: ChannelInput): ChannelTotals {
  return {
    name: ch.name,
    budget: sumByLabel(ch.snapshot, 'Бюджет потраченн'),
    activations: sumByLabel(ch.snapshot, 'Активаци'), // «Активаций бота» и «Активации бота ТГ»
    subs: sumByLabel(ch.snapshot, 'Кол-во подписок'),
    pays: sumByLabel(ch.snapshot, 'Кол-во оплат'),
    revenue: sumByLabel(ch.snapshot, 'Сумма оплат'),
  }
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const bars = (ch: ChannelTotals[], pick: (c: ChannelTotals) => number) =>
  ch.map((c) => ({ name: c.name, value: Math.round(pick(c)) })).filter((b) => b.value > 0).sort((a, b) => b.value - a.value)

export function buildMarketingSvodka(channels: ChannelInput[]): Svodka {
  const ch = channels.map(totals).filter((c) => c.budget > 0 || c.activations > 0 || c.subs > 0)

  const totBudget = sum(ch.map((c) => c.budget))
  const totAct = sum(ch.map((c) => c.activations))
  const totSubs = sum(ch.map((c) => c.subs))
  const totPays = sum(ch.map((c) => c.pays))
  const totRev = sum(ch.map((c) => c.revenue))
  const avgCpl = totSubs ? Math.round(totBudget / totSubs) : 0

  const kpis: Kpi[] = [
    { id: 'k-budget', label: 'Бюджет Σ', value: totBudget, format: 'money', deltaPct: null, note: `${ch.length} каналов`, higherBetter: false },
    { id: 'k-act', label: 'Активаций Σ', value: totAct, format: 'number', deltaPct: null, note: 'по каналам' },
    { id: 'k-subs', label: 'Подписок Σ', value: totSubs, format: 'number', deltaPct: null, note: 'по каналам' },
    { id: 'k-cpl', label: 'Цена подписки', value: avgCpl, format: 'money', deltaPct: null, note: 'средняя по каналам', higherBetter: false },
    { id: 'k-pays', label: 'Оплат Σ', value: totPays, format: 'number', deltaPct: null, note: 'по каналам' },
    { id: 'k-rev', label: 'Выручка Σ', value: totRev, format: 'money', deltaPct: null, note: 'сумма оплат' },
  ]

  // combo: бюджет (бары) + подписки (линия) по каналам
  const byBudget = [...ch].sort((a, b) => b.budget - a.budget)
  const combo: Svodka['combo'] = {
    title: 'Бюджет и подписки по каналам',
    note: 'Бары — освоенный бюджет канала, линия — полученные подписки. Видно отдачу каждого канала.',
    barLabel: 'Бюджет ₽', lineLabel: 'Подписки', barFormat: 'money', lineFormat: 'number',
    rows: byBudget.map((c) => ({ t: c.name, bar: Math.round(c.budget), line: c.subs })),
  }

  const cplByChannel = ch
    .filter((c) => c.subs > 0 && c.budget > 0)
    .map((c) => ({ name: c.name, value: Math.round(c.budget / c.subs) }))
    .sort((a, b) => a.value - b.value)
  const allBreakdowns: Breakdown[] = [
    { id: 'b-budget', title: 'Бюджет по каналам', note: 'освоено, ₽', format: 'money', color: 'series3', bars: bars(ch, (c) => c.budget) },
    { id: 'b-subs', title: 'Подписки по каналам', note: 'привлечено подписчиков', format: 'number', color: 'series2', bars: bars(ch, (c) => c.subs) },
    { id: 'b-act', title: 'Активации бота по каналам', note: 'переходы в бота', format: 'number', color: 'series1', bars: bars(ch, (c) => c.activations) },
    { id: 'b-cpl', title: 'Цена подписки по каналам', note: 'бюджет / подписки — меньше лучше', format: 'money', color: 'series1', bars: cplByChannel },
  ]
  const breakdowns = allBreakdowns.filter((b) => b.bars.length > 0)

  const topSubs = bars(ch, (c) => c.subs)[0]
  const cheapest = cplByChannel[0]
  const topBudget = byBudget[0]
  const insights: Insight[] = [
    topSubs && { id: 'i-subs', emoji: '🏆', label: 'Канал-лидер по подпискам', text: `«${topSubs.name}» — ${fmtInt(topSubs.value)} подписок.` },
    cheapest && { id: 'i-cpl', emoji: '💚', label: 'Самая дешёвая подписка', text: `«${cheapest.name}» — ${fmtRub(cheapest.value)} за подписку.` },
    topBudget && { id: 'i-bud', emoji: '💰', label: 'Крупнейший бюджет', text: `«${topBudget.name}» — ${fmtRub(Math.round(topBudget.budget))} (${round1((topBudget.budget / (totBudget || 1)) * 100)}% всех трат).` },
  ].filter(Boolean) as Insight[]

  return {
    period: 'по каналам привлечения',
    title: 'Сводная маркетинг — каналы привлечения',
    subtitle: `Сравнение каналов · ${ch.map((c) => c.name).join(' · ')} · итоги по листам`,
    headline: [
      { label: 'Бюджет Σ', value: totBudget, format: 'money' },
      { label: 'Активаций Σ', value: totAct, format: 'number' },
      { label: 'Подписок Σ', value: totSubs, format: 'number' },
      { label: 'Выручка Σ', value: totRev, format: 'money' },
    ],
    kpis, goals: [], wasNow: [], areas: [], combo, breakdowns, insights, missing: [],
  }
}
