export interface CatalogTable {
  id: string
  title: string
  folder: string
  import_status: 'pending' | 'ok' | 'error'
  last_imported_at: string | null
  sheet_count: number
}

export function groupTables(rows: CatalogTable[], query: string): { folder: string; tables: CatalogTable[] }[] {
  const q = query.trim().toLowerCase()
  const filtered = q
    ? rows.filter((t) => t.title.toLowerCase().includes(q) || t.folder.toLowerCase().includes(q))
    : rows
  const groups = new Map<string, CatalogTable[]>()
  for (const t of filtered) {
    const list = groups.get(t.folder) ?? []
    list.push(t)
    groups.set(t.folder, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ru'))
    .map(([folder, tables]) => ({ folder, tables: [...tables].sort((x, y) => x.title.localeCompare(y.title, 'ru')) }))
}
