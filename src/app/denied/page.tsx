import Link from 'next/link'

export default function DeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-8 text-center">
        <h1 className="text-lg font-semibold">Нет доступа</h1>
        <p className="mt-2 text-sm text-[var(--ink-secondary)]">
          Ваш аккаунт не в списке допущенных. Обратитесь к администратору платформы.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm text-[#2a78d6] underline">
          Войти другим аккаунтом
        </Link>
      </div>
    </main>
  )
}
