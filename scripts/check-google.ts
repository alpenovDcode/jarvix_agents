import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { listFolderSpreadsheets } = await import('../src/lib/google/client')
  const files = await listFolderSpreadsheets(process.env.GOOGLE_DRIVE_FOLDER_ID!)
  console.log(`Найдено таблиц: ${files.length}`)
  for (const f of files.slice(0, 10)) console.log(`- [${f.folder}] ${f.name} (изменена ${f.modifiedTime})`)
}
main().catch((e) => { console.error(e); process.exit(1) })
