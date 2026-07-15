import type { SheetSnapshot } from '@/lib/types'

export interface SheetRowInput { google_sheet_id: number; title: string; sheet_index: number; snapshot: SheetSnapshot }

/** Собирает объект в форме IWorkbookData Univer из per-sheet снапшотов. */
export function assembleWorkbookData(tableId: string, title: string, sheets: SheetRowInput[]) {
  const ordered = [...sheets].sort((a, b) => a.sheet_index - b.sheet_index)
  const styles: Record<string, object> = {}
  const sheetsById: Record<string, object> = {}
  const sheetOrder: string[] = []
  for (const s of ordered) {
    const sid = `sheet_${s.google_sheet_id}`
    sheetOrder.push(sid)
    for (const [id, style] of Object.entries(s.snapshot.styles)) {
      const { nfType: _nfType, ...univerStyle } = style // nfType — наше поле, Univer его не знает
      styles[id] = univerStyle
    }
    // ширины/высоты → Univer columnData/rowData
    const columnData: Record<number, { w: number }> = {}
    for (const [col, w] of Object.entries(s.snapshot.columnWidths ?? {})) columnData[+col] = { w }
    const rowData: Record<number, { h: number }> = {}
    for (const [row, h] of Object.entries(s.snapshot.rowHeights ?? {})) rowData[+row] = { h }
    sheetsById[sid] = {
      id: sid,
      name: s.title,
      rowCount: s.snapshot.rowCount,
      columnCount: s.snapshot.columnCount,
      cellData: s.snapshot.cellData,
      mergeData: s.snapshot.mergeData,
      columnData,
      rowData,
    }
  }
  return { id: `wb_${tableId}`, name: title, sheetOrder, sheets: sheetsById, styles }
}
