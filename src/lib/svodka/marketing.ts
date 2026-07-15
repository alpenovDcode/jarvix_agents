import { round1 } from '@/lib/analytics/widgets'
import { fmtInt, fmtRub } from '@/lib/viz'
import type { SheetSnapshot } from '@/lib/types'
import type { Insight, Kpi, Svodka, ValueFormat, WasNowRow } from '@/lib/svodka/aggregate'

// Кураторская сводка по книге «Сводная маркетинг»: ядро — лист «Итог Марафон»,
// где два блока-периода (МАЙ АВТО / ИЮНЬ АВТО) с одинаковым набором метрик запуска.
// Отдельные листы-каналы (РСЯ, Цой, Все ЛМ) — шаблоны на будущее, в основном пустые,
// поэтому берём заполненный сводный лист. Метрики матчатся по названию внутри блока.
// Колонки: A=метка(0) · B=План(1) · C=Факт(2) · D+=дни.

const cell = (s: SheetSnapshot, r: number, c: number): unknown => s.cellData[r]?.[c]?.v
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

interface Block { label: string; start: number; end: number }

/** Границы блоков-периодов: строки-заголовки со словом «АВТО» в колонке A. */
function parseBlocks(s: SheetSnapshot): Block[] {
  const rows = Object.keys(s.cellData).map(Number).sort((a, b) => a - b)
  const heads = rows.filter((r) => /авто/i.test(str(cell(s, r, 0))))
  return heads.map((start, i) => ({
    label: str(cell(s, start, 0)).replace(/\s*авто/i, '').trim(),
    start,
    end: (heads[i + 1] ?? rows[rows.length - 1] + 1) - 1,
  }))
}

function metric(s: SheetSnapshot, block: Block, name: string): number | null {
  const key = name.toLowerCase()
  for (let r = block.start; r <= block.end; r++) {
    if (str(cell(s, r, 0)).toLowerCase().startsWith(key)) return num(cell(s, r, 2))
  }
  return null
}

interface MetricDef { name: string; label: string; format: ValueFormat; higherBetter: boolean }
const KPI_METRICS: MetricDef[] = [
  { name: 'Активаций бота', label: 'Активаций бота', format: 'number', higherBetter: true },
  { name: 'Кол-во рег', label: 'Регистраций', format: 'number', higherBetter: true },
  { name: 'Кол-во оплат', label: 'Оплат', format: 'number', higherBetter: true },
  { name: 'Сумма оплат', label: 'Сумма оплат', format: 'money', higherBetter: true },
  { name: 'Цена реги', label: 'Цена реги', format: 'money', higherBetter: false },
  { name: 'Romi', label: 'ROMI', format: 'number', higherBetter: true },
]
// воронка запуска: этап → кол-во
const FUNNEL: { name: string; label: string }[] = [
  { name: 'Активаций бота', label: 'Активации' },
  { name: 'Кол-во рег', label: 'Регистрации' },
  { name: 'Кол-во чекинов 1', label: 'Чекин 1' },
  { name: 'Кол-во АП', label: 'АП' },
  { name: 'Кол-во оплат', label: 'Оплаты' },
]

