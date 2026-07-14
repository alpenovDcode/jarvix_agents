import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { groupTables, type CatalogTable } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

const STATUS: Record<CatalogTable['import_status'], { text: string; cls: string }> = {
  ok: { text: 'импортирована', cls: 'bg-[#eaf3ea] text-[#006300]' },
  pending: { text: 'ждёт импорта', cls: 'bg-[#f0efec] text-[var(--ink-secondary)]' },
  error: { text: 'ошибка импорта', cls: 'bg-[#fdeaea] text-[#d03b3b]' },
}

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireUser()
  const { q = '' } = await searchParams
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('tables')
    .select('id, title, folder, import_status, last_imported_at, table_sheets(count)')
  const rows: CatalogTable[] = (data ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    folder: t.folder as string,
    import_status: t.import_status as CatalogTable['import_status'],
    last_imported_at: t.last_imported_at as string | null,
    sheet_count: (t.table_sheets as unknown as { count: number }[])?.[0]?.count ?? 0,
  }))
  const groups = groupTables(rows, q)

  return (
    <>
      <Header session={session} />
      <main className="mx-auto max-w-6xl p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Таблицы отдела</h1>
          <form method="GET" className="w-72">
            <input
              type="search" name="q" defaultValue={q} placeholder="Поиск по названию или папке…"
              className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[#2a78d6]"
            />
          </form>
        </div>

        {groups.length === 0 && (
          <p className="mt-10 text-center text-sm text-[var(--ink-muted)]">
            {q ? 'Ничего не найдено.' : 'Таблиц пока нет — запустите импорт в админке.'}
          </p>
        )}

        {groups.map((g) => (
          <section key={g.folder} className="mt-8">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--ink-muted)]">{g.folder}</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.tables.map((t) => (
                <Link
                  key={t.id} href={`/tables/${t.id}`}
                  className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 transition-shadow hover:shadow-sm"
                >
                  <div className="font-medium">{t.title}</div>
                  <div className="mt-2 flex items-center justify-between text-xs text-[var(--ink-secondary)]">
                    <span>{t.sheet_count} лист.</span>
                    <span className={`rounded-full px-2 py-0.5 ${STATUS[t.import_status].cls}`}>{STATUS[t.import_status].text}</span>
                  </div>
                  {t.last_imported_at && (
                    <div className="mt-1 text-xs text-[var(--ink-muted)]">обновлено {fmtDate(t.last_imported_at)}</div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  )
}
