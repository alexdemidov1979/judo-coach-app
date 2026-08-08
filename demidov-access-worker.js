// ============================================================
// Cloudflare Worker: проверка владельца приложения перед выдачей
// ссылки на закрытый Telegram-канал.
//
// Логика:
// 1. Приложение присылает Google access_token пользователя, который
//    уже вошёл в свой Google-аккаунт (тот же токен, что используется
//    для Google Drive — отдельный вход не нужен).
// 2. Worker сам спрашивает у Google (oauth2.googleapis.com/tokeninfo),
//    какой email привязан к этому токену. Это НЕЛЬЗЯ подделать с
//    клиента — email подтверждает сам Google, а не приложение.
// 3. Если email совпадает с OWNER_EMAIL — отдаём ссылку на канал.
//    Если нет — отдаём 403 без ссылки.
//
// Ссылка на канал хранится ТОЛЬКО здесь, на сервере. В коде
// приложения (index.html) её вообще нет.
// ============================================================

const OWNER_EMAIL = 'peihyei@gmail.com';
const CHANNEL_URL = 'https://t.me/+WcJ5fH7Xwd4yZWEy';

// Разрешаем запросы только с вашего сайта (замените на свой домен GitHub Pages)
const ALLOWED_ORIGIN = 'https://alexdemidov1979.github.io';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'bad_request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const accessToken = body && body.access_token;
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'no_token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // Спрашиваем у самого Google, чей это токен — приложению доверять не нужно
    let tokenInfo;
    try {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
      );
      if (!res.ok) {
        return new Response(JSON.stringify({ error: 'invalid_token' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
      tokenInfo = await res.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'google_unreachable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const email = tokenInfo.email;
    const emailVerified = tokenInfo.email_verified === 'true' || tokenInfo.email_verified === true;

    if (email && emailVerified && email.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
      return new Response(JSON.stringify({ access: true, url: CHANNEL_URL }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    return new Response(JSON.stringify({ access: false }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
};
