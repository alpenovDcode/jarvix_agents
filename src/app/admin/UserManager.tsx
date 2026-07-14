'use client'
import { useCallback, useEffect, useState } from 'react'

const ROLES = [
  { value: 'viewer', label: 'Просмотр' },
  { value: 'editor', label: 'Редактор' },
  { value: 'admin', label: 'Админ' },
]

interface User { id: string; email: string; full_name: string; role: string }

export function UserManager({ selfEmail }: { selfEmail: string }) {
  const [users, setUsers] = useState<User[]>([])
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('viewer')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/users')
    if (res.ok) setUsers((await res.json()).users)
  }, [])
  useEffect(() => { load() }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCreated(null)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, full_name: fullName, role }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Ошибка'); return }
    setCreated({ email: data.email, password: data.password })
    setEmail('')
    setFullName('')
    setRole('viewer')
    await load()
  }

  const changeRole = async (u: User, newRole: string) => {
    await fetch('/api/admin/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, role: newRole }),
    })
    await load()
  }

  const remove = async (u: User) => {
    await fetch('/api/admin/users', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, email: u.email }),
    })
    await load()
  }

  return (
    <section className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <h2 className="font-medium">Сотрудники</h2>
      <p className="mt-1 text-sm text-[var(--ink-secondary)]">
        Создайте аккаунт и передайте сотруднику почту и пароль. Регистрация самостоятельно недоступна.
      </p>

      <form className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]" onSubmit={create}>
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="почта сотрудника"
          className="rounded-lg border border-[var(--hairline)] px-3 py-2 text-sm outline-none focus:border-[#2a78d6]"
        />
        <input
          type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="имя (необязательно)"
          className="rounded-lg border border-[var(--hairline)] px-3 py-2 text-sm outline-none focus:border-[#2a78d6]"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-[var(--hairline)] px-2 py-2 text-sm">
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button className="rounded-lg bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf]">Создать</button>
      </form>

      {error && <p className="mt-2 text-sm text-[#d03b3b]">{error}</p>}

      {created && (
        <div className="mt-3 rounded-lg border border-[#2a78d6] bg-[#eef5fd] p-3 text-sm">
          <div className="font-medium">Аккаунт создан — передайте данные сотруднику (пароль показан один раз):</div>
          <div className="mt-2 font-mono text-[13px]">
            <div>почта: <b>{created.email}</b></div>
            <div>пароль: <b>{created.password}</b></div>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(`Почта: ${created.email}\nПароль: ${created.password}`)}
            className="mt-2 rounded-md border border-[var(--hairline)] bg-[var(--surface)] px-3 py-1 text-xs hover:bg-[#f0efec]"
          >
            Скопировать
          </button>
        </div>
      )}

      <ul className="mt-4 divide-y divide-[var(--hairline)]">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              {u.email}
              {u.full_name && <span className="text-[var(--ink-muted)]"> · {u.full_name}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <select
                value={u.role} onChange={(e) => changeRole(u, e.target.value)}
                className="rounded-lg border border-[var(--hairline)] px-2 py-1 text-sm"
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {u.email !== selfEmail && (
                <button onClick={() => remove(u)} className="text-[#d03b3b] hover:underline">удалить</button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
