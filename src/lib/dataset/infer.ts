import type { CellScalar, ColumnType } from '@/lib/types'

const DAY_MS = 86_400_000
const SERIAL_EPOCH_UTC = Date.UTC(1899, 11, 30) // эпоха серийных дат Google/Excel

export function serialToISO(serial: number): string {
  return new Date(SERIAL_EPOCH_UTC + Math.round(serial) * DAY_MS).toISOString().slice(0, 10)
}

export function parseRuDate(s: string): string | null {
  const t = s.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/.exec(t)
  if (!m) return null
  const dd = Number(m[1])
  const mm = Number(m[2])
  let yy = Number(m[3])
  if (yy < 100) yy += 2000
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

export function parseNumberLike(v: CellScalar): number | null {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return null
  let t = v.trim().replace(/\s/g, '')
  if (!t) return null
  let percent = false
  if (t.endsWith('%')) {
    percent = true
    t = t.slice(0, -1)
  }
  t = t.replace(/[₸₽$€]/g, '')
  if (t.includes('.') && t.includes(',')) t = t.replace(/,/g, '')
  else t = t.replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return percent ? n / 100 : n
}

const CURRENCY_RE = /[₸₽$€]/
const ID_TITLE_RE = /(^|[\s_(])(id|код|номер|№|артикул)/i

export function inferColumnType(values: CellScalar[], meta: { nfTypes: (string | null)[]; title: string }): ColumnType {
  const cells = values
    .map((v, i) => ({ v, nf: meta.nfTypes[i] ?? null }))
    .filter(({ v }) => v !== null && v !== '')
  if (!cells.length) return 'text'
  const n = cells.length
  const share = (pred: (x: { v: CellScalar; nf: string | null }) => boolean) => cells.filter(pred).length / n

  const dateShare = share(({ v, nf }) =>
    ((nf === 'DATE' || nf === 'DATE_TIME') && typeof v === 'number') ||
    (typeof v === 'string' && parseRuDate(v) !== null))
  if (dateShare >= 0.6) return 'date'

  if (share(({ v, nf }) => nf === 'PERCENT' || (typeof v === 'string' && v.trim().endsWith('%'))) >= 0.5) return 'percent'
  if (share(({ v, nf }) => nf === 'CURRENCY' || (typeof v === 'string' && CURRENCY_RE.test(v))) >= 0.5) return 'money'

  const numericShare = share(({ v }) => parseNumberLike(v) !== null)
  const unique = new Set(cells.map(({ v }) => String(v).trim().toLowerCase()))
  const uniqueRatio = unique.size / n

  if (numericShare >= 0.8) return ID_TITLE_RE.test(meta.title) ? 'id' : 'number'
  if (ID_TITLE_RE.test(meta.title) && uniqueRatio >= 0.9) return 'id'
  if (unique.size <= 30 && uniqueRatio <= 0.5) return 'category'
  return 'text'
}
