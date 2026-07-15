'use client'
import Link from 'next/link'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { VIZ_DARK, fmtCompact, fmtDecimal, fmtDeltaPct, fmtInt, fmtRub, deltaStatus, goalStatus } from '@/lib/viz'
import type { AreaSeries, Breakdown, ComboData, Goal, Insight, Kpi, Section, Svodka, ValueFormat, WasNowRow } from '@/lib/svodka/aggregate'

const V = VIZ_DARK
const fmt = (v: number, f: ValueFormat) => (f === 'money' ? fmtRub(v) : f === 'decimal' ? fmtDecimal(v) : fmtInt(v))
const STATUS: Record<'good' | 'warning' | 'critical', string> = { good: V.good, warning: V.warning, critical: V.critical }

// Разделы будущего дашборда отдела. Активна только «Сводка»; остальные — заглушки
// (наполняются по мере автоматизации: Контент, Продажи, Воронка… — каждый свой набор метрик).
export const DEPT_TABS = ['Сводка', 'Контент', 'Платформы', 'Рассылки', 'Воронка', 'База', 'Продажи', 'Клиенты', 'Связи', 'Смыслы', 'Итоги']

function Nav({ tabs, backHref, backLabel }: { tabs?: string[]; backHref: string; backLabel: string }) {
  return (
    <div className="mb-6 flex items-center justify-between border-b pb-4" style={{ borderColor: V.hairline }}>
      <div className="flex flex-wrap items-center gap-1.5">
        {(tabs ?? []).map((t, i) => (
          <span
            key={t}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={i === 0
              ? { background: V.criticalSoft, color: V.inkPrimary, border: `1px solid ${V.critical}` }
              : { color: V.inkMuted }}
          >
            {t}
          </span>
        ))}
      </div>
      <Link href={backHref} className="shrink-0 text-sm underline" style={{ color: V.series1 }}>← {backLabel}</Link>
    </div>
  )
}

export function SvodkaView({ data, tabs, backHref = '/', backLabel = 'Каталог' }: {
  data: Svodka; tabs?: string[]; backHref?: string; backLabel?: string
}) {
  return (
    // data-page-theme: body красится через CSS :has в globals.css (без JS и flash)
    <div data-page-theme="dark" style={{ background: V.page, color: V.inkPrimary, fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }} className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <Nav tabs={tabs} backHref={backHref} backLabel={backLabel} />
        {data.missing.length > 0 && (
          <div className="mb-4 rounded-lg border p-3 text-sm" style={{ borderColor: V.warning, background: V.warningSoft, color: V.inkPrimary }}>
            ⚠ В источниках не найдены колонки: {data.missing.join(', ')} — связанные метрики показывают нули.
          </div>
        )}
        <Hero data={data} />
        <SectionLabel>Ключевые метрики</SectionLabel>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.kpis.map((k) => <KpiCard key={k.id} k={k} />)}
        </div>
        {(data.goals.length > 0 || data.wasNow.length > 0) && (
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.goals.length > 0 && (
              <Panel title="Прогресс к целям (план / факт)" note="Факт против плана за период. Цвет — статус достижения.">
                <div className="mt-4 space-y-4">{data.goals.map((g) => <GoalBar key={g.id} g={g} />)}</div>
              </Panel>
            )}
            {data.wasNow.length > 0 && (
              <Panel title="Было → Стало" note="Начало периода против конца.">
                <div className="mt-4 divide-y" style={{ borderColor: V.hairline }}>
                  {data.wasNow.map((r) => <WasNowRowView key={r.id} r={r} />)}
                </div>
              </Panel>
            )}
          </div>
        )}
        {data.areas.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.areas.map((a) => <AreaCard key={a.id} a={a} />)}
          </div>
        )}
        <div className="mt-4">
          <ComboCard combo={data.combo} />
        </div>
        {data.breakdowns && data.breakdowns.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.breakdowns.map((b) => <BreakdownCard key={b.id} b={b} />)}
          </div>
        )}
        <SectionLabel className="mt-8">Что сработало — автовыводы</SectionLabel>
        <div className="mt-3 space-y-2">{data.insights.map((i) => <InsightRow key={i.id} i={i} />)}</div>
        {data.sections?.map((s) => <SectionBlock key={s.id} s={s} />)}
      </div>
    </div>
  )
}

