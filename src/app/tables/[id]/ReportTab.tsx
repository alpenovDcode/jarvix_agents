import type { TableImportReport } from '@/lib/types'

export function ReportTab({ report }: { report: TableImportReport | null }) {
  if (!report) return <p className="mt-6 text-sm text-[var(--ink-muted)]">Отчёта пока нет — таблица ещё не импортирована.</p>
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm">
        Статус: <b>{report.status === 'clean' ? 'перенесено без потерь' : 'есть замечания'}</b> ·
        ячеек {report.totalCells} · формул {report.totalFormulas} · заморожено {report.totalFrozen}
      </p>
      {report.sheets.map((s) => (
        <div key={s.sheetTitle} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
          <div className="font-medium">{s.sheetTitle}</div>
          <div className="mt-1 text-sm text-[var(--ink-secondary)]">ячеек {s.cellCount}, формул {s.formulaCount}</div>
          {s.frozenFormulas.length > 0 && (
            <div className="mt-2 text-sm">
              <div className="text-[var(--ink-secondary)]">Замороженные формулы (значение сохранено, формула отключена):</div>
              <ul className="mt-1 list-inside list-disc text-[var(--ink-secondary)]">
                {s.frozenFormulas.slice(0, 20).map((f) => (
                  <li key={f.a1}><b>{f.a1}</b>: {f.fn}</li>
                ))}
                {s.frozenFormulas.length > 20 && <li>и ещё {s.frozenFormulas.length - 20}…</li>}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
