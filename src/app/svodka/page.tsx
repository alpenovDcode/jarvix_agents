import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildSvodka } from '@/lib/svodka/aggregate'
import { okDatasetFromRow, type DatasetDbRow } from '@/lib/dataset/fromRow'
import { DEMO_ADS, DEMO_CONTENT, DEMO_FUNNEL } from '@/lib/demo'
import { VIZ_DARK } from '@/lib/viz'
import type { OkDataset } from '@/lib/analytics/widgets'
import { SvodkaView, DEPT_TABS } from './SvodkaView'

export const dynamic = 'force-dynamic'

interface TableWithDatasets {
  table_sheets: { sheet_index: number | null; datasets: DatasetDbRow | DatasetDbRow[] | null }[]
}

/** Один вложенный запрос вместо трёх последовательных (tables → table_sheets → datasets). */
async function loadDataset(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  gsid: string,
): Promise<OkDataset | null> {
  const { data } = await supabase
    .from('tables')
    .select('table_sheets(sheet_index, datasets(status, header_row, start_col, end_col, end_row, confidence, columns, rows))')
    .eq('google_spreadsheet_id', gsid)
    .maybeSingle<TableWithDatasets>()
  const sheet = (data?.table_sheets ?? [])
    .slice()
    .sort((a, b) => (a.sheet_index ?? 0) - (b.sheet_index ?? 0))[0]
  const raw = Array.isArray(sheet?.datasets) ? sheet.datasets[0] : sheet?.datasets
  return okDatasetFromRow(raw)
}

function Missing() {
  return (
    <main
      className="flex min-h-screen items-center justify-center text-center"
      style={{ background: VIZ_DARK.page, color: VIZ_DARK.inkPrimary }}
      data-page-theme="dark"
    >
      <div>
        <h1 className="text-lg font-semibold">Нет демо-данных для сводки</h1>
        <p className="mt-2 text-sm" style={{ color: VIZ_DARK.inkSecondary }}>
          Запустите <code>npm run seed:demo</code> — нужны таблицы {DEMO_ADS}, {DEMO_FUNNEL}, {DEMO_CONTENT}.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm underline" style={{ color: VIZ_DARK.series1 }}>← В каталог</Link>
      </div>
    </main>
  )
}

export default async function SvodkaPage() {
  await requireUser()
  const supabase = await createServerSupabase()
  const [ads, funnel, content] = await Promise.all([
    loadDataset(supabase, DEMO_ADS),
    loadDataset(supabase, DEMO_FUNNEL),
    loadDataset(supabase, DEMO_CONTENT),
  ])
  if (!ads || !funnel || !content) return <Missing />
  const data = buildSvodka({ ads, funnel, content })
  return <SvodkaView data={data} tabs={DEPT_TABS} />
}
