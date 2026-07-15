import { google, type sheets_v4 } from 'googleapis'

function serviceAccount() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64
  if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_B64 не задан')
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as { client_email: string; private_key: string }
}

function authClient() {
  const sa = serviceAccount()
  return new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  })
}

export interface DriveSpreadsheet { id: string; name: string; folder: string; modifiedTime: string }

const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

async function listChildren(drive: ReturnType<typeof google.drive>, folderId: string, mimeType: string) {
  const files: { id: string; name: string; modifiedTime?: string }[] = []
  let pageToken: string | undefined
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='${mimeType}' and trashed=false`,
      fields: 'nextPageToken, files(id, name, modifiedTime)',
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    files.push(...((res.data.files ?? []) as typeof files))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return files
}

/** Таблицы в корневой папке и её подпапках первого уровня. Подпапка = «папка» каталога. */
export async function listFolderSpreadsheets(rootFolderId: string): Promise<DriveSpreadsheet[]> {
  const drive = google.drive({ version: 'v3', auth: authClient() })
  const result: DriveSpreadsheet[] = []
  const rootFiles = await listChildren(drive, rootFolderId, SPREADSHEET_MIME)
  for (const f of rootFiles) result.push({ id: f.id, name: f.name, folder: 'Без папки', modifiedTime: f.modifiedTime! })
  const subfolders = await listChildren(drive, rootFolderId, FOLDER_MIME)
  // подпапки независимы — опрашиваем параллельно (последовательно каждая стоит round-trip к Drive)
  const perFolder = await Promise.all(
    subfolders.map(async (sub) => ({ sub, files: await listChildren(drive, sub.id, SPREADSHEET_MIME) })),
  )
  for (const { sub, files } of perFolder) {
    for (const f of files) result.push({ id: f.id, name: f.name, folder: sub.name, modifiedTime: f.modifiedTime! })
  }
  return result
}

const GRID_FIELDS =
  'sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)),' +
  'data(startRow,startColumn,rowData(values(' +
  'userEnteredValue(formulaValue),' +
  'effectiveValue(numberValue,stringValue,boolValue),' +
  'effectiveFormat(backgroundColor(red,green,blue),textFormat(bold,italic,fontSize),horizontalAlignment,numberFormat(type,pattern))' +
  '))),merges)'

export async function fetchSpreadsheetGrid(spreadsheetId: string): Promise<sheets_v4.Schema$Sheet[]> {
  const sheets = google.sheets({ version: 'v4', auth: authClient() })
  const res = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: true, fields: GRID_FIELDS })
  return res.data.sheets ?? []
}
