// ================= JUDOCOACH FIRSTVDS BACKEND =================
// Frontend adapter with the same public API as the legacy JudoFirebase object.
// No server secrets are stored here. Configure window.JUDOCOACH_API_BASE or
// <meta name="judocoach-api" content="https://api.example.ru"> in index.html.
(function(){
  'use strict';

  const meta = document.querySelector('meta[name="judocoach-api"]');
  const API_BASE = String(window.JUDOCOACH_API_BASE || meta?.content || '').replace(/\/+$/, '');
  const TOKEN_KEY = 'jc_firstvds_token';
  const USER_KEY = 'jc_firstvds_user';
  let currentUser = null;

  try {
    const cached = localStorage.getItem(USER_KEY);
    if (cached) currentUser = JSON.parse(cached);
  } catch (_) {}

  function normalizeUser(user){
    if (!user) return null;
    return { ...user, uid: user.uid || user.id, isPro: !!(user.isPro ?? user.is_pro) };
  }

  function saveUser(user){
    user = normalizeUser(user);
    currentUser = user || null;
    try {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
    } catch (_) {}
  }
  function token(){ try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; } }
  function saveToken(value){ try { value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY); } catch (_) {} }

  function emit(user){
    window.dispatchEvent(new CustomEvent('judo:firebase-auth-state', { detail: { user, profile: user } }));
    window.dispatchEvent(new Event('judo:firebase-ready'));
  }

  function apiUrl(path){
    if (!API_BASE) throw new Error('Backend FirstVDS ещё не настроен. Укажите JUDOCOACH_API_BASE.');
    return API_BASE + path;
  }

  async function request(path, options={}){
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    const t = token();
    if (t) headers.set('Authorization', `Bearer ${t}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(options.timeout || 20000));
    try {
      const response = await fetch(apiUrl(path), { ...options, headers, signal: controller.signal });
      let body = null;
      try { body = await response.json(); } catch (_) {}
      if (!response.ok) {
        const err = new Error(body?.error || `Ошибка сервера (${response.status})`);
        err.status = response.status;
        throw err;
      }
      return body || {};
    } catch (e) {
      if (e?.name === 'AbortError') throw new Error('Сервер не ответил вовремя. Проверьте соединение.');
      throw e;
    } finally { clearTimeout(timer); }
  }

  async function signIn(email, password){
    const data = await request('/api/auth/login', { method:'POST', body:JSON.stringify({email, password}) });
    saveToken(data.token);
    saveUser(data.user);
    emit(currentUser);
    return currentUser;
  }

  async function register({email, password, displayName}){
    const data = await request('/api/auth/register', { method:'POST', body:JSON.stringify({email, password, displayName}) });
    saveToken(data.token);
    saveUser(data.user);
    emit(currentUser);
    return currentUser;
  }

  async function signOut(){
    saveToken('');
    saveUser(null);
    emit(null);
  }

  async function resetPassword(){
    throw new Error('Автоматический сброс пароля через email ещё не подключён. Обратитесь к администратору.');
  }

  async function linkPasswordToCurrentUser(_email, newPassword){
    if (!currentUser) throw new Error('Нужно войти в аккаунт.');
    await request('/api/auth/change-password', { method:'POST', body:JSON.stringify({password:newPassword}) });
  }

  async function getUserProfile(){
    if (!token()) return currentUser;
    try {
      const data = await request('/api/me');
      if (data.user) saveUser(data.user);
    } catch (_) {}
    return currentUser;
  }

  async function uploadDataDump(entries){
    if (!currentUser || !token()) throw new Error('Нужно войти в аккаунт.');
    const data = Object.fromEntries((entries || []).map(({key,value}) => [key,value]));
    return request('/api/data', { method:'PUT', body:JSON.stringify({data}) });
  }

  async function downloadDataDump(){
    if (!currentUser || !token()) throw new Error('Нужно войти в аккаунт.');
    const result = await request('/api/data');
    return result.data || {};
  }

  async function setProStatus(isPro){
    // Pro remains a server-controlled field. Do not let an ordinary client
    // modify it. Admin billing/role tools can be added later.
    if (currentUser) {
      currentUser.is_pro = !!isPro;
      currentUser.isPro = !!isPro;
      saveUser(currentUser);
    }
  }

  async function createCompetitionShare(tokenValue, competitionId, expiresAt=null){
    return request('/api/competition/share', { method:'POST', body:JSON.stringify({token:tokenValue, competitionId, expiresAt}) });
  }
  async function getCompetitionReports(){
    const data = await request('/api/competition/reports');
    return data.reports || [];
  }
  async function setCompetitionReportStatus(id, status){
    return request(`/api/competition/reports/${encodeURIComponent(id)}/status`, { method:'PATCH', body:JSON.stringify({status}) });
  }
  async function deleteCompetitionReport(id){
    return request(`/api/competition/reports/${encodeURIComponent(id)}`, { method:'DELETE' });
  }
  async function submitPublicCompetitionReport(payload){
    return request('/api/competition/reports/public', { method:'POST', body:JSON.stringify(payload) });
  }

  window.JudoCoachAPI = { createCompetitionShare, getCompetitionReports, setCompetitionReportStatus, deleteCompetitionReport, submitPublicCompetitionReport };

  window.JudoFirebase = {
    signIn, register, resetPassword, linkPasswordToCurrentUser,
    signOut, getCurrentUser: () => currentUser, getUserProfile,
    setProStatus, uploadDataDump, downloadDataDump,
    appCheckReady: () => false
  };

  async function restore(){
    if (!token()) { emit(currentUser); return; }
    try {
      const data = await request('/api/me');
      saveUser(data.user || null);
      emit(currentUser);
    } catch (e) {
      saveToken('');
      saveUser(null);
      emit(null);
    }
  }

  restore();
})();
