// supabase/functions/ai-chat/index.ts
// Принимает сообщение пользователя, обращается к YandexGPT (Foundation Models),
// сохраняет пару "вопрос/ответ" в ai_messages и возвращает текст ответа.
// Секретный ключ YANDEXGPT_API_KEY никогда не попадает в код фронтенда.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const { chatId, systemPrompt, history, message } = await req.json();

    // Сохраняем сообщение пользователя.
    await supabase.from('ai_messages').insert({ chat_id: chatId, uid, role: 'user', text: message });

    const messages = [
      { role: 'system', text: systemPrompt || '' },
      ...(Array.isArray(history) ? history.map((h: { role: string; text: string }) => ({
        role: h.role === 'assistant' ? 'assistant' : 'user',
        text: h.text
      })) : []),
      { role: 'user', text: message }
    ];

    const folderId = Deno.env.get('YANDEXGPT_FOLDER_ID');
    const apiKey = Deno.env.get('YANDEXGPT_API_KEY');

    const ygptRes = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Api-Key ${apiKey}`
      },
      body: JSON.stringify({
        modelUri: `gpt://${folderId}/yandexgpt/latest`,
        completionOptions: { stream: false, temperature: 0.6, maxTokens: 2000 },
        messages
      })
    });

    if (!ygptRes.ok) {
      const errText = await ygptRes.text();
      throw new Error(`YandexGPT error (${ygptRes.status}): ${errText}`);
    }
    const ygptData = await ygptRes.json();
    const text = ygptData?.result?.alternatives?.[0]?.message?.text || 'Не удалось получить ответ.';

    await supabase.from('ai_messages').insert({ chat_id: chatId, uid, role: 'assistant', text });
    await supabase.from('ai_chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);

    return json(200, { text });
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
