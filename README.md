# TableHub

Единая платформа таблиц отдела маркетинга: каталог, просмотр, автоаналитика.
Спека: `docs/superpowers/specs/2026-07-14-marketing-tables-platform-design.md`.
План фазы 1: `docs/superpowers/plans/2026-07-14-tablehub-phase1.md`.

## Стек
Next.js 16 (webpack) · Supabase (Postgres/Auth/Realtime) · Univer · Recharts · Google Sheets API.

## Запуск локально
1. `nvm use` (Node 22), затем `npm install`
2. Скопировать `.env.local.example` → `.env.local`, заполнить (см. ниже).
3. `npm run check:db && npm run check:google` — обе проверки зелёные.
4. `npm run dev` (только webpack: путь до репозитория содержит кириллицу, Turbopack не работает).

## Переменные окружения
| Переменная | Откуда |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY | Supabase → Settings → API |
| GOOGLE_SERVICE_ACCOUNT_JSON_B64 | base64 JSON-ключа service account (`base64 -i key.json`) |
| GOOGLE_DRIVE_FOLDER_ID | ID папки отдела из URL Drive |
| CRON_SECRET | `openssl rand -hex 24` |

## Первичная настройка (один раз)
1. **Supabase**: создать проект → SQL Editor → выполнить `supabase/migrations/0001_init.sql`.
2. **Google OAuth (вход пользователей)**: Google Cloud Console → OAuth client (Web) с redirect `https://<project>.supabase.co/auth/v1/callback` → включить провайдер Google в Supabase Auth → в URL Configuration добавить `http://localhost:3000/auth/callback` (и прод-домен после деплоя).
3. **Service account (импорт таблиц)**: в том же GCP-проекте включить Drive API и Sheets API → создать service account → JSON-ключ → base64 в env → расшарить папку отдела на email сервисного аккаунта (право «Читатель»).

## Деплой (Vercel)
1. Пуш в GitHub → импорт репозитория в Vercel → добавить все env из таблицы.
2. Build command: `npm run build` (уже с `--webpack`).
3. Supabase → Authentication → URL Configuration: добавить прод-домен в Site URL и `https://<домен>/auth/callback` в Redirect URLs.
4. Включить 5-минутный переимпорт (Supabase → SQL Editor), подставив свой домен и CRON_SECRET:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'tablehub-reimport',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ЗАМЕНИ-НА-ДОМЕН.vercel.app/api/cron/reimport',
    headers := jsonb_build_object('Authorization', 'Bearer ЗАМЕНИ-НА-CRON-SECRET')
  )
  $$
);
```

Проверка: `select * from cron.job;` — задание в списке; через 5 минут в каталоге обновляется «обновлено …».
(vercel.json содержит страховочный дневной cron — Vercel Hobby чаще не умеет; основной цикл — pg_cron.)

## Правила фазы 1
- Источник истины — Google Sheets, платформа read-only (редактирование придёт в фазе 2).
- Роли: админ (импорт, доступы), редактор/просмотр — пока одинаковы (различия в фазе 2).
