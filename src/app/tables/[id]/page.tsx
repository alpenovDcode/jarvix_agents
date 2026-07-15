import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { TableTabs } from './TableTabs'
import type { SheetRowInput } from '@/lib/workbook'

export const dynamic = 'force-dynamic'

export default async function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser()
  const { id } = await params
  const supabase = await createServerSupabase()
  // оба запроса зависят только от id — параллелим, это самый горячий роут
  const [{ data: table }, { data: sheets }] = await Promise.all([
    supabase
      .from('tables')
      .select('id, title, folder, import_status, import_report, last_imported_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('table_sheets')
      .select('id, google_sheet_id, title, sheet_index, snapshot')
      .eq('table_id', id)
      .order('sheet_index'),
  ])
  if (!table) notFound()

  return (
    <>
      <Header session={session} />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-xl font-semibold">{table.title}</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">{table.folder}</p>
        <TableTabs table={table} sheets={(sheets ?? []) as (SheetRowInput & { id: string })[]} />
      </main>
    </>
  )
}