export function buildMarketingSvodka(itog: SheetSnapshot): Svodka {
  const blocks = parseBlocks(itog)
  const may = blocks[0]
  const jun = blocks[1]
  if (!may) throw new Error('Итог Марафон: блок периода не найден')

  const kpis: Kpi[] = KPI_METRICS.map((m) => {
    const cur = metric(itog, may, m.name) ?? 0
    const next = jun ? metric(itog, jun, m.name) : null
    // дельта: следующий период (июнь) к текущему (май)
    const deltaPct = next != null && cur !== 0 ? round1(((next - cur) / cur) * 100) : null
    return { id: `k-${m.name}`, label: m.label, value: cur, format: m.format, deltaPct, note: jun ? `${jun.label}: ${m.format === 'money' ? fmtRub(next ?? 0) : fmtInt(next ?? 0)}` : '', higherBetter: m.higherBetter }
  })

  // воронка (combo): бар — кол-во на этапе, линия — % от активаций
  const base = metric(itog, may, 'Активаций бота') ?? 0
  const funnelRows = FUNNEL.map((f) => {
    const v = metric(itog, may, f.name) ?? 0
    return { t: f.label, bar: v, line: base ? round1((v / base) * 100) : 0 }
  })
  const combo: Svodka['combo'] = {
    title: `Воронка запуска (${may.label})`,
    note: 'Бары — количество на этапе, линия — конверсия от активаций (%). Сужение воронки от активации к оплате.',
    barLabel: 'Количество', lineLabel: '% от активаций', barFormat: 'number', lineFormat: 'number',
    rows: funnelRows,
  }

  // май → июнь
  const wasNow: WasNowRow[] = jun ? (['Активаций бота', 'Кол-во рег', 'Сумма оплат', 'Romi'] as const).map((name) => {
    const def = [...KPI_METRICS].find((m) => m.name === name)!
    const a = metric(itog, may, name) ?? 0
    const b = metric(itog, jun, name) ?? 0
    return { id: `wn-${name}`, label: def.label, from: a, to: b, deltaPct: a ? round1(((b - a) / a) * 100) : 0, format: def.format }
  }) : []

  // дневная динамика активаций за май (строка «Активаций бота», колонки-дни D+)
  const dailyRow = findRow(itog, may, 'Активаций бота')
  const areas: Svodka['areas'] = []
  if (dailyRow != null) {
    const pts: { t: string; v: number }[] = []
    for (let c = 3; c < 40; c++) {
      const d = cell(itog, may.start + 1, c) // строка дат в блоке (заголовок периода+1)
      const v = num(cell(itog, dailyRow, c))
      if (v != null) pts.push({ t: dayLabel(d), v })
    }
    if (pts.length >= 3) areas.push({ id: 'a-daily', title: `Активации по дням (${may.label})`, note: 'дневная динамика активаций бота', format: 'number', color: 'series1', points: pts })
  }

  const conv = round1(((metric(itog, may, 'Кол-во рег') ?? 0) / (base || 1)) * 100)
  const romiMay = metric(itog, may, 'Romi')
  const romiJun = jun ? metric(itog, jun, 'Romi') : null
  const insights: Insight[] = [
    { id: 'i-conv', emoji: '🔻', label: 'Конверсия активация→регистрация', text: `${conv}% (${fmtInt(metric(itog, may, 'Кол-во рег') ?? 0)} рег из ${fmtInt(base)} активаций).` },
    romiMay != null && { id: 'i-romi', emoji: romiMay >= 1 ? '✅' : '⚠️', label: `ROMI ${may.label}`, text: `${romiMay.toFixed(2)}${romiJun != null ? ` → ${romiJun.toFixed(2)} (${jun!.label})` : ''} — ${romiMay >= 1 ? 'окупаемость положительная' : 'ниже единицы'}.` },
    { id: 'i-pay', emoji: '💰', label: 'Оплаты и выручка', text: `${fmtInt(metric(itog, may, 'Кол-во оплат') ?? 0)} оплат на ${fmtRub(metric(itog, may, 'Сумма оплат') ?? 0)} (${may.label}).` },
  ].filter(Boolean) as Insight[]

  return {
    period: blocks.map((b) => b.label).join(' · '),
    title: 'Сводная маркетинг — запуск марафона',
    subtitle: `Итог запуска по листу «Итог Марафон» · ${blocks.map((b) => b.label).join(' vs ')} · воронка и юнит-экономика`,
    headline: [
      { label: `Активаций (${may.label})`, value: base, format: 'number' },
      { label: 'Регистраций', value: metric(itog, may, 'Кол-во рег') ?? 0, format: 'number' },
      { label: 'Сумма оплат', value: metric(itog, may, 'Сумма оплат') ?? 0, format: 'money' },
      { label: 'ROMI', value: romiMay ?? 0, format: 'number' },
    ],
    kpis, goals: [], wasNow, areas, combo, insights, missing: [],
  }
}

function findRow(s: SheetSnapshot, block: Block, name: string): number | null {
  const key = name.toLowerCase()
  for (let r = block.start; r <= block.end; r++) {
    if (str(cell(s, r, 0)).toLowerCase().startsWith(key)) return r
  }
  return null
}
function dayLabel(d: unknown): string {
  const s = str(d)
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(s)
  return m ? `${m[2]}.${m[1]}` : s || '·'
}
