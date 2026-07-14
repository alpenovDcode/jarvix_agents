import { requireAdmin } from '@/lib/auth'
import { Header } from '@/components/Header'
import { UserManager } from './UserManager'
import { ImportPanel } from './ImportPanel'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await requireAdmin()
  return (
    <>
      <Header session={session} />
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <h1 className="text-xl font-semibold">Админка</h1>
        <ImportPanel />
        <UserManager selfEmail={session.email} />
      </main>
    </>
  )
}
