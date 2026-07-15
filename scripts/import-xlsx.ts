/**
 * Оффлайн-импорт файла .xlsx напрямую в БД (без Google API).
 *   npm run import:xlsx -- "/путь/к/файлу.xlsx" ["Папка"]
 * Каждый лист книги → table_sheets + datasets, дальше работает общий pipeline и рендер Univer.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { basename } from 'node:path'
import { Client } from 'pg'
import ExcelJS from 'exceljs'
import { convertXlsxSheet } from '@/lib/xlsx/convert'
import { summarizeReports } from '@/lib/google/convert'
import { buildDataset } from '@/lib/dataset/build'
import type { DatasetBuild, SheetImportReport } from '@/lib/types'

function datasetCols(d: DatasetBuild) {
  if (d.status === 'ok') {
    return {
      status: 'ok', header_row: d.headerRow, start_col: d.range.startCol, end_col: d.range.endCol,
      end_row: d.range.endRow, confidence: d.confidence, columns: JSON.stringify(d.columns), rows: JSON.stringify(d.rows),
    }
  }
  return {
    status: d.status, header_row: null, start_col: null, end_col: null, end_row: null,
    confidence: d.status === 'needs_mapping' ? d.confidence : null, columns: null, rows: null,
  }
}

async function main() {
  const filePath = process.argv[2]
  const folder = process.argv[3] ?? 'Импорт'
  if (!filePath) { console.error('usage: npm run import:xlsx -- "<path.xlsx>" ["Папка"]'); process.exit(1) }

  const title = basename(filePath).replace(/\.xlsx$/i, '')
  const key = `xlsx:${title}`

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  console.log(`Читаю «${title}» — ${wb.worksheets.length} листов`)

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    const reports: SheetImportReport[] = []
    const converted = wb.worksheets.map((ws, i) => {
      const { snapshot, report } = convertXlsxSheet(ws, i)
      reports.push(report)
      return { snapshot, dataset: buildDataset(snapshot), index: i }
    })
    const summary = summarizeReports(reports)

    const tableRes = await client.query(
      `insert into public.tables (google_spreadsheet_id, title, folder, mode, import_status, import_report, last_imported_at)
       values ($1,$2,$3,'google-owned',$4,$5, now())
       on conflict (google_spreadsheet_id) do update set title=excluded.title, folder=excluded.folder,
         import_status=excluded.import_status, import_report=excluded.import_report, last_imported_at=now()
       returning id`,
      [key, title, folder, summary.status === 'clean' ? 'ok' : 'ok', JSON.stringify(summary)],
    )
    const tableId = tableRes.rows[0].id as string

    // на случай переимпорта — убрать старые листы этой книги
    await client.query('delete from public.table_sheets where table_id=$1', [tableId])

    let okData = 0
    for (const { snapshot, dataset, index } of converted) {
      const sheetRes = await client.query(
        `insert into public.table_sheets (table_id, google_sheet_id, title, sheet_index, snapshot)
         values ($1,$2,$3,$4,$5) returning id`,
        [tableId, index, snapshot.name, index, JSON.stringify(snapshot)],
      )
      const sheetId = sheetRes.rows[0].id as string
      const c = datasetCols(dataset)
      await client.query(
        `insert into public.datasets (sheet_id, status, header_row, start_col, end_col, end_row, confidence, columns, rows)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [sheetId, c.status, c.header_row, c.start_col, c.end_col, c.end_row, c.confidence, c.columns, c.rows],
      )
      if (dataset.status === 'ok') okData++
      console.log(`  ${String(index + 1).padStart(2)}. ${snapshot.name.slice(0, 30).padEnd(30)} ${report_line(dataset)}`)
    }
    console.log(`\n✓ Импортировано: ${converted.length} листов, из них с авто-аналитикой: ${okData}`)
    console.log(`  Ячеек: ${summary.totalCells}, формул (заморожены в значения): ${summary.totalFormulas}`)
    console.log(`  Открыть: /tables/${tableId}`)
  } finally {
    await client.end()
  }
}

function report_line(d: DatasetBuild): string {
  if (d.status === 'ok') return `аналитика ✓ (${d.columns.length} колонок, ${d.rows.length} строк)`
  if (d.status === 'needs_mapping') return `нужна разметка (conf ${d.confidence.toFixed(2)})`
  return 'пустой/без таблицы'
}

main().catch((e) => { console.error(e); process.exit(1) })
