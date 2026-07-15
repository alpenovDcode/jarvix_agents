import { groupSum, round1, type OkDataset, type ValueFormat } from '@/lib/analytics/widgets'
import { fmtInt } from '@/lib/viz'

// Кураторская «Сводка отдела»: конкретный шаблон под три демо-таблицы маркетинга.
// ads    — Дата, Канал, Расход, Лиды, Стоимость лида
// funnel — Неделя, Источник, Показы, Клики, Заявки, Продажи
// content— Дата, Площадка, Тема, Формат, Охват
// Когда появятся реальные метрики отдела — маппинг колонок заменяется, форма вывода та же.

export type { ValueFormat }

export interface Kpi { id: string; label: string; value: number; format: ValueFormat; deltaPct: number | null; note: string; higherBetter?: boolean }
export interface Goal { id: string; label: string; value: number; target: number; format: ValueFormat }
export interface WasNowRow { id: string; label: string; from: number; to: number; deltaPct: number; format: ValueFormat }
export interface Point { t: string; v: number }
export interface AreaSeries { id: string; title: string; note: string; format: ValueFormat; color: 'series1' | 'series2' | 'series3'; points: Point[] }
export interface ComboData { title: string; note: string; barLabel: string; lineLabel: string; barFormat: ValueFormat; lineFormat: ValueFormat; rows: { t: string; bar: number; line: number }[] }
export interface Insight { id: string; emoji: string; label: string; text: string }
export interface HeadlineStat { label: string; value: number; format: ValueFormat }
export interface Svodka {
  period: string
  title: string
  subtitle: string
  headline: HeadlineStat[]
  kpis: Kpi[]
  goals: Goal[]
  wasNow: WasNowRow[]
  areas: AreaSeries[]
  combo: ComboData
  insights: Insight[]
  /** Колонки, не найденные в источниках («таблица: колонка») — сводка по ним молча покажет нули. */
  missing: string[]
}

export interface SvodkaInputs { ads: OkDataset; funnel: OkDataset; content: OkDataset }

// ——— доступ к типизированным колонкам dataset ———
function colIndex(ds: OkDataset, title: string): number {
  return ds.columns.findIndex((c) => c.title.toLowerCase() === title.toLowerCase())
}
function numbers(ds: OkDataset, title: string): number[] {
  const i = colIndex(ds, title)
  if (i < 0) return []
  return ds.rows.map((r) => r[i]).filter((v): v is number => typeof v === 'number')
}
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

/**
 * Δ% как «вторая половина периода к первой» — прокси сравнения с прошлым периодом.
 * Сравниваем СРЕДНИЕ половин, не суммы: при нечётной длине половины разного размера,
 * и суммы дали бы +100% на абсолютно ровном ряду.
 */
function halfDelta(nums: number[]): number | null {
  if (nums.length < 2) return null
  const mid = Math.floor(nums.length / 2)
  const firstAvg = sum(nums.slice(0, mid)) / mid
  const secondAvg = sum(nums.slice(mid)) / (nums.length - mid)
  if (firstAvg === 0) return null
  return round1(((secondAvg - firstAvg) / firstAvg) * 100)
}

/** Сумма метрики по категории через общий groupSum (единая семантика со slice-виджетами). */
function sumBy(ds: OkDataset, keyTitle: string, valTitle: string): { name: string; value: number }[] {
  const ki = colIndex(ds, keyTitle)
  const vi = colIndex(ds, valTitle)
  if (ki < 0 || vi < 0) return []
  return groupSum(ds.rows, ki, vi)
}

/** Ряд «дата → сумма метрики» (несколько строк на дату суммируются), по возрастанию даты. */
function seriesByDate(ds: OkDataset, dateTitle: string, valTitle: string): Point[] {
  const di = colIndex(ds, dateTitle)
  const vi = colIndex(ds, valTitle)
  if (di < 0 || vi < 0) return []
  const acc = new Map<string, number>()
  for (const r of ds.rows) {
    const t = r[di]
    const v = r[vi]
    if (typeof t !== 'string' || typeof v !== 'number') continue
    acc.set(t, (acc.get(t) ?? 0) + v)
  }
  return [...acc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, v]) => ({ t, v }))
}

