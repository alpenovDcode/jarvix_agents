import { describe, it, expect } from 'vitest'
import { needsImport } from '@/lib/import/importTable'

describe('needsImport', () => {
  it('ни разу не импортирована → true', () => {
    expect(needsImport({ google_modified_at: '2026-07-01T00:00:00Z', last_imported_at: null })).toBe(true)
  })
  it('изменена в Google после импорта → true', () => {
    expect(needsImport({ google_modified_at: '2026-07-02T00:00:00Z', last_imported_at: '2026-07-01T00:00:00Z' })).toBe(true)
  })
  it('импорт свежее изменения → false', () => {
    expect(needsImport({ google_modified_at: '2026-07-01T00:00:00Z', last_imported_at: '2026-07-02T00:00:00Z' })).toBe(false)
  })
  it('нет данных об изменении, но импорт был → false', () => {
    expect(needsImport({ google_modified_at: null, last_imported_at: '2026-07-01T00:00:00Z' })).toBe(false)
  })
})
