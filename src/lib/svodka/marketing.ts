import { round1 } from '@/lib/analytics/widgets'
import { fmtInt, fmtRub } from '@/lib/viz'
import type { SheetSnapshot } from '@/lib/types'
import type { Breakdown, Insight, Kpi, Section, Svodka } from '@/lib/svodka/aggregate'

// Многосекционная кураторская сводка «Сводная маркетинг» по всем основным листам:
// Итог запуска (Трафик ALL) · Каналы (Посевы/РСЯ/Цой/INST) · SEO · База · Продукт (PostHog).
// Структуры листов разные, поэтому у каждого свой парсер; общее — матчинг строк по названию.

const cell = (s: SheetSnapshot, r: number, c: number): unknown => s.cellData[r]?.[c]?.v
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const parseNum = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') { const n = Number(v.replace(/[\s ]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null }
  return null
}
const rowsOf = (s: SheetSnapshot) => Object.keys(s.cellData).map(Number).sort((a, b) => a - b)

/** Первое значение в колонке col по строке, чья метка (A) начинается с key. */
function byLabel(s: SheetSnapshot, key: string, col: number): number | null {
  const k = key.toLowerCase()
  for (const r of rowsOf(s)) if (str(cell(s, r, 0)).toLowerCase().startsWith(k)) return parseNum(cell(s, r, col))
  return null
}
/** Сумма колонки col по всем строкам, чья метка начинается с key. */
function sumLabel(s: SheetSnapshot, key: string, col: number): number {
  const k = key.toLowerCase()
  let t = 0
  for (const r of rowsOf(s)) if (str(cell(s, r, 0)).toLowerCase().startsWith(k)) { const v = parseNum(cell(s, r, col)); if (v) t += v }
  return t
}

// ————— каналы привлечения (итог канала = сумма колонки B по под-блокам) —————
export interface ChannelInput { name: string; snapshot: SheetSnapshot }
interface ChTotals { name: string; budget: number; activations: number; subs: number }
const chTotals = (ch: ChannelInput): ChTotals => ({
  name: ch.name,
  budget: sumLabel(ch.snapshot, 'Бюджет потраченн', 1),
  activations: sumLabel(ch.snapshot, 'Активаци', 1),
  subs: sumLabel(ch.snapshot, 'Кол-во подписок', 1),
})
const barsFrom = (rows: { name: string; value: number }[]) => rows.filter((b) => b.value > 0).sort((a, b) => b.value - a.value)

export interface MarketingInput {
  channels: ChannelInput[]
  trafficAll?: SheetSnapshot
  seo?: SheetSnapshot
  seoEff?: SheetSnapshot
  baza?: SheetSnapshot
  posthog?: SheetSnapshot
}

