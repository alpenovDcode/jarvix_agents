'use client'
import { useCallback, useEffect, useState } from 'react'

const ROLES = [
  { value: 'viewer', label: 'Просмотр' },
  { value: 'editor', label: 'Редактор' },
  { value: 'admin', label: 'Админ' },
]

export function AllowlistManager() {
  const [users, setUsers] = useState<{ email: string; role: string }[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/allowlist')
    if (res.ok) setUsers((await res.json()).users)
  }, [])
  useEffect(() => { load() }, [load])

  const call = async (method: 'POST' | 'DELETE', body: object) => {
    setError(null)
    const res = await fetch('/api/admin/allowlist', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) setError((await res.json()).error ?? 'Ошибка')
    await load()
  }

  return (
    <section className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <h2 className="font-medium">Доступ к платформе</h2>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => { e.preventDefault(); await call('POST', { email, role }); setEmail('') }}
      >
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="email@компании.kz"
          className="flex-1 rounded-lg border border-[var(--hairline)] px-3 py-2 text-sm outline-none focus:border-[#2a78d6]"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-[var(--hairline)] px-2 py-2 text-sm">
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button className="rounded-lg bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf]">Добавить</button>
      </form>
      {error && <p className="mt-2 text-sm text-[#d03b3b]">{error}</p>}
      <ul className="mt-4 divide-y divide-[var(--hairline)]">
        {users.map((u) => (
          <li key={u.email} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>{u.email}</span>
            <span className="flex items-center gap-3">
              <select
                value={u.role}
                onChange={(e) => call('POST', { email: u.email, role: e.target.value })}
                className="rounded-lg border border-[var(--hairline)] px-2 py-1 text-sm"
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button onClick={() => call('DELETE', { email: u.email })} className="text-[#d03b3b] hover:underline">удалить</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
