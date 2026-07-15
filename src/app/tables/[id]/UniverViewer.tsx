'use client'
import { useEffect, useRef } from 'react'
import '@univerjs/presets/lib/styles/preset-sheets-core.css'

// univerAPI типизирован как unknown из динамического импорта — берём минимальный контракт
interface FUniverLike {
  getActiveWorkbook(): { getActiveSheet(): { getSheetId(): string; getSnapshot(): { cellData?: unknown; mergeData?: unknown } } } | null
  addEvent(event: string, cb: () => void): { dispose(): void }
  Event: { SheetValueChanged: string }
}

async function saveActiveSheet(api: FUniverLike, tableId: string, onState: (s: SaveState) => void) {
  const wb = api.getActiveWorkbook()
  if (!wb) return
  const ws = wb.getActiveSheet()
  const m = /sheet_(\d+)/.exec(ws.getSheetId())
  if (!m) return
  const snap = ws.getSnapshot()
  onState('saving')
  try {
    const res = await fetch(`/api/tables/${tableId}/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ googleSheetId: Number(m[1]), cellData: snap.cellData, mergeData: snap.mergeData }),
    })
    onState(res.ok ? 'saved' : 'error')
  } catch {
    onState('error')
  }
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
const STATE_TEXT: Record<SaveState, string> = { idle: '', saving: 'Сохранение…', saved: 'Сохранено ✓', error: 'Ошибка сохранения' }

export default function UniverViewer({ data, tableId, editable = false }: {
  data: Record<string, unknown>; tableId: string; editable?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editableRef = useRef(editable)
  const workbookRef = useRef<{ setEditable(v: boolean): void } | null>(null)

  // смена режима — на ЖИВОМ экземпляре, без пересоздания Univer
  // (пересоздание при toggle роняло рендерер: отложенный dispose старого бил по новому)
  useEffect(() => {
    editableRef.current = editable
    workbookRef.current?.setEditable(editable)
    if (badgeRef.current) badgeRef.current.textContent = ''
  }, [editable])

  useEffect(() => {
    let disposed = false
    let dispose: (() => void) | undefined
    const setState = (s: SaveState) => { if (badgeRef.current) badgeRef.current.textContent = STATE_TEXT[s] }
    ;(async () => {
      const [{ createUniver, LocaleType, mergeLocales }, { UniverSheetsCorePreset }, ruRU] = await Promise.all([
        import('@univerjs/presets'),
        import('@univerjs/presets/preset-sheets-core'),
        import('@univerjs/presets/preset-sheets-core/locales/ru-RU'),
      ])
      if (disposed || !containerRef.current) return
      const { univer, univerAPI } = createUniver({
        locale: LocaleType.RU_RU,
        locales: { [LocaleType.RU_RU]: mergeLocales((ruRU as { default?: object }).default ?? ruRU) },
        presets: [UniverSheetsCorePreset({ container: containerRef.current })],
      })
      const workbook = univerAPI.createWorkbook(data as never)
      workbook.setEditable(editableRef.current)
      workbookRef.current = workbook

      // подписка всегда; сохраняем только когда включён режим правки
      const api = univerAPI as unknown as FUniverLike
      const evt = api.addEvent(api.Event.SheetValueChanged, () => {
        if (!editableRef.current) return
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => { void saveActiveSheet(api, tableId, setState) }, 1200)
      })
      dispose = () => { evt.dispose(); univer.dispose() }
    })()
    // dispose откладываем: синхронный univer.dispose() во время рендер-фазы React
    // (при переключении вкладок) роняет рендерер в race condition
    return () => {
      disposed = true
      workbookRef.current = null
      if (timer.current) clearTimeout(timer.current)
      const d = dispose
      dispose = undefined
      if (d) setTimeout(d, 0)
    }
  }, [data, tableId])

  return (
    <div className="mt-3">
      {editable && (
        <div className="mb-2 flex items-center gap-2 text-xs text-[var(--ink-muted)]">
          <span className="rounded bg-[var(--brand-soft)] px-2 py-0.5 text-[var(--brand)]">режим правки</span>
          <span ref={badgeRef} aria-live="polite" />
        </div>
      )}
      <div ref={containerRef} style={{ overscrollBehavior: 'none' }} className="h-[70vh] w-full overflow-hidden rounded-xl border border-[var(--hairline)]" />
    </div>
  )
}
