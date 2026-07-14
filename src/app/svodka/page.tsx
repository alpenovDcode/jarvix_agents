import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildSvodka } from '@/lib/svodka/aggregate'
import type { OkDataset } from '@/lib/analytics/widgets'
import { SvodkaView } from './SvodkaView'

export const dynamic = 'force-dynamic'

async function loadDataset(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  gsid: string,
): Promise<OkDataset | null> {
  const { data: table } = await supabase.from('tables').select('id').eq('google_spreadsheet_id', gsid).maybeSingle()
  if (!table) return null
  const { data: sheet } = await supabase
    .from('table_sheets').select('id').eq('table_id', table.id).order('sheet_index').limit(1).maybeSingle()
  if (!sheet) return null
  const { data: d } = await supabase.from('datasets').select('*').eq('sheet_id', sheet.id).maybeSingle()
  if (!d || d.status !== 'ok') return null
  return {
    status: 'ok', headerRow: d.header_row, confidence: d.confidence,
    range: { startCol: d.start_col, endCol: d.end_col, endRow: d.end_row },
    columns: d.columns, rows: d.rows,
  }
}

function Missing() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0b0c] text-center text-white">
      <div>
        <h1 className="text-lg font-semibold">Нет демо-данных для сводки</h1>
        <p className="mt-2 text-sm text-white/60">Запустите <code>npm run seed:demo</code> — нужны таблицы demo-ads, demo-funnel, demo-content.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-[#3987e5] underline">← В каталог</Link>
      </div>
    </main>
  )
}

export default async function SvodkaPage() {
  await requireUser()
  const supabase = await createServerSupabase()
  const [ads, funnel, content] = await Promise.all([
    loadDataset(supabase, 'demo-ads'),
    loadDataset(supabase, 'demo-funnel'),
    loadDataset(supabase, 'demo-content'),
  ])
  if (!ads || !funnel || !content) return <Missing />
  const data = buildSvodka({ ads, funnel, content })
  return <SvodkaView data={data} />
}
