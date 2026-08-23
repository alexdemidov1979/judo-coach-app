// ================= SUPABASE BACKEND (замена yandex-backend.js) =================
// Сохраняет ТОТ ЖЕ публичный интерфейс window.JudoFirebase, которым
// пользуются roster.js, backup-sync.js, firebase-auth-ui.js,
// pro-features.js — поэтому их не пришлось переписывать.
//
// Заполните SUPABASE_URL и SUPABASE_ANON_KEY данными вашего проекта
// (Supabase Dashboard → Project Settings → API). Оба значения публичные,
// их можно смело держать в коде фронтенда — доступ к данным ограничен
// правилами RLS в базе (см. supabase/sql/schema.sql).
const SUPABASE_URL = 'https://aiwkzolbyuvnmdypwzzg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NfXrK4ZdrH1f_Pdo0mhasA_BH0GmcM8';

// supabase-js подключается локальным файлом supabase-js.vendor.js перед
// этим скриптом (см. index.html) — не через внешний CDN, чтобы приложение
// не зависало на старте, если CDN недоступен без VPN. Создаёт глобальную
// переменную window.supabase.
let sb = null;
try {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.error('Supabase client init failed:', e);
}

const USER_KEY = 'jc_supabase_user'; // {uid,email,isPro} — кэш для синхронного getCurrentUser()

let currentUser = null;
try {
  const cached = localStorage.getItem(USER_KEY);
  if (cached) currentUser = JSON.parse(cached);
} catch (e) {}

function saveUserCache(user) {
  currentUser = user;
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch (e) {}
}
function clearUserCache() {
  currentUser = null;
  try { localStorage.removeItem(USER_KEY); } catch (e) {}
}
function emitAuthState(user) {
  window.dispatchEvent(new CustomEvent('judo:firebase-auth-state', { detail: { user, profile: user } }));
  window.dispatchEvent(new Event('judo:firebase-ready'));
}

async function buildUser(sessionUser) {
  if (!sessionUser) return null;
  let isPro = false;
  try {
    const { data } = await sb.from('profiles').select('is_pro').eq('id', sessionUser.id).single();
    isPro = !!(data && data.is_pro);
  } catch (e) {}
  return { uid: sessionUser.id, email: sessionUser.email, isPro };
}

// ---- Auth ----
async function signIn(email, password) {
  if (!sb) throw new Error('Библиотека Supabase не загрузилась. Проверьте подключение к интернету.');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message || 'Ошибка входа.');
  const user = await buildUser(data.user);
  saveUserCache(user);
  emitAuthState(user);
  return user;
}

async function register({ email, password, displayName }) {
  if (!sb) throw new Error('Библиотека Supabase не загрузилась. Проверьте подключение к интернету.');
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { display_name: displayName || '' } }
  });
  if (error) throw new Error(error.message || 'Ошибка регистрации.');

  // В Supabase при включённом подтверждении email пользователь создаётся,
  // но активной сессии ещё нет. Нельзя считать такой аккаунт вошедшим:
  // иначе синхронизация могла попытаться работать с uid без действующей сессии.
  if (!data?.session || !data?.user) {
    clearUserCache();
    window.dispatchEvent(new CustomEvent('judo:firebase-auth-pending', {
      detail: { email, needsEmailConfirmation: true }
    }));
    return { uid: null, email, isPro: false, pendingVerification: true };
  }

  const user = await buildUser(data.user);
  saveUserCache(user);
  emitAuthState(user);
  return user;
}

async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email);
  if (error) throw new Error(error.message || 'Не удалось отправить письмо для сброса пароля.');
}

async function linkPasswordToCurrentUser(_email, newPassword) {
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message || 'Не удалось сменить пароль.');
}

async function signOut() {
  try { await sb.auth.signOut(); } catch (e) {}
  clearUserCache();
  emitAuthState(null);
}

function getCurrentUser() { return currentUser; }

async function getUserProfile() {
  if (!currentUser) return null;
  try {
    const { data } = await sb.from('profiles').select('is_pro, display_name').eq('id', currentUser.uid).single();
    if (data) {
      currentUser.isPro = !!data.is_pro;
      saveUserCache(currentUser);
    }
  } catch (e) {}
  return currentUser;
}

// Статус Pro нельзя менять из клиентского JavaScript.
// Раньше эта функция обновляла profiles.is_pro напрямую, что позволяло
// авторизованному пользователю потенциально выдать самому себе Pro через API.
// Оставляем совместимый метод, но он больше не пишет в Supabase. Реальная
// разблокировка должна выполняться доверенным серверным/RuStore-процессом.
async function setProStatus(isPro) {
  if (!currentUser) return;
  currentUser.isPro = !!isPro;
  saveUserCache(currentUser);
}

// ---- Данные (dump/apply — таблица user_data: ключ-значение на пользователя) ----
async function uploadDataDump(entries) {
  if (!currentUser) throw new Error('Нужно войти в аккаунт.');
  const rows = (entries || []).map(({ key, value }) => ({
    uid: currentUser.uid, key, value, updated_at: new Date().toISOString()
  }));
  if (!rows.length) return { ok: true };
  const { error } = await sb.from('user_data').upsert(rows, { onConflict: 'uid,key' });
  if (error) throw new Error(error.message || 'Ошибка выгрузки данных.');
  return { ok: true };
}

async function downloadDataDump() {
  if (!currentUser) throw new Error('Нужно войти в аккаунт.');
  const { data, error } = await sb.from('user_data').select('key, value').eq('uid', currentUser.uid);
  if (error) throw new Error(error.message || 'Ошибка загрузки данных.');
  const result = {};
  (data || []).forEach((row) => { result[row.key] = row.value; });
  return result;
}

window.JudoFirebase = {
  signIn, register, resetPassword, linkPasswordToCurrentUser,
  signOut, getCurrentUser, getUserProfile, setProStatus,
  uploadDataDump, downloadDataDump,
  appCheckReady: () => false
};

// Восстанавливаем сессию при загрузке страницы (аналог onAuthStateChanged).
if (sb) {
  sb.auth.getSession().then(async ({ data }) => {
    if (data.session && data.session.user) {
      const user = await buildUser(data.session.user);
      saveUserCache(user);
      emitAuthState(user);
    } else {
      clearUserCache();
      window.dispatchEvent(new Event('judo:firebase-ready'));
    }
  }).catch(() => {
    window.dispatchEvent(new Event('judo:firebase-ready'));
  });

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      clearUserCache();
      emitAuthState(null);
    }
  });
} else {
  // Библиотека Supabase не загрузилась — приложение продолжает работать
  // локально (IndexedDB), просто без входа в аккаунт и синхронизации.
  window.dispatchEvent(new Event('judo:firebase-ready'));
}
