import Link from 'next/link'
import type { SessionInfo } from '@/lib/auth'

export function Header({ session }: { session: SessionInfo }) {
  return (
    <header className="border-b border-[var(--hairline)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-semibold">TableHub</Link>
        <nav className="flex items-center gap-4 text-sm text-[var(--ink-secondary)]">
          <Link href="/svodka" className="hover:text-[var(--ink)]">Сводка отдела</Link>
          {session.role === 'admin' && <Link href="/admin" className="hover:text-[var(--ink)]">Админка</Link>}
          <span>{session.email}</span>
        </nav>
      </div>
    </header>
  )
}
