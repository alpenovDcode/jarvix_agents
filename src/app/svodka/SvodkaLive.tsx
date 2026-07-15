'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Актуализация сводки: раз в минуту перечитываем серверную страницу
 * (router.refresh() → server component заново читает БД, force-dynamic).
 * Проще и надёжнее Realtime; правки видны в течение минуты без перезагрузки.
 */
export function SvodkaLive({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, router])
  return null
}
