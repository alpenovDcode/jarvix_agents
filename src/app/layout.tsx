import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TableHub — таблицы отдела маркетинга',
  description: 'Единая платформа таблиц и аналитики',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
