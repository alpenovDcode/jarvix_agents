'use client'
import { useEffect, useRef } from 'react'
import '@univerjs/presets/lib/styles/preset-sheets-core.css'

export default function UniverViewer({ data }: { data: Record<string, unknown> }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let disposed = false
    let dispose: (() => void) | undefined
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
      workbook.setEditable(false) // фаза 1 — только просмотр
      dispose = () => univer.dispose()
    })()
    // dispose откладываем: синхронный univer.dispose() во время рендер-фазы React
    // (при переключении вкладок) роняет рендерер в race condition
    return () => {
      disposed = true
      const d = dispose
      dispose = undefined
      if (d) setTimeout(d, 0)
    }
  }, [data])

  return <div ref={containerRef} style={{ overscrollBehavior: 'none' }} className="mt-3 h-[70vh] w-full overflow-hidden rounded-xl border border-[var(--hairline)]" />
}
