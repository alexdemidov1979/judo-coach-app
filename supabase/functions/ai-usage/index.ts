// supabase/functions/ai-usage/index.ts
// Проверяет и увеличивает счётчик обращений к ИИ-тренеру за текущий месяц.
// Лимиты: Free — 20 сообщений/мес на режим, Pro — без ограничений.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FREE_LIMIT = 20;

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json(401, { error: 'Не авторизован.' });
    }
    const uid = userData.user.id;

    const { mode } = await req.json();
    const period = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

    const { data: profile } = await supabase.from('profiles').select('is_pro').eq('id', uid).single();
    const isPro = !!profile?.is_pro;

    const { data: usageRow } = await supabase
      .from('ai_usage').select('count').eq('uid', uid).eq('period', period).eq('mode', mode).single();
    const count = usageRow?.count || 0;

    if (!isPro && count >= FREE_LIMIT) {
      return json(200, { allowed: false, remaining: 0, limit: FREE_LIMIT, isPro });
    }

    await supabase.from('ai_usage').upsert({
      uid, period, mode, count: count + 1, updated_at: new Date().toISOString()
    }, { onConflict: 'uid,period,mode' });

    return json(200, {
      allowed: true,
      remaining: isPro ? null : FREE_LIMIT - count - 1,
      limit: isPro ? null : FREE_LIMIT,
      isPro
    });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
