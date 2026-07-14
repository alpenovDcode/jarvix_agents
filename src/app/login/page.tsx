'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createBrowserSupabase()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setError('Неверная почта или пароль')
      setLoading(false)
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-8 shadow-sm">
        <h1 className="text-center text-xl font-semibold">TableHub</h1>
        <p className="mt-2 text-center text-sm text-[var(--ink-secondary)]">Таблицы и аналитика отдела маркетинга</p>
        <label className="mt-6 block text-sm">
          <span className="text-[var(--ink-secondary)]">Почта</span>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username"
            className="mt-1 w-full rounded-lg border border-[var(--hairline)] px-3 py-2 text-sm outline-none focus:border-[#2a78d6]"
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-[var(--ink-secondary)]">Пароль</span>
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-[var(--hairline)] px-3 py-2 text-sm outline-none focus:border-[#2a78d6]"
          />
        </label>
        {error && <p className="mt-3 text-sm text-[#d03b3b]">{error}</p>}
        <button
          type="submit" disabled={loading}
          className="mt-6 w-full rounded-lg bg-[#2a78d6] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
        >
          {loading ? 'Входим…' : 'Войти'}
        </button>
        <p className="mt-4 text-center text-xs text-[var(--ink-muted)]">Доступ выдаёт администратор платформы.</p>
      </form>
    </main>
  )
}
