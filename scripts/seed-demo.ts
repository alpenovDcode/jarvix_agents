/**
 * Засев демо-таблиц напрямую в БД по DATABASE_URL (API-ключи Supabase не нужны).
 * Чтобы платформу можно было посмотреть с данными до настройки Google-импорта.
 *   npm run seed:demo
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { Client } from 'pg'
import { matrixToSnapshot, parseCsv } from '@/lib/csv'
import { buildDataset } from '@/lib/dataset/build'
import type { DatasetBuild } from '@/lib/types'

interface Demo { key: string; folder: string; title: string; csv: string }

const DEMOS: Demo[] = [
  {
    key: 'demo-ads', folder: 'Реклама', title: 'Рекламные каналы — июнь 2026',
    csv: `Отчёт по рекламным каналам,,,,
за июнь 2026,,,,
,,,,
Дата,Канал,Расход,Лиды,Стоимость лида
01.06.2026,Instagram,45000,120,375
01.06.2026,Google Ads,80000,200,400
02.06.2026,Instagram,50000,140,357
02.06.2026,TikTok,30000,90,333
03.06.2026,Google Ads,85000,210,405
04.06.2026,Instagram,48000,130,369
05.06.2026,TikTok,35000,100,350
06.06.2026,Google Ads,90000,240,375
07.06.2026,Instagram,52000,150,347
08.06.2026,TikTok,40000,115,348`,
  },
  {
    key: 'demo-funnel', folder: 'Реклама', title: 'Воронка конверсии по неделям',
    csv: `Неделя,Источник,Показы,Клики,Заявки,Продажи
2026-05-04,SEO,120000,4800,320,64
2026-05-11,SEO,132000,5200,360,78
2026-05-18,SEO,128000,5000,340,70
2026-05-25,Директ,98000,6100,410,95
2026-06-01,Директ,105000,6700,455,110
2026-06-08,Директ,112000,7000,480,120
2026-06-15,SEO,140000,5600,390,88
2026-06-22,Директ,118000,7300,505,132`,
  },
  {
    key: 'demo-content', folder: 'Контент', title: 'Контент-план',
    csv: `Дата,Площадка,Тема,Формат,Охват
02.06.2026,Instagram,Гайд по продукту,Reels,15400
04.06.2026,Telegram,Кейс клиента,Пост,8200
06.06.2026,YouTube,Обзор новинок,Видео,32000
09.06.2026,Instagram,Отзывы,Карусель,11200
11.06.2026,Telegram,Анонс акции,Пост,9500
13.06.2026,YouTube,Интервью,Видео,27500
16.06.2026,Instagram,Закулисье,Reels,18300
18.06.2026,Telegram,Дайджест,Пост,7800`,
  },
]

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
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    for (const demo of DEMOS) {
      const snapshot = matrixToSnapshot(parseCsv(demo.csv), demo.title)
      const dataset = buildDataset(snapshot)

      const tableRes = await client.query(
        `insert into public.tables (google_spreadsheet_id, title, folder, mode, import_status, import_report, last_imported_at)
         values ($1,$2,$3,'google-owned','ok',$4, now())
         on conflict (google_spreadsheet_id) do update set title=excluded.title, folder=excluded.folder, last_imported_at=now()
         returning id`,
        [demo.key, demo.title, demo.folder, JSON.stringify({ status: 'clean', totalCells: 0, totalFormulas: 0, totalFrozen: 0, sheets: [] })],
      )
      const tableId = tableRes.rows[0].id as string

      const sheetRes = await client.query(
        `insert into public.table_sheets (table_id, google_sheet_id, title, sheet_index, snapshot)
         values ($1,0,$2,0,$3)
         on conflict (table_id, google_sheet_id) do update set snapshot=excluded.snapshot, title=excluded.title
         returning id`,
        [tableId, snapshot.name, JSON.stringify(snapshot)],
      )
      const sheetId = sheetRes.rows[0].id as string

      const c = datasetCols(dataset)
      await client.query(
        `insert into public.datasets (sheet_id, status, header_row, start_col, end_col, end_row, confidence, columns, rows)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (sheet_id) do update set status=excluded.status, header_row=excluded.header_row,
           start_col=excluded.start_col, end_col=excluded.end_col, end_row=excluded.end_row,
           confidence=excluded.confidence, columns=excluded.columns, rows=excluded.rows, built_at=now()`,
        [sheetId, c.status, c.header_row, c.start_col, c.end_col, c.end_row, c.confidence, c.columns, c.rows],
      )
      console.log(`✓ ${demo.folder} / ${demo.title} — ${dataset.status}`)
    }
    console.log('\nДемо-таблицы засеяны.')
  } finally {
    await client.end()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
