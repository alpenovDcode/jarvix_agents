'use client'
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { ReportTab } from './ReportTab'
import { AnalyticsTab } from './AnalyticsTab'
import { assembleWorkbookData, type SheetRowInput } from '@/lib/workbook'
import type { TableImportReport } from '@/lib/types'

const UniverViewer = dynamic(() => import('./UniverViewer'), {
  ssr: false,
  loading: () => <p className="mt-6 text-sm text-[var(--ink-muted)]">Загрузка таблицы…</p>,
})

const TABS = ['Таблица', 'Аналитика', 'Отчёт импорта'] as const

export function TableTabs({ table, sheets }: {
  table: { id: string; title: string; import_report: TableImportReport | null }
  sheets: (SheetRowInput & { id: string })[]
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Таблица')
  const [editable, setEditable] = useState(false)
  // стабильные ссылки: свежий объект в пропе каждый рендер пересоздавал бы
  // Univer (эффект по [data]) и Realtime-канал аналитики (эффект по [sheetIds])
  const workbookData = useMemo(() => assembleWorkbookData(table.id, table.title, sheets), [table.id, table.title, sheets])
  const sheetIds = useMemo(() => sheets.map((s) => s.id), [sheets])
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between border-b border-[var(--hairline)]">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm ${tab === t
                ? 'border-b-2 border-[var(--brand)] font-medium text-[var(--ink)]'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink)]'}`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === 'Таблица' && (
          <button
            onClick={() => setEditable((v) => !v)}
            className={`mb-1 rounded-lg px-3 py-1.5 text-sm ${editable
              ? 'bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)]'
              : 'border border-[var(--hairline)] text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)]'}`}
          >
            {editable ? 'Готово' : '✏️ Редактировать'}
          </button>
        )}
      </div>
      {tab === 'Таблица' && <UniverViewer data={workbookData} tableId={table.id} editable={editable} />}
      {tab === 'Аналитика' && <AnalyticsTab tableId={table.id} sheetIds={sheetIds} />}
      {tab === 'Отчёт импорта' && <ReportTab report={table.import_report} />}
    </div>
  )
}
