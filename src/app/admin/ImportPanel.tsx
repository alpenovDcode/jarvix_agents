'use client'
import { useState } from 'react'

export function ImportPanel() {
  const [progress, setProgress] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ table: string; message: string }[]>([])
  const [running, setRunning] = useState(false)

  const run = async (retryErrors: boolean) => {
    setRunning(true)
    setErrors([])
    setProgress('Синхронизация каталога с Google Drive…')
    let done = 0
    try {
      // retryErrors шлём на КАЖДОМ батче: очередь ошибок не влезает в один 45с-бюджет,
      // а после попытки у таблицы обновляется last_imported_at и без флага она выпадает.
      // Стоп, когда remaining перестал уменьшаться — остались только стабильно падающие.
      let lastRemaining = Infinity
      for (let i = 0; i < 100; i++) { // предохранитель от бесконечного цикла
        const res = await fetch('/api/admin/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sync: i === 0, retryErrors }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? res.statusText)
        const data = await res.json() as { imported: number; remaining: number; errors: { table: string; message: string }[] }
        done += data.imported
        setErrors((prev) => [...prev, ...data.errors])
        setProgress(`Обработано таблиц: ${done}, осталось: ${data.remaining}`)
        if (data.remaining === 0 || data.remaining >= lastRemaining) break
        lastRemaining = data.remaining
      }
      setProgress((p) => `${p} — готово ✓`)
    } catch (e) {
      setProgress(`Ошибка: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <h2 className="font-medium">Импорт из Google Sheets</h2>
      <p className="mt-1 text-sm text-[var(--ink-secondary)]">
        Забирает все таблицы из папки отдела. Дальше обновление идёт автоматически каждые 5 минут.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => run(false)} disabled={running}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50"
        >
          {running ? 'Импортируем…' : 'Импортировать всё'}
        </button>
        <button
          onClick={() => run(true)} disabled={running}
          className="rounded-lg border border-[var(--hairline)] px-4 py-2 text-sm hover:bg-[var(--surface-hover)] disabled:opacity-50"
        >
          Повторить таблицы с ошибками
        </button>
      </div>
      {progress && <p className="mt-3 text-sm text-[var(--ink-secondary)]">{progress}</p>}
      {errors.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-[var(--negative)]">
          {errors.map((e, i) => <li key={i}><b>{e.table}</b>: {e.message}</li>)}
        </ul>
      )}
    </section>
  )
}
