/* Judo Coach Android bridge.
 * Works silently in browser/PWA and uses the native bridge when running in APK.
 */
(function () {
  const native = () => window.JudoAndroid || null;

  window.JudoNative = Object.freeze({
    isAndroidApp() {
      return !!native();
    },
    vibrate(ms = 80) {
      try {
        if (native()?.vibrate) return !!native().vibrate(Number(ms) || 80);
      } catch (_) {}
      try { return !!navigator.vibrate?.(Number(ms) || 80); } catch (_) { return false; }
    },
    setOrientation(mode = 'portrait') {
      try {
        if (native()?.setOrientation) return !!native().setOrientation(String(mode));
      } catch (_) {}
      try {
        if (screen.orientation?.lock) return screen.orientation.lock(mode === 'landscape' ? 'landscape' : 'portrait').then(() => true).catch(() => false);
      } catch (_) {}
      return false;
    },
    printHtml(html, title = 'Judo Coach') {
      try {
        if (native()?.printHtml) {
          native().printHtml(String(html), String(title));
          return true;
        }
      } catch (e) { console.error('Native print failed', e); }
      return false;
    },
    openBundledFile(path) {
      try {
        if (native()?.openBundledFile) return !!native().openBundledFile(String(path));
      } catch (_) {}
      return false;
    }
  });
})();
