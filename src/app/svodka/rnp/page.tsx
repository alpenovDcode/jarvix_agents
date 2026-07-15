import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildRnpSvodka, type RnpMonth } from '@/lib/svodka/rnp'
import { VIZ_DARK } from '@/lib/viz'
import type { SheetSnapshot } from '@/lib/types'
import { SvodkaView } from '../SvodkaView'
import { SvodkaLive } from '../SvodkaLive'

export const dynamic = 'force-dynamic'

const RNP_KEY = 'xlsx:RNP Proyiv 1.26'
// помесячные листы книги (октябрь 2025 → февраль 2026) — воронка регистраций одной структуры
const MONTHS: { sheet: string; label: string }[] = [
  { sheet: '1025', label: 'окт 25' },
  { sheet: '1125', label: 'ноя 25' },
  { sheet: '1225', label: 'дек 25' },
  { sheet: '0126', label: 'янв 26' },
  { sheet: '0226', label: 'фев 26' },
]

interface SheetRow { title: string; snapshot: SheetSnapshot }

function Missing() {
  return (
    <main className="flex min-h-screen items-center justify-center text-center" style={{ background: VIZ_DARK.page, color: VIZ_DARK.inkPrimary }} data-page-theme="dark">
      <div>
        <h1 className="text-lg font-semibold">Нет данных RNP</h1>
        <p className="mt-2 text-sm" style={{ color: VIZ_DARK.inkSecondary }}>
          Импортируйте книгу: <code>npm run import:xlsx -- &quot;…/RNP Proyiv 1.26.xlsx&quot;</code>
        </p>
        <Link href="/" className="mt-4 inline-block text-sm underline" style={{ color: VIZ_DARK.series1 }}>← В каталог</Link>
      </div>
    </main>
  )
}

export default async function RnpSvodkaPage() {
  await requireUser()
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('tables')
    .select('table_sheets(title, snapshot)')
    .eq('google_spreadsheet_id', RNP_KEY)
    .maybeSingle<{ table_sheets: SheetRow[] }>()

  const byTitle = new Map((data?.table_sheets ?? []).map((s) => [s.title, s.snapshot]))
  const monthsInput: RnpMonth[] = MONTHS
    .filter((m) => byTitle.has(m.sheet))
    .map((m) => ({ label: m.label, snapshot: byTitle.get(m.sheet)! }))

  if (monthsInput.length < 2) return <Missing />
  const svodka = buildRnpSvodka(monthsInput)
  return (
    <>
      <SvodkaView data={svodka} backHref="/" backLabel="Каталог" />
      <SvodkaLive />
    </>
  )
}
