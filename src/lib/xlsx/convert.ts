import type ExcelJS from 'exceljs'
import type { BorderSet, MergeRange, SheetImportReport, SheetSnapshot, SnapshotCell, SnapshotStyle } from '@/lib/types'

// Конвертер книги Excel (exceljs) в наш SheetSnapshot — тот же формат, что google/convert.ts,
// поэтому дальше работает общий pipeline snapshot → dataset → analytics и рендер Univer.

const ROW_LIMIT = 10000
const COL_LIMIT = 200

// Стандартная палитра тем Office (индексы как отдаёт exceljs: 0=lt1,1=dk1,2=lt2,3=dk2,4..9=accent1..6).
const THEME_HEX = ['ffffff', '000000', 'e7e6e6', '44546a', '4472c4', 'ed7d31', 'a5a5a5', 'ffc000', '5b9bd5', '70ad47']

// exceljs border.style → Univer BorderStyleTypes
const BORDER_STYLE: Record<string, number> = {
  thin: 1, hair: 2, dotted: 3, dashed: 4, dashDot: 5, dashDotDot: 6, double: 7,
  medium: 8, mediumDashDot: 9, mediumDashDotDot: 10, mediumDashed: 11, slantDashDot: 12, thick: 13,
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
function applyTint(hex: string, tint?: number): string {
  if (!tint) return hex
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const out = rgb.map((c) => (tint > 0 ? clamp(c + (255 - c) * tint) : clamp(c * (1 + tint))))
  return out.map((c) => c.toString(16).padStart(2, '0')).join('')
}

/** exceljs-цвет ({argb}|{theme,tint}|{indexed}) → '#rrggbb' или null. */
export function excelColorToHex(color?: { argb?: string; theme?: number; tint?: number }): string | null {
  if (!color) return null
  if (color.argb) {
    const a = color.argb.length === 8 ? color.argb.slice(0, 2) : 'ff'
    if (a === '00') return null // полностью прозрачный
    const rgb = color.argb.length === 8 ? color.argb.slice(2) : color.argb
    return `#${rgb.toLowerCase()}`
  }
  if (typeof color.theme === 'number' && THEME_HEX[color.theme]) {
    return `#${applyTint(THEME_HEX[color.theme], color.tint)}`
  }
  return null
}

/** Грубый тип формата (для типизации dataset), выведенный из строки numFmt Excel. */
export function numFmtType(fmt?: string): string | undefined {
  if (!fmt || fmt === 'General') return undefined
  const f = fmt.toLowerCase()
  if (f.includes('%')) return 'PERCENT'
  if (/[yдmмdд]/.test(f) && /[-./: ]/.test(f)) return 'DATE'
  if (f.includes('₽') || f.includes('$') || f.includes('€') || f.includes('"р') || f.includes('руб')) return 'CURRENCY'
  return undefined
}

const HT: Record<string, 1 | 2 | 3> = { left: 1, center: 2, right: 3 }
const VT: Record<string, 1 | 2 | 3> = { top: 1, middle: 2, bottom: 3 }

function extractStyle(cell: ExcelJS.Cell): SnapshotStyle | null {
  const s: SnapshotStyle = {}
  const font = cell.font
  if (font?.bold) s.bl = 1
  if (font?.italic) s.it = 1
  if (font?.size && font.size !== 10 && font.size !== 11) s.fs = font.size
  if (font?.name && font.name !== 'Arial' && font.name !== 'Calibri') s.ff = font.name
  const textHex = excelColorToHex(font?.color)
  if (textHex && textHex !== '#000000') s.cl = { rgb: textHex }

  // заливка (solid pattern) — fgColor несёт цвет
  const fill = cell.fill
  if (fill?.type === 'pattern' && fill.pattern !== 'none') {
    const bgHex = excelColorToHex(fill.fgColor)
    if (bgHex && bgHex !== '#ffffff') s.bg = { rgb: bgHex }
  }

  const al = cell.alignment
  if (al?.horizontal && HT[al.horizontal]) s.ht = HT[al.horizontal]
  if (al?.vertical && VT[al.vertical]) s.vt = VT[al.vertical]

  const bd: BorderSet = {}
  const b = cell.border
  for (const [side, key] of [['top', 't'], ['bottom', 'b'], ['left', 'l'], ['right', 'r']] as const) {
    const edge = b?.[side]
    if (edge?.style) {
      bd[key] = { s: BORDER_STYLE[edge.style] ?? 1, cl: { rgb: excelColorToHex(edge.color) ?? '#000000' } }
    }
  }
  if (Object.keys(bd).length) s.bd = bd

  if (cell.numFmt) {
    s.n = { pattern: cell.numFmt }
    const t = numFmtType(cell.numFmt)
    if (t) s.nfType = t
  }
  return Object.keys(s).length ? s : null
}

/** Отображаемое значение ячейки (формулы — их кэшированный результат). */
export function cellValue(v: ExcelJS.CellValue): string | number | boolean | undefined {
  if (v == null) return undefined
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>
    if ('result' in o) return cellValue(o.result as ExcelJS.CellValue) // formula/sharedFormula
    if ('richText' in o) return (o.richText as { text: string }[]).map((r) => r.text).join('')
    if ('text' in o) return String(o.text) // hyperlink
    if ('error' in o) return String(o.error)
  }
  return undefined
}

