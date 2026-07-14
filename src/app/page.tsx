import { requireUser } from '@/lib/auth'
import { Header } from '@/components/Header'

export default async function Home() {
  const session = await requireUser()
  return (
    <>
      <Header session={session} />
      <main className="mx-auto max-w-6xl p-6">Каталог появится в Task 10</main>
    </>
  )
}
