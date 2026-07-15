'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { VIZ, fmtCompact, fmtValue } from '@/lib/viz'
import type { Widget, ValueFormat } from '@/lib/analytics/widgets'

interface SheetAnalytics {
  sheetId: string
  title: string
  status: 'ok' | 'needs_mapping' | 'empty'
  widgets: Widget[]
  truncated: number
}

export function AnalyticsTab({ tableId, sheetIds }: { tableId: string; sheetIds: string[] }) {
  const [sheets, setSheets] = useState<SheetAnalytics[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tables/${tableId}/analytics`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      setSheets(data.sheets)
      setLoadError(null)
    } catch (e) {
      // иначе вкладка навсегда зависает на «Считаем аналитику…»
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }, [tableId])

  useEffect(() => { load() }, [load])

  // live: изменения datasets (переимпорт) и table_sheets (новые/удалённые листы) → перезагрузка.
  // Отдельная подписка на table_sheets нужна: фильтр по sheet_id знает только листы,
  // существовавшие при открытии вкладки.
  useEffect(() => {
    const supabase = createBrowserSupabase()
    const reload = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(load, 500)
    }
    let channel = supabase
      .channel(`analytics-${tableId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_sheets', filter: `table_id=eq.${tableId}` },
        reload,
      )
    if (sheetIds.length) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'datasets', filter: `sheet_id=in.(${sheetIds.join(',')})` },
        reload,
      )
    }
    channel.subscribe()
    return () => {
      supabase.removeChannel(channel)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [tableId, sheetIds, load])

  if (loadError && !sheets) {
    return (
      <div className="mt-6 text-sm">
        <p className="text-[var(--negative)]">Не удалось загрузить аналитику: {loadError}</p>
        <button onClick={load} className="mt-2 rounded-lg border border-[var(--hairline)] px-3 py-1.5 hover:bg-[var(--surface-hover)]">
          Повторить
        </button>
      </div>
    )
  }
  if (!sheets) return <p className="mt-6 text-sm text-[var(--ink-muted)]">Считаем аналитику…</p>
  if (!sheets.length) return <p className="mt-6 text-sm text-[var(--ink-muted)]">Нет данных.</p>

  const sheet = sheets[Math.min(active, sheets.length - 1)]
  return (
    <div className="mt-4">
      {sheets.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {sheets.map((s, i) => (
            <button
              key={s.sheetId} onClick={() => setActive(i)}
              className={`rounded-full border px-3 py-1 text-sm ${i === active
                ? 'border-[var(--brand)] text-[var(--brand)]'
                : 'border-[var(--hairline)] text-[var(--ink-secondary)]'}`}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
      <SheetWidgets sheet={sheet} />
    </div>
  )
}

function Notice({ text }: { text: string }) {
  return <p className="mt-6 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 text-sm text-[var(--ink-secondary)]">{text}</p>
}

function SheetWidgets({ sheet }: { sheet: SheetAnalytics }) {
  if (sheet.status === 'needs_mapping') return <Notice text="Не удалось автоматически распознать структуру листа. Ручная разметка появится в фазе 3." />
  if (sheet.status === 'empty') return <Notice text="Лист пустой — аналитики нет." />
  const kpis = sheet.widgets.filter((w) => w.kind === 'kpi' || w.kind === 'rowcount')
  const charts = sheet.widgets.filter((w) => w.kind === 'timeseries' || w.kind === 'breakdown' || w.kind === 'slice')
  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((w) => <KpiCard key={w.id} w={w} />)}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {charts.map((w) => <ChartCard key={w.id} w={w} />)}
      </div>
      {sheet.truncated > 0 && <p className="mt-3 text-xs text-[var(--ink-muted)]">Показаны не все виджеты: скрыто {sheet.truncated}.</p>}
    </div>
  )
}

function KpiCard({ w }: { w: Widget }) {
  if (w.kind === 'rowcount') {
    return (
      <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
        <div className="text-xs text-[var(--ink-secondary)]">{w.title}</div>
        <div className="mt-1 text-2xl font-semibold">{fmtValue(w.count, 'number')}</div>
      </div>
    )
  }
  if (w.kind !== 'kpi') return null
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <div className="text-xs text-[var(--ink-secondary)]">{w.title} — сумма</div>
      <div className="mt-1 text-2xl font-semibold">{fmtValue(w.stats.sum, w.format)}</div>
      <div className="mt-1 text-xs text-[var(--ink-muted)]">
        сред. {fmtValue(w.stats.avg, w.format)} · мед. {fmtValue(w.stats.median, w.format)} · мин {fmtValue(w.stats.min, w.format)} · макс {fmtValue(w.stats.max, w.format)}
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label, format }: {
  active?: boolean; payload?: { value: number }[]; label?: string; format: ValueFormat
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2 text-xs shadow-sm">
      <div className="text-[var(--ink-secondary)]">{label}</div>
      <div className="font-medium">{fmtValue(payload[0].value, format)}</div>
    </div>
  )
}

function ChartCard({ w }: { w: Widget }) {
  if (w.kind === 'timeseries') {
    return (
      <figure className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
        <figcaption className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">{w.title}</span>
          {w.growthPct !== null && (
            <span className="text-xs" style={{ color: w.growthPct >= 0 ? VIZ.goodText : VIZ.negative }}>
              {w.growthPct >= 0 ? '↑' : '↓'} {Math.abs(w.growthPct).toLocaleString('ru-RU')}% к пред. периоду
            </span>
          )}
        </figcaption>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={w.points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={VIZ.grid} vertical={false} />
              <XAxis dataKey="t" tick={{ fill: VIZ.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: VIZ.axis }} minTickGap={24} />
              <YAxis tick={{ fill: VIZ.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={fmtCompact} />
              <Tooltip content={<ChartTooltip format={w.format} />} />
              <Line type="monotone" dataKey="v" stroke={VIZ.series1} strokeWidth={2} dot={{ r: 2.5, fill: VIZ.series1 }} activeDot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
    )
  }
  if (w.kind !== 'breakdown' && w.kind !== 'slice') return null
  const isBreakdown = w.kind === 'breakdown'
  const data = isBreakdown
    ? w.items.map((i) => ({ name: i.name, value: i.count }))
    : w.items.map((i) => ({ name: i.name, value: i.value }))
  const format: 'number' | 'money' | 'percent' = isBreakdown ? 'number' : w.format
  return (
    <figure className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <figcaption className="text-sm font-medium">{w.title}</figcaption>
      <div className="mt-3" style={{ height: Math.max(120, data.length * 30 + 30) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 8 }} barCategoryGap={4}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={120} tick={{ fill: VIZ.inkSecondary, fontSize: 12 }} tickLine={false} axisLine={{ stroke: VIZ.axis }} />
            <Tooltip content={<ChartTooltip format={format} />} />
            <Bar dataKey="value" fill={isBreakdown ? VIZ.series2 : VIZ.series1} radius={[0, 4, 4, 0]} barSize={14}>
              <LabelList dataKey="value" position="right" style={{ fill: VIZ.inkSecondary, fontSize: 11 }} formatter={(v) => fmtCompact(Number(v))} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
