import { describe, it, expect } from 'vitest'
import { assembleWorkbookData, type SheetRowInput } from '@/lib/workbook'
import type { SheetSnapshot } from '@/lib/types'

const snap = (name: string, styles: SheetSnapshot['styles'] = {}): SheetSnapshot => ({
  name, rowCount: 100, columnCount: 26, mergeData: [], styles, cellData: { 0: { 0: { v: name } } },
})

describe('assembleWorkbookData', () => {
  it('сортирует листы по sheet_index и склеивает стили без nfType', () => {
    const sheets: SheetRowInput[] = [
      { google_sheet_id: 200, title: 'Второй', sheet_index: 1, snapshot: snap('Второй', { s1_0: { bl: 1, nfType: 'DATE' } }) },
      { google_sheet_id: 100, title: 'Первый', sheet_index: 0, snapshot: snap('Первый', { s0_0: { it: 1 } }) },
    ]
    const wb = assembleWorkbookData('t1', 'Моя таблица', sheets)
    expect(wb.id).toBe('wb_t1')
    expect(wb.sheetOrder).toEqual(['sheet_100', 'sheet_200'])
    expect(wb.styles).toEqual({ s0_0: { it: 1 }, s1_0: { bl: 1 } }) // nfType вырезан
    expect((wb.sheets['sheet_100'] as { name: string }).name).toBe('Первый')
  })
})
