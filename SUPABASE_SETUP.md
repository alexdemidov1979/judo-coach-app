# Настройка Supabase (кратко)

1. Зарегистрируйтесь на supabase.com → New Project (бесплатный тариф).
2. Project Settings → API → скопируйте **Project URL** и **anon public key**.
   Вставьте их в `supabase-backend.js` вместо `ВАШ-ПРОЕКТ` и `ВАШ-ANON-KEY`.
3. SQL Editor → вставьте содержимое `supabase/sql/schema.sql` → Run.
4. Authentication → Providers → Email — убедитесь, что включён (по умолчанию да).
   Если не хотите подтверждение по почте на старте теста — отключите
   "Confirm email" в Authentication → Settings.
5. Edge Functions (нужен Supabase CLI: `npm install -g supabase`):
   ```
   supabase login
   supabase link --project-ref ВАШ-ПРОЕКТ
   supabase functions deploy ai-usage
   supabase functions deploy ai-chat
   supabase secrets set YANDEXGPT_API_KEY=... YANDEXGPT_FOLDER_ID=...
   ```
6. Готово — загрузите файлы в GitHub (как раньше), вход/регистрация и ИИ-тренер
   заработают через Supabase.