function SectionBlock({ s }: { s: Section }) {
  return (
    <div className="mt-10 border-t pt-8" style={{ borderColor: V.hairline }}>
      <h2 className="text-lg font-bold">{s.title}</h2>
      {s.note && <p className="mt-1 text-xs italic" style={{ color: V.inkMuted }}>{s.note}</p>}
      {s.kpis && s.kpis.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{s.kpis.map((k) => <KpiCard key={k.id} k={k} />)}</div>
      )}
      {s.breakdowns && s.breakdowns.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">{s.breakdowns.map((b) => <BreakdownCard key={b.id} b={b} />)}</div>
      )}
      {s.areas && s.areas.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">{s.areas.map((a) => <AreaCard key={a.id} a={a} />)}</div>
      )}
      {s.insights && s.insights.length > 0 && (
        <div className="mt-3 space-y-2">{s.insights.map((i) => <InsightRow key={i.id} i={i} />)}</div>
      )}
    </div>
  )
}

function Hero({ data }: { data: Svodka }) {
  return (
    <div className="rounded-2xl border p-6" style={{ borderColor: V.hairline, background: `linear-gradient(135deg, ${V.surfaceRaised}, ${V.surface})` }}>
      <h1 className="text-2xl font-bold">{data.title}</h1>
      <p className="mt-1 text-sm" style={{ color: V.inkSecondary }}>{data.subtitle}</p>
      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        {data.headline.map((s, i) => <HeroStat key={i} label={s.label} value={fmt(s.value, s.format)} />)}
      </div>
    </div>
  )
}
function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-semibold" style={{ color: V.series2 }}>{value}</span>
      <span className="ml-2" style={{ color: V.inkMuted }}>{label}</span>
    </div>
  )
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-xs font-semibold uppercase tracking-widest ${className}`} style={{ color: V.inkMuted }}>{children}</h2>
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-5" style={{ borderColor: V.hairline, background: V.surface }}>
      <h3 className="font-semibold">{title}</h3>
      {note && <p className="mt-1 text-xs italic" style={{ color: V.inkMuted }}>{note}</p>}
      {children}
    </section>
  )
}

function KpiCard({ k }: { k: Kpi }) {
  const st = deltaStatus(k.deltaPct, k.higherBetter ?? true)
  const topColor = k.deltaPct === null ? V.hairline : STATUS[st]
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: V.hairline, background: V.surface, borderTop: `3px solid ${topColor}` }}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: V.inkMuted }}>{k.label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums">{fmt(k.value, k.format)}</div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
        {k.deltaPct !== null
          ? <span className="font-medium" style={{ color: STATUS[st] }}>{fmtDeltaPct(k.deltaPct)}</span>
          : <span style={{ color: V.inkMuted }}>—</span>}
        <span style={{ color: V.inkMuted }}>{k.note}</span>
      </div>
    </div>
  )
}

function GoalBar({ g }: { g: Goal }) {
  const pct = g.target > 0 ? Math.round((g.value / g.target) * 100) : 0
  const color = STATUS[goalStatus(pct)]
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span>{g.label}</span>
        <span className="tabular-nums" style={{ color: V.inkSecondary }}>
          <b style={{ color: V.inkPrimary }}>{fmt(g.value, g.format)}</b> / {fmt(g.target, g.format)} · {pct}%
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: V.hairline }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
    </div>
  )
}

function WasNowRowView({ r }: { r: WasNowRow }) {
  const st = deltaStatus(r.deltaPct)
  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <span style={{ color: V.inkSecondary }}>{r.label}</span>
      <span className="flex items-center gap-3 tabular-nums">
        <span style={{ color: V.inkMuted }}>{fmt(r.from, r.format)}</span>
        <span style={{ color: V.inkMuted }}>→</span>
        <b>{fmt(r.to, r.format)}</b>
        <span className="font-medium" style={{ color: STATUS[st] }}>{fmtDeltaPct(r.deltaPct)}</span>
      </span>
    </div>
  )
}

function ChartTip({ active, payload, label, format }: {
  active?: boolean; payload?: { value: number; name?: string; color?: string }[]; label?: string; format: ValueFormat
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: V.surfaceRaised, borderColor: V.hairline, color: V.inkPrimary }}>
      <div style={{ color: V.inkMuted }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="font-medium" style={{ color: p.color ?? V.inkPrimary }}>{fmt(p.value, format)}</div>
      ))}
    </div>
  )
}

function AreaCard({ a }: { a: AreaSeries }) {
  const color = a.color === 'series1' ? V.series1 : a.color === 'series2' ? V.series2 : V.series3
  return (
    <Panel title={a.title} note={a.note}>
      <div className="mt-3 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={a.points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${a.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={V.grid} vertical={false} />
            <XAxis dataKey="t" tick={{ fill: V.inkMuted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: V.axis }} minTickGap={16} />
            <YAxis tick={{ fill: V.inkMuted, fontSize: 11 }} tickLine={false} axisLine={false} width={52} tickFormatter={fmtCompact} />
            <Tooltip content={<ChartTip format={a.format} />} />
            <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#grad-${a.id})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

function ComboCard({ combo }: { combo: ComboData }) {
  return (
    <Panel title={combo.title} note={combo.note}>
      <div className="mt-2 flex items-center gap-4 text-xs" style={{ color: V.inkSecondary }}>
        <LegendDot color={V.series1} label={combo.barLabel} />
        <LegendDot color={V.series3} label={combo.lineLabel} />
      </div>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={combo.rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={V.grid} vertical={false} />
            <XAxis dataKey="t" tick={{ fill: V.inkMuted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: V.axis }} />
            <YAxis yAxisId="l" tick={{ fill: V.inkMuted, fontSize: 11 }} tickLine={false} axisLine={false} width={40} tickFormatter={fmtCompact} />
            <YAxis yAxisId="r" orientation="right" tick={{ fill: V.inkMuted, fontSize: 11 }} tickLine={false} axisLine={false} width={40} tickFormatter={fmtCompact} />
            <Tooltip content={<ChartTip format="number" />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar yAxisId="l" dataKey="bar" fill={V.series1} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
            <Line yAxisId="r" type="monotone" dataKey="line" stroke={V.series3} strokeWidth={2.5} dot={{ r: 3, fill: V.series3 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}
function LegendDot({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />{label}</span>
}

function BreakdownCard({ b }: { b: Breakdown }) {
  const color = b.color === 'series1' ? V.series1 : b.color === 'series2' ? V.series2 : V.series3
  return (
    <Panel title={b.title} note={b.note}>
      <div className="mt-3" style={{ height: Math.max(140, b.bars.length * 46) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={b.bars} layout="vertical" margin={{ top: 0, right: 52, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={V.grid} horizontal={false} />
            <XAxis type="number" tick={{ fill: V.inkMuted, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtCompact} />
            <YAxis type="category" dataKey="name" tick={{ fill: V.inkSecondary, fontSize: 12 }} tickLine={false} axisLine={false} width={104} />
            <Tooltip content={<ChartTip format={b.format} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={30} isAnimationActive={false}>
              <LabelList dataKey="value" position="right" formatter={(v) => fmt(Number(v), b.format)} style={{ fill: V.inkSecondary, fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  )
}

function InsightRow({ i }: { i: Insight }) {
  return (
    <div className="rounded-lg border p-3 pl-4 text-sm" style={{ borderColor: V.hairline, background: V.surface, borderLeft: `3px solid ${V.series2}` }}>
      <span className="mr-2">{i.emoji}</span>
      <b>{i.label}:</b>{' '}
      <span style={{ color: V.inkSecondary }}>{i.text}</span>
    </div>
  )
}
