import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildMarketingSvodka, type ChannelInput } from '@/lib/svodka/marketing'
import { VIZ_DARK } from '@/lib/viz'
import type { SheetSnapshot } from '@/lib/types'
import { SvodkaView } from '../SvodkaView'

export const dynamic = 'force-dynamic'

const MARKETING_KEY = 'xlsx:Сводная маркетинг'
// основные листы-каналы привлечения (по указанию пользователя)
const CHANNELS: { sheet: string; name: string }[] = [
  { sheet: 'Посевы', name: 'Посевы' },
  { sheet: 'РСЯ', name: 'РСЯ' },
  { sheet: 'Цой', name: 'Цой' },
  { sheet: 'INST ЛМ', name: 'INST ЛМ' },
]

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

  const byTitle = new Map((data?.table_sheets ?? []).map((s) => [s.title, s.snapshot]))
  const channels: ChannelInput[] = CHANNELS
    .filter((c) => byTitle.has(c.sheet))
    .map((c) => ({ name: c.name, snapshot: byTitle.get(c.sheet)! }))

  if (channels.length === 0) return <Missing />
  const svodka = buildMarketingSvodka(channels)
  return <SvodkaView data={svodka} backHref="/" backLabel="Каталог" />
}
