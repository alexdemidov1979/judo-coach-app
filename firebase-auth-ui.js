/* Judo Coach — Firebase Email/Password UI, без клубов и ролей.
 * Каждый email+пароль аккаунт сразу получает полный доступ к своим данным. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  function message(text, type = '') {
    const el = $('auth-message');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'jc-auth-message' + (type ? ` ${type}` : '');
  }

  function errorText(e) {
    const map = {
      'auth/email-already-in-use': 'Этот email уже зарегистрирован. Используйте вход.',
      'auth/invalid-email': 'Неверный формат email.',
      'auth/weak-password': 'Пароль слишком простой. Используйте минимум 6 символов.',
      'auth/invalid-credential': 'Неверный email или пароль.',
      'auth/user-not-found': 'Пользователь с таким email не найден.',
      'auth/wrong-password': 'Неверный email или пароль.',
      'auth/too-many-requests': 'Слишком много попыток. Попробуйте позже.',
      'auth/network-request-failed': 'Нет соединения с Firebase. В России это иногда бывает без VPN — попробуйте включить VPN и повторить.',
      'permission-denied': 'Firebase отклонил действие по правилам безопасности.',
    };
    return map[e?.code] || e?.message || String(e || 'Неизвестная ошибка');
  }

  function showMode(mode) {
    const login = mode === 'login';
    $('auth-login-form').style.display = login ? '' : 'none';
    $('auth-register-form').style.display = login ? 'none' : '';
    $('auth-tab-login').classList.toggle('active', login);
    $('auth-tab-register').classList.toggle('active', !login);
    message('');
  }

  function renderAuthState(detail) {
    const user = detail?.user || null;
    const loggedOut = $('auth-logged-out');
    const loggedIn = $('auth-logged-in');
    const roleBadge = $('main-auth-role');

    if (user) {
      loggedOut.style.display = 'none';
      loggedIn.style.display = '';
      $('main-auth-user').textContent = `👤 ${user.displayName || user.email || 'Пользователь'}`;
      $('main-auth-club').textContent = '';
      if (roleBadge) roleBadge.style.display = 'none';
      $('main-auth-status').textContent = 'Вход выполнен';

      const migration = $('auth-migration-password');
      if (migration) migration.style.display = 'none';
    } else {
      loggedOut.style.display = '';
      loggedIn.style.display = 'none';
      if (roleBadge) roleBadge.style.display = 'none';
      $('main-auth-status').textContent = 'Вход и регистрация · email + пароль';
    }
  }

  async function init() {
    if (!window.JudoFirebase) {
      window.addEventListener('judo:firebase-ready', init, { once: true });
      return;
    }

    $('auth-tab-login')?.addEventListener('click', () => showMode('login'));
    $('auth-tab-register')?.addEventListener('click', () => showMode('register'));

    $('auth-login-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      message('Выполняем вход…');
      try {
        await window.JudoFirebase.signIn(
          $('auth-login-email').value,
          $('auth-login-password').value
        );
        message('');
      } catch (err) {
        message(errorText(err), 'error');
      }
    });

    $('auth-register-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const password = $('auth-register-password').value;
      const password2 = $('auth-register-password2').value;
      if (password !== password2) {
        message('Пароли не совпадают.', 'error');
        return;
      }

      try {
        message('Создаём аккаунт…');
        await window.JudoFirebase.register({
          email: $('auth-register-email').value,
          password,
          displayName: $('auth-register-name').value
        });
        message('Аккаунт создан. Добро пожаловать!', 'success');
      } catch (err) {
        message(errorText(err), 'error');
      }
    });

    $('auth-reset-password')?.addEventListener('click', async () => {
      const email = $('auth-login-email').value.trim();
      if (!email) {
        message('Сначала введите email.', 'error');
        return;
      }
      try {
        await window.JudoFirebase.resetPassword(email);
        message('Письмо для сброса пароля отправлено.', 'success');
      } catch (e) {
        message(errorText(e), 'error');
      }
    });

    $('main-firebase-signout')?.addEventListener('click', async () => {
      try { await window.JudoFirebase.signOut(); } catch (e) { message(errorText(e), 'error'); }
    });

    $('main-firebase-sync')?.addEventListener('click', () => {
      window.firebaseCloudUpload?.(false);
    });

    $('auth-migration-password-btn')?.addEventListener('click', async () => {
      const p1 = $('auth-migration-password-input')?.value || '';
      const p2 = $('auth-migration-password2')?.value || '';
      const user = window.JudoFirebase.getCurrentUser?.();
      if (!user?.email) { message('Текущий Firebase аккаунт не найден.', 'error'); return; }
      if (p1.length < 6 || p1 !== p2) { message('Пароли должны совпадать и содержать минимум 6 символов.', 'error'); return; }
      try {
        await window.JudoFirebase.linkPasswordToCurrentUser(user.email, p1);
        $('auth-migration-password').style.display = 'none';
        message('Пароль добавлен. Теперь можно входить по email и паролю.', 'success');
      } catch (e) {
        message(errorText(e), 'error');
      }
    });

    window.addEventListener('judo:firebase-auth-state', e => {
      renderAuthState(e.detail || {});
    });

    // Если состояние авторизации уже пришло до инициализации этого модуля —
    // читаем его напрямую.
    const user = window.JudoFirebase.getCurrentUser?.();
    if (user) {
      renderAuthState({ user });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
