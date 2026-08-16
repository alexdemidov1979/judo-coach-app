// ================= YANDEX BACKEND (замена firebase-init.js) =================
// Сохраняет ТОТ ЖЕ публичный интерфейс window.JudoFirebase, которым
// пользуются roster.js, backup-sync.js, ai-coach.js, firebase-auth-ui.js,
// pro-features.js — поэтому их не пришлось переписывать.
//
// Заполните API_BASE_URL адресом вашего Yandex API Gateway
// (см. docs/YANDEX_MIGRATION.md).
const API_BASE_URL = 'https://ВАШ-API-GATEWAY.apigw.yandexcloud.net';

const TOKEN_KEY = 'jc_yandex_token';
const USER_KEY = 'jc_yandex_user'; // {uid,email,isPro} — кэш для синхронного getCurrentUser()

let currentUser = null;
try {
  const cached = localStorage.getItem(USER_KEY);
  if (cached) currentUser = JSON.parse(cached);
} catch (e) {}

function saveSession(user, token) {
  currentUser = user;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (e) {}
}
function clearSession() {
  currentUser = null;
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) {}
}
function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (!token) throw new Error('Нужно войти в аккаунт.');
    headers['Authorization'] = 'Bearer ' + token;
  }
  const res = await fetch(API_BASE_URL + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка сервера (${res.status})`);
  return data;
}

function emitAuthState(user) {
  window.dispatchEvent(new CustomEvent('judo:firebase-auth-state', { detail: { user, profile: user } }));
  window.dispatchEvent(new Event('judo:firebase-ready'));
}

// ---- Auth ----
async function signIn(email, password) {
  const data = await api('/auth/login', { method: 'POST', body: { email, password }, auth: false });
  const user = { uid: data.uid, email: data.email, isPro: !!data.isPro };
  saveSession(user, data.token);
  emitAuthState(user);
  return user;
}
async function register({ email, password, displayName }) {
  const data = await api('/auth/register', { method: 'POST', body: { email, password, displayName }, auth: false });
  const user = { uid: data.uid, email: data.email, isPro: false };
  saveSession(user, data.token);
  emitAuthState(user);
  return user;
}
async function resetPassword() {
  // Yandex-бэкенд пока не отправляет письма для сброса пароля — это
  // отдельная задача (нужна интеграция с почтовым сервисом). Пока что
  // сообщаем об этом честно вместо тихого "ничего не произошло".
  throw new Error('Восстановление пароля по почте пока не подключено на новом сервере. Обратитесь к разработчику.');
}
async function linkPasswordToCurrentUser() {
  throw new Error('Смена пароля из аккаунта пока не реализована на новом сервере.');
}
function signOut() {
  clearSession();
  emitAuthState(null);
  return Promise.resolve();
}
function getCurrentUser() { return currentUser; }

async function getUserProfile() {
  if (!currentUser) return null;
  try { return await api('/profile'); } catch (e) { return currentUser; }
}
async function setProStatus(isPro) {
  if (!currentUser) return;
  await api('/profile/pro', { method: 'POST', body: { isPro } });
  currentUser.isPro = !!isPro;
  try { localStorage.setItem(USER_KEY, JSON.stringify(currentUser)); } catch (e) {}
}

// ---- Данные (упрощённый dump/apply — см. правки в backup-sync.js) ----
async function uploadDataDump(entries) {
  return api('/data/upload', { method: 'POST', body: { entries } });
}
async function downloadDataDump() {
  const res = await api('/data/download');
  return res.data || {};
}

// ---- ИИ-тренер ----
async function checkAiUsage(mode) {
  return api('/ai/usage', { method: 'POST', body: { mode } });
}
async function createAiChat(mode, title) {
  const res = await api('/ai/chats', { method: 'POST', body: { mode, title } });
  return res.id;
}
async function listAiChats() {
  const res = await api('/ai/chats');
  return res.chats || [];
}
async function listAiMessages(chatId) {
  const res = await api(`/ai/chats/${chatId}/messages`);
  return res.messages || [];
}
async function sendAiMessage(chatId, systemPrompt, history, message) {
  const res = await api('/ai/chat', { method: 'POST', body: { chatId, systemPrompt, history, message } });
  return res.text;
}

window.JudoFirebase = {
  signIn, register, resetPassword, linkPasswordToCurrentUser,
  signOut, getCurrentUser, getUserProfile, setProStatus,
  uploadDataDump, downloadDataDump,
  checkAiUsage, createAiChat, listAiChats, listAiMessages, sendAiMessage,
  appCheckReady: () => false
};

// Если сессия уже была сохранена раньше — сообщаем остальному приложению
// сразу при загрузке страницы (аналог onAuthStateChanged при старте).
if (currentUser) emitAuthState(currentUser);
else { window.dispatchEvent(new Event('judo:firebase-ready')); }
