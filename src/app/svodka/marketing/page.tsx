import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildMarketingSvodka, type MarketingInput } from '@/lib/svodka/marketing'
import { VIZ_DARK } from '@/lib/viz'
import type { SheetSnapshot } from '@/lib/types'
import { SvodkaView } from '../SvodkaView'

export const dynamic = 'force-dynamic'

const MARKETING_KEY = 'xlsx:Сводная маркетинг'
// основные листы (по указанию пользователя)
const CHANNEL_SHEETS: { sheet: string; name: string }[] = [
  { sheet: 'Посевы', name: 'Посевы' },
  { sheet: 'РСЯ', name: 'РСЯ' },
  { sheet: 'Цой', name: 'Цой' },
  { sheet: 'INST ЛМ', name: 'INST ЛМ' },
]
const TRAFFIC_ALL = 'Трафик  ALL' // в книге два пробела

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
  const input: MarketingInput = {
    channels: CHANNEL_SHEETS.filter((c) => byTitle.has(c.sheet)).map((c) => ({ name: c.name, snapshot: byTitle.get(c.sheet)! })),
    trafficAll: byTitle.get(TRAFFIC_ALL),
    seo: byTitle.get('SEO'),
    seoEff: byTitle.get('Эффективность SEO'),
    baza: byTitle.get('База'),
    posthog: byTitle.get('PostHog'),
  }

  if (input.channels.length === 0 && !input.trafficAll) return <Missing />
  const svodka = buildMarketingSvodka(input)
  return <SvodkaView data={svodka} backHref="/" backLabel="Каталог" />
}