export function buildMarketingSvodka(input: MarketingInput): Svodka {
  const { channels, trafficAll, seo, seoEff, baza, posthog } = input
  const ch = channels.map(chTotals).filter((c) => c.budget > 0 || c.activations > 0 || c.subs > 0)

  // ——— верхний уровень: итог запуска из «Трафик ALL» (факт в колонке C=2) ———
  const T = (name: string) => (trafficAll ? byLabel(trafficAll, name, 2) : null) ?? 0
  const kpis: Kpi[] = trafficAll ? [
    { id: 'k-budget', label: 'Бюджет', value: T('Бюджет потраченн'), format: 'money', deltaPct: null, note: 'освоено', higherBetter: false },
    { id: 'k-act', label: 'Активаций бота', value: T('Активаций бота'), format: 'number', deltaPct: null, note: 'всего' },
    { id: 'k-subs', label: 'Подписчиков', value: T('Подписчиков'), format: 'number', deltaPct: null, note: 'привлечено' },
    { id: 'k-reg', label: 'Регистраций', value: T('Рег'), format: 'number', deltaPct: null, note: 'на ЦД' },
    { id: 'k-pays', label: 'Оплат', value: T('Кол-во оплат'), format: 'number', deltaPct: null, note: 'продаж' },
    { id: 'k-rev', label: 'Выручка', value: T('Сумма оплат'), format: 'money', deltaPct: null, note: 'сумма оплат' },
    { id: 'k-romi', label: 'ROMI', value: round1(T('Romi') * 100) / 100, format: 'decimal', deltaPct: null, note: 'окупаемость (×)', higherBetter: true },
    { id: 'k-drr', label: 'ДРР', value: round1(T('ДРР') * 100), format: 'number', deltaPct: null, note: '% (доля расходов)', higherBetter: false },
  ] : []

  // ——— каналы: combo + breakdowns ———
  const byBudget = [...ch].sort((a, b) => b.budget - a.budget)
  const combo: Svodka['combo'] = {
    title: 'Бюджет и подписки по каналам',
    note: 'Бары — освоенный бюджет канала, линия — полученные подписки.',
    barLabel: 'Бюджет ₽', lineLabel: 'Подписки', barFormat: 'money', lineFormat: 'number',
    rows: byBudget.map((c) => ({ t: c.name, bar: Math.round(c.budget), line: c.subs })),
  }
  const cplBars = barsFrom(ch.filter((c) => c.subs > 0 && c.budget > 0).map((c) => ({ name: c.name, value: Math.round(c.budget / c.subs) }))).reverse()
  const breakdowns: Breakdown[] = [
    { id: 'b-budget', title: 'Бюджет по каналам', note: 'освоено, ₽', format: 'money' as const, color: 'series3' as const, bars: barsFrom(ch.map((c) => ({ name: c.name, value: Math.round(c.budget) }))) },
    { id: 'b-subs', title: 'Подписки по каналам', note: 'привлечено', format: 'number' as const, color: 'series2' as const, bars: barsFrom(ch.map((c) => ({ name: c.name, value: c.subs }))) },
    { id: 'b-cpl', title: 'Цена подписки по каналам', note: 'бюджет / подписки — меньше лучше', format: 'money' as const, color: 'series1' as const, bars: cplBars },
  ].filter((b) => b.bars.length > 0)

  const insights: Insight[] = []
  const topSubs = barsFrom(ch.map((c) => ({ name: c.name, value: c.subs })))[0]
  if (topSubs) insights.push({ id: 'i-subs', emoji: '🏆', label: 'Канал-лидер по подпискам', text: `«${topSubs.name}» — ${fmtInt(topSubs.value)} подписок.` })
  if (cplBars[0]) insights.push({ id: 'i-cpl', emoji: '💚', label: 'Самая дешёвая подписка', text: `«${cplBars[0].name}» — ${fmtRub(cplBars[0].value)} за подписку.` })

  // ——— разделы ———
  const sections: Section[] = []
  if (seo) sections.push(seoSection(seo, seoEff))
  if (baza) sections.push(bazaSection(baza))
  if (posthog) sections.push(productSection(posthog))

  const totBudget = ch.reduce((a, c) => a + c.budget, 0)
  return {
    period: 'запуск · май 2026',
    title: 'Сводная маркетинг — полная сводка',
    subtitle: `Итог запуска · каналы (${ch.map((c) => c.name).join(', ')})${seo ? ' · SEO' : ''}${baza ? ' · База' : ''}${posthog ? ' · Продукт' : ''}`,
    headline: [
      { label: 'Бюджет', value: T('Бюджет потраченн') || Math.round(totBudget), format: 'money' },
      { label: 'Активаций', value: T('Активаций бота'), format: 'number' },
      { label: 'Подписчиков', value: T('Подписчиков'), format: 'number' },
      { label: 'Выручка', value: T('Сумма оплат'), format: 'money' },
    ],
    kpis, goals: [], wasNow: [], areas: [], combo, breakdowns, insights, sections, missing: [],
  }
}