export function convertXlsxSheet(ws: ExcelJS.Worksheet, sheetIndex: number): { snapshot: SheetSnapshot; report: SheetImportReport } {
  const title = ws.name || `Лист ${sheetIndex + 1}`
  const cellData: SheetSnapshot['cellData'] = {}
  const styles: Record<string, SnapshotStyle> = {}
  const styleIds = new Map<string, string>()
  const report: SheetImportReport = { sheetTitle: title, cellCount: 0, formulaCount: 0, frozenFormulas: [], warnings: [] }
  let maxRow = -1
  let maxCol = -1
  let clipped = 0

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const r = rowNumber - 1
      const c = colNumber - 1
      if (r >= ROW_LIMIT || c >= COL_LIMIT) { clipped++; return }
      const out: SnapshotCell = {}
      const val = cellValue(cell.value)
      if (val !== undefined) out.v = val
      // формула есть, но в Univer кросс-лист ссылки не разрешатся → показываем значение, формулу замораживаем
      if (cell.formula) {
        report.formulaCount++
        out.custom = { frozenFormula: `=${cell.formula}` }
      }
      const style = extractStyle(cell)
      if (style) {
        const key = JSON.stringify(style)
        let id = styleIds.get(key)
        if (!id) { id = `s${sheetIndex}_${styleIds.size}`; styleIds.set(key, id); styles[id] = style }
        out.s = id
      }
      if (out.v === undefined && !out.s && !out.custom) return
      ;(cellData[r] ??= {})[c] = out
      report.cellCount++
      if (r > maxRow) maxRow = r
      if (c > maxCol) maxCol = c
    })
  })

  // объединённые диапазоны
  const merges = (ws.model as { merges?: string[] }).merges ?? []
  const mergeData: MergeRange[] = merges.map(parseA1Range).filter((m): m is MergeRange => m !== null)

  // ширины колонок (символы Excel → px ≈ ×7) и высоты строк (points → px ×4/3)
  const columnWidths: Record<number, number> = {}
  ws.columns?.forEach((col, i) => { if (col?.width) columnWidths[i] = Math.round(col.width * 7) })
  const rowHeights: Record<number, number> = {}
  ws.eachRow({ includeEmpty: false }, (row, rn) => { if (row.height) rowHeights[rn - 1] = Math.round(row.height * 4 / 3) })

  if (clipped > 0) report.warnings.push(`Обрезано ${clipped} ячеек за пределами ${ROW_LIMIT}×${COL_LIMIT}`)

  const snapshot: SheetSnapshot = {
    name: title,
    rowCount: Math.min(Math.max(maxRow + 51, 100), ROW_LIMIT),
    columnCount: Math.min(Math.max(maxCol + 6, 26), COL_LIMIT),
    cellData, mergeData, styles, columnWidths, rowHeights,
  }
  return { snapshot, report }
}

/** 'A1:C3' → 0-based диапазон. */
export function parseA1Range(range: string): MergeRange | null {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range)
  if (!m) return null
  return {
    startColumn: colToIndex(m[1]), startRow: +m[2] - 1,
    endColumn: colToIndex(m[3]), endRow: +m[4] - 1,
  }
}
function colToIndex(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}
