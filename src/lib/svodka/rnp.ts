import { round1 } from '@/lib/analytics/widgets'
import { fmtInt, fmtRub } from '@/lib/viz'
import type { SheetSnapshot } from '@/lib/types'
import type { Goal, Insight, Kpi, Svodka, ValueFormat, WasNowRow } from '@/lib/svodka/aggregate'

// Кураторская сводка по книге RNP «Прорыв»: помесячные листы план/факт.
// Ключевой приём: в каждом листе строки-метрики стоят в РАЗНОМ порядке и наборе,
// поэтому метрики матчатся по НАЗВАНИЮ (колонка A), а не по номеру строки.
// Колонки листа: A=метка(0) · B=План(1) · C=Факт(2) · D=%(3) · дальше дни.

export interface RnpMonth { label: string; snapshot: SheetSnapshot }

interface MetricDef { name: string; label: string; format: ValueFormat; higherBetter: boolean }
const METRICS: MetricDef[] = [
  { name: 'Регистраций', label: 'Регистраций', format: 'number', higherBetter: true },
  { name: 'Трафик', label: 'Трафик (лидов)', format: 'number', higherBetter: true },
  { name: 'Бюджет', label: 'Бюджет', format: 'money', higherBetter: false },
  { name: 'Цена лида', label: 'Цена лида', format: 'money', higherBetter: false },
  { name: 'Контент', label: 'Контент', format: 'number', higherBetter: true },
  { name: 'АП', label: 'АП (дошли)', format: 'number', higherBetter: true },
]

const cell = (s: SheetSnapshot, r: number, c: number): unknown => s.cellData[r]?.[c]?.v
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Найти метрику по названию (startsWith) и вернуть план/факт. */
function findMetric(s: SheetSnapshot, name: string): { plan: number | null; fact: number | null } | null {
  const rows = Object.keys(s.cellData).map(Number).sort((a, b) => a - b)
  const key = name.toLowerCase()
  for (const r of rows) {
    const label = cell(s, r, 0)
    if (typeof label === 'string' && label.toLowerCase().startsWith(key)) {
      return { plan: num(cell(s, r, 1)), fact: num(cell(s, r, 2)) }
    }
  }
  return null
}

const factSeries = (months: RnpMonth[], name: string) =>
  months.map((m) => ({ t: m.label, v: findMetric(m.snapshot, name)?.fact ?? 0 }))