// SEO: итог (строка «Май …») + дневная динамика + топ статей
function seoSection(seo: SheetSnapshot, seoEff?: SheetSnapshot): Section {
  const rows = rowsOf(seo)
  const totalRow = rows.find((r) => /^(май|июн|апр|мар|фев|июл)/i.test(str(cell(seo, r, 0))))
  const imp = totalRow != null ? parseNum(cell(seo, totalRow, 1)) ?? 0 : 0
  const clicks = totalRow != null ? parseNum(cell(seo, totalRow, 2)) ?? 0 : 0
  const views = totalRow != null ? parseNum(cell(seo, totalRow, 3)) ?? 0 : 0
  const kpis: Kpi[] = [
    { id: 'seo-imp', label: 'Показов', value: imp, format: 'number', deltaPct: null, note: 'SEO-выдача' },
    { id: 'seo-clk', label: 'Кликов', value: clicks, format: 'number', deltaPct: null, note: 'переходов' },
    { id: 'seo-ctr', label: 'CTR', value: imp ? round1((clicks / imp) * 100) : 0, format: 'decimal', deltaPct: null, note: '%' },
    { id: 'seo-views', label: 'Просмотров', value: views, format: 'number', deltaPct: null, note: 'контента' },
  ]
  // дневная динамика кликов (строки под итоговой, колонка C)
  const startI = totalRow != null ? rows.indexOf(totalRow) + 1 : 0
  const daily = rows.slice(startI).map((r, i) => ({ t: `${i + 1}`, v: parseNum(cell(seo, r, 2)) ?? 0 })).filter((p) => p.v > 0)
  const areas = daily.length >= 3 ? [{ id: 'seo-daily', title: 'Клики по дням', note: 'динамика SEO-кликов', format: 'number' as const, color: 'series1' as const, points: daily }] : []
  // топ статей по просмотрам
  const breakdowns: Breakdown[] = []
  if (seoEff) {
    const arts = rowsOf(seoEff).slice(1)
      .map((r) => ({ name: str(cell(seoEff, r, 1)).slice(0, 34) || '—', value: parseNum(cell(seoEff, r, 3)) ?? 0 }))
      .filter((a) => a.value > 0).sort((a, b) => b.value - a.value).slice(0, 6)
    if (arts.length) breakdowns.push({ id: 'seo-top', title: 'Топ статей по просмотрам', note: 'из «Эффективность SEO»', format: 'number', color: 'series2', bars: arts })
  }
  return { id: 's-seo', title: '🔎 SEO', note: 'органический трафик и контент', kpis, areas, breakdowns }
}

// База: новые подписчики по источникам (первый блок «Всего новых»)
function bazaSection(baza: SheetSnapshot): Section {
  const maxCh = byLabel(baza, 'Макс канал', 1) ?? 0
  const tgCh = byLabel(baza, 'ТГ канал подписки', 1) ?? 0
  const total = byLabel(baza, 'Всего новых', 1) ?? maxCh + tgCh
  const kpis: Kpi[] = [
    { id: 'bz-total', label: 'Новых в базе', value: total, format: 'number', deltaPct: null, note: 'подписчиков' },
    { id: 'bz-max', label: 'Макс-канал', value: maxCh, format: 'number', deltaPct: null, note: 'подписок' },
    { id: 'bz-tg', label: 'ТГ-канал', value: tgCh, format: 'number', deltaPct: null, note: 'подписок' },
  ]
  const bars = barsFrom([{ name: 'ТГ канал', value: tgCh }, { name: 'Макс канал', value: maxCh }])
  const breakdowns: Breakdown[] = bars.length ? [{ id: 'bz-src', title: 'Новые подписчики по источникам', note: 'за период', format: 'number', color: 'series2', bars }] : []
  return { id: 's-baza', title: '👥 База подписчиков', note: 'приток в базу по источникам', kpis, breakdowns }
}

// Продукт (PostHog): ключ-значение из блока «СВОДКА»
function productSection(ph: SheetSnapshot): Section {
  const pick = (key: string) => byLabel(ph, key, 1) ?? 0
  const allKpis: Kpi[] = [
    { id: 'ph-events', label: 'Всего событий', value: pick('Всего событий'), format: 'number', deltaPct: null, note: 'PostHog' },
    { id: 'ph-users', label: 'Уникальных польз.', value: pick('Уникальных пользоват'), format: 'number', deltaPct: null, note: 'distinct_id' },
    { id: 'ph-views', label: 'Просмотры страниц', value: pick('Просмотры страниц'), format: 'number', deltaPct: null, note: 'pageviews' },
    { id: 'ph-clicks', label: 'Кликов', value: pick('Клики по элемент'), format: 'number', deltaPct: null, note: 'по сайту' },
    { id: 'ph-sessions', label: 'Записей сессий', value: pick('Записей сессий'), format: 'number', deltaPct: null, note: 'session replay' },
    { id: 'ph-exits', label: 'Уходов', value: pick('Уходов'), format: 'number', deltaPct: null, note: 'со страницы', higherBetter: false },
  ]
  return { id: 's-product', title: '📊 Продукт (PostHog)', note: 'поведение на сайте/лендинге', kpis: allKpis.filter((k) => k.value > 0) }
}
