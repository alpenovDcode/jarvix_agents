import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildMarketingSvodka } from '@/lib/svodka/marketing'
import { VIZ_DARK } from '@/lib/viz'
import type { SheetSnapshot } from '@/lib/types'
import { SvodkaView } from '../SvodkaView'

export const dynamic = 'force-dynamic'

const MARKETING_KEY = 'xlsx:Сводная маркетинг'
const CORE_SHEET = 'Итог Марафон'

interface SheetRow { title: string; snapshot: SheetSnapshot }

function Missing() {
  return (
    <main className="flex min-h-screen items-center justify-center text-center" style={{ background: VIZ_DARK.page, color: VIZ_DARK.inkPrimary }} data-page-theme="dark">
      <div>
        <h1 className="text-lg font-semibold">Нет данных «Сводная маркетинг»</h1>
        <p className="mt-2 text-sm" style={{ color: VIZ_DARK.inkSecondary }}>
          Импортируйте книгу: <code>npm run import:xlsx -- &quot;…/Сводная маркетинг.xlsx&quot;</code>
        </p>
        <Link href="/" className="mt-4 inline-block text-sm underline" style={{ color: VIZ_DARK.series1 }}>← В каталог</Link>
      </div>
    </main>
  )
}

export default async function MarketingSvodkaPage() {
  await requireUser()
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('tables')
    .select('table_sheets(title, snapshot)')
    .eq('google_spreadsheet_id', MARKETING_KEY)
    .maybeSingle<{ table_sheets: SheetRow[] }>()

  const itog = (data?.table_sheets ?? []).find((s) => s.title === CORE_SHEET)?.snapshot
  if (!itog) return <Missing />
  const svodka = buildMarketingSvodka(itog)
  return <SvodkaView data={svodka} backHref="/" backLabel="Каталог" />
}
