'use client'
import { createBrowserSupabase } from '@/lib/supabase/client'

export default function LoginPage() {
  const signIn = () => {
    const supabase = createBrowserSupabase()
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">TableHub</h1>
        <p className="mt-2 text-sm text-[var(--ink-secondary)]">Таблицы и аналитика отдела маркетинга</p>
        <button
          onClick={signIn}
          className="mt-6 w-full rounded-lg bg-[#2a78d6] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#256abf]"
        >
          Войти через Google
        </button>
      </div>
    </main>
  )
}