const shortDate = (iso: string): string => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[2]}.${m[1]}` : iso
}

/** Требуемые колонки по источникам — для громкого предупреждения вместо тихих нулей. */
const REQUIRED: { ds: keyof SvodkaInputs; label: string; cols: string[] }[] = [
  { ds: 'ads', label: 'Рекламные каналы', cols: ['Дата', 'Канал', 'Расход', 'Лиды'] },
  { ds: 'funnel', label: 'Воронка', cols: ['Неделя', 'Показы', 'Клики', 'Заявки', 'Продажи'] },
  { ds: 'content', label: 'Контент-план', cols: ['Дата', 'Площадка', 'Охват'] },
]

export function buildSvodka(inputs: SvodkaInputs): Svodka {
  const { ads, funnel, content } = inputs
  const missing = REQUIRED.flatMap(({ ds, label, cols }) =>
    cols.filter((c) => colIndex(inputs[ds], c) < 0).map((c) => `${label}: «${c}»`))

  const spend = sum(numbers(ads, 'Расход'))
  const leads = sum(numbers(ads, 'Лиды'))
  const impressions = sum(numbers(funnel, 'Показы'))
  const clicks = sum(numbers(funnel, 'Клики'))
  const requests = sum(numbers(funnel, 'Заявки'))
  const sales = sum(numbers(funnel, 'Продажи'))
  const reach = sum(numbers(content, 'Охват'))
  const posts = content.rows.length

  const kpis: Kpi[] = [
    { id: 'sales', label: 'Продажи', value: sales, format: 'number', deltaPct: halfDelta(numbers(funnel, 'Продажи')), note: 'воронка' },
    { id: 'requests', label: 'Заявки', value: requests, format: 'number', deltaPct: halfDelta(numbers(funnel, 'Заявки')), note: 'воронка' },
    { id: 'leads', label: 'Лиды', value: leads, format: 'number', deltaPct: halfDelta(numbers(ads, 'Лиды')), note: 'реклама' },
    { id: 'spend', label: 'Расход', value: spend, format: 'money', deltaPct: halfDelta(numbers(ads, 'Расход')), note: 'бюджет' },
    { id: 'reach', label: 'Охват', value: reach, format: 'number', deltaPct: halfDelta(numbers(content, 'Охват')), note: 'контент' },
    { id: 'posts', label: 'Публикаций', value: posts, format: 'number', deltaPct: null, note: 'все площадки' },
    { id: 'clicks', label: 'Клики', value: clicks, format: 'number', deltaPct: halfDelta(numbers(funnel, 'Клики')), note: 'воронка' },
    { id: 'cr', label: 'Заявка→продажа', value: requests ? round1((sales / requests) * 100) : 0, format: 'number', deltaPct: null, note: 'конверсия, %' },
  ]

  // Демо-цели месяца (когда появятся реальные — берём из настроек отдела).
  const goals: Goal[] = [
    { id: 'g-sales', label: 'Продажи', value: sales, target: 1000, format: 'number' },
    { id: 'g-requests', label: 'Заявки', value: requests, target: 4000, format: 'number' },
    { id: 'g-leads', label: 'Лиды', value: leads, target: 2000, format: 'number' },
    { id: 'g-reach', label: 'Охват', value: reach, target: 180_000, format: 'number' },
    { id: 'g-posts', label: 'Публикаций', value: posts, target: 12, format: 'number' },
  ]

  const salesByWeek = seriesByDate(funnel, 'Неделя', 'Продажи')
  const firstW = salesByWeek[0]?.v ?? 0
  const lastW = salesByWeek[salesByWeek.length - 1]?.v ?? 0
  const reqByWeek = seriesByDate(funnel, 'Неделя', 'Заявки')
  const impFirst = reqByWeek[0]?.v ?? 0
  const impLast = reqByWeek[reqByWeek.length - 1]?.v ?? 0
  const wasNow: WasNowRow[] = [
    { id: 'wn-sales', label: 'Продаж / нед', from: firstW, to: lastW, deltaPct: firstW ? round1(((lastW - firstW) / firstW) * 100) : 0, format: 'number' },
    { id: 'wn-req', label: 'Заявок / нед', from: impFirst, to: impLast, deltaPct: impFirst ? round1(((impLast - impFirst) / impFirst) * 100) : 0, format: 'number' },
  ]

  const leadsByDay = seriesByDate(ads, 'Дата', 'Лиды').map((p) => ({ t: shortDate(p.t), v: p.v }))
  const reachByDay = seriesByDate(content, 'Дата', 'Охват').map((p) => ({ t: shortDate(p.t), v: p.v }))
  const areas: AreaSeries[] = [
    { id: 'a-leads', title: 'Лиды по дням', note: 'из рекламных каналов', format: 'number', color: 'series1', points: leadsByDay },
    { id: 'a-reach', title: 'Охват контента по дням', note: 'сумма по площадкам', format: 'number', color: 'series3', points: reachByDay },
  ]

  // Combo: заявки по неделям (бары) + кумулятивные продажи (линия).
  // Джойним по КЛЮЧУ недели, не по индексу: у ряда без значения за неделю
  // индексы съезжают, и бары уехали бы на чужие недели.
  const salesMap = new Map(salesByWeek.map((p) => [p.t, p.v]))
  const reqMap = new Map(reqByWeek.map((p) => [p.t, p.v]))
  const allWeeks = [...new Set([...salesMap.keys(), ...reqMap.keys()])].sort((a, b) => a.localeCompare(b))
  let cum = 0
  const combo: ComboData = {
    title: 'Заявки по неделям + продажи нарастающим итогом',
    note: 'Бары — заявки за неделю, линия — суммарные продажи. Каждая продажа поднимает линию ступенькой.',
    barLabel: 'Заявки', lineLabel: 'Продажи Σ', barFormat: 'number', lineFormat: 'number',
    rows: allWeeks.map((week) => {
      cum += salesMap.get(week) ?? 0
      return { t: shortDate(week), bar: reqMap.get(week) ?? 0, line: cum }
    }),
  }

  const topChannel = sumBy(ads, 'Канал', 'Лиды')[0]
  const topPlatform = sumBy(content, 'Площадка', 'Охват')[0]
  const bestWeek = [...salesByWeek].sort((a, b) => b.v - a.v)[0]
  const clickCr = impressions ? round1((clicks / impressions) * 100) : 0
  const insights: Insight[] = [
    topChannel && { id: 'i-ch', emoji: '🏆', label: 'Канал-лидер по лидам', text: `«${topChannel.name}» — ${fmtInt(topChannel.value)} лид(ов) за период.` },
    topPlatform && { id: 'i-pl', emoji: '📣', label: 'Площадка-лидер по охвату', text: `«${topPlatform.name}» — ${fmtInt(topPlatform.value)} охвата.` },
    bestWeek && { id: 'i-wk', emoji: '🔥', label: 'Лучшая неделя по продажам', text: `${shortDate(bestWeek.t)} — ${fmtInt(bestWeek.v)} продаж.` },
    { id: 'i-cr', emoji: '📈', label: 'Конверсия показ→клик', text: `${clickCr}% (${fmtInt(clicks)} кликов из ${fmtInt(impressions)} показов).` },
  ].filter(Boolean) as Insight[]

  return {
    period: 'Демо-период',
    title: 'Сводка отдела маркетинга',
    subtitle: 'Демо-данные · собрано из таблиц «Рекламные каналы», «Воронка», «Контент-план»',
    headline: [
      { label: 'Расход', value: spend, format: 'money' },
      { label: 'Продажи', value: sales, format: 'number' },
      { label: 'Лиды', value: leads, format: 'number' },
      { label: 'Охват', value: reach, format: 'number' },
    ],
    kpis, goals, wasNow, areas, combo, insights, missing,
  }
}