export function buildRnpSvodka(months: RnpMonth[]): Svodka {
  // последний «полный» месяц — где регистраций набралось заметно (>100), иначе лист неполный
  const isFull = (m: RnpMonth) => (findMetric(m.snapshot, 'Регистраций')?.fact ?? 0) > 100
  const fullMonths = months.filter(isFull)
  const last = fullMonths[fullMonths.length - 1] ?? months[months.length - 1]
  const prev = fullMonths[fullMonths.length - 2]
  const first = months[0]

  const at = (m: RnpMonth | undefined, name: string) => (m ? findMetric(m.snapshot, name) : null)

  const kpis: Kpi[] = METRICS.map((met) => {
    const cur = at(last, met.name)?.fact ?? 0
    const before = at(prev, met.name)?.fact
    const deltaPct = before && before !== 0 ? round1(((cur - before) / before) * 100) : null
    const plan = at(last, met.name)?.plan
    const note = plan ? `план ${met.format === 'money' ? fmtRub(plan) : fmtInt(plan)}` : met.higherBetter ? 'больше — лучше' : 'меньше — лучше'
    return { id: `k-${met.name}`, label: met.label, value: cur, format: met.format, deltaPct, note, higherBetter: met.higherBetter }
  })

  // цели — только метрики «чем больше, тем лучше» (план как таргет)
  const goals: Goal[] = METRICS.filter((m) => m.higherBetter).map((met) => {
    const f = at(last, met.name)
    return { id: `g-${met.name}`, label: met.label, value: f?.fact ?? 0, target: f?.plan ?? 0, format: met.format }
  }).filter((g) => g.target > 0)

  const wasNow: WasNowRow[] = (['Регистраций', 'Бюджет', 'Трафик'] as const).map((name) => {
    const met = METRICS.find((m) => m.name === name)!
    const f0 = at(first, name)?.fact ?? 0
    const f1 = at(last, name)?.fact ?? 0
    return { id: `wn-${name}`, label: met.label, from: f0, to: f1, deltaPct: f0 ? round1(((f1 - f0) / f0) * 100) : 0, format: met.format }
  })

  const areas: Svodka['areas'] = [
    { id: 'a-reg', title: 'Регистрации по месяцам', note: 'факт, помесячно', format: 'number', color: 'series1', points: factSeries(months, 'Регистраций') },
    { id: 'a-budget', title: 'Бюджет по месяцам', note: 'освоение, ₽', format: 'money', color: 'series3', points: factSeries(months, 'Бюджет') },
  ]

  // combo: бюджет (бары) + регистрации (линия) — видно, сколько регистраций дал бюджет
  const budget = factSeries(months, 'Бюджет')
  const reg = factSeries(months, 'Регистраций')
  const combo: Svodka['combo'] = {
    title: 'Бюджет и регистрации по месяцам',
    note: 'Бары — освоенный бюджет за месяц, линия — регистрации. Видно эффективность вложений.',
    barLabel: 'Бюджет ₽', lineLabel: 'Регистраций', barFormat: 'money', lineFormat: 'number',
    rows: months.map((m, i) => ({ t: m.label, bar: budget[i].v, line: reg[i].v })),
  }

  // инсайты
  const regByMonth = factSeries(months, 'Регистраций')
  const best = [...regByMonth].sort((a, b) => b.v - a.v)[0]
  const cplLast = at(last, 'Цена лида')
  const trend = first && last ? round1((((at(last, 'Регистраций')?.fact ?? 0) - (at(first, 'Регистраций')?.fact ?? 0)) / ((at(first, 'Регистраций')?.fact ?? 1))) * 100) : 0
  const insights: Insight[] = [
    best && { id: 'i-best', emoji: '🏆', label: 'Пик регистраций', text: `${best.t} — ${fmtInt(best.v)} регистраций.` },
    { id: 'i-trend', emoji: trend >= 0 ? '📈' : '📉', label: 'Тренд за период', text: `регистрации ${trend >= 0 ? 'выросли' : 'упали'} на ${Math.abs(trend)}% (${first?.label} → ${last?.label}).` },
    cplLast?.fact != null && cplLast?.plan != null && {
      id: 'i-cpl', emoji: cplLast.fact <= cplLast.plan ? '✅' : '⚠️', label: `Цена лида (${last?.label})`,
      text: `${fmtRub(cplLast.fact)} при плане ${fmtRub(cplLast.plan)} — ${cplLast.fact <= cplLast.plan ? 'в норме' : 'выше плана'}.`,
    },
  ].filter(Boolean) as Insight[]

  return {
    period: `${first?.label} — ${months[months.length - 1]?.label}`,
    title: 'Прорыв — сводка воронки регистраций',
    subtitle: `Помесячный РнП · ${first?.label} — ${months[months.length - 1]?.label} · метрики сматчены по названию`,
    headline: [
      { label: `Регистраций (${last?.label})`, value: at(last, 'Регистраций')?.fact ?? 0, format: 'number' },
      { label: 'Бюджет', value: at(last, 'Бюджет')?.fact ?? 0, format: 'money' },
      { label: 'Трафик', value: at(last, 'Трафик')?.fact ?? 0, format: 'number' },
      { label: 'Цена лида', value: at(last, 'Цена лида')?.fact ?? 0, format: 'money' },
    ],
    kpis, goals, wasNow, areas, combo, insights, missing: [],
  }
}
