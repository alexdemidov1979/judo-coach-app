/**
 * Judo Coach 4.0 — central runtime configuration.
 * Keep secrets out of this file. Public OAuth client IDs are configuration;
 * client secrets/tokens must never be committed here.
 */
export const APP_CONFIG = Object.freeze({
  appVersion: '4.2.0',
  schemaVersion: 4,
  product: 'Judo Coach',
  storage: {
    indexedDbName: 'judocoach_db',
    indexedDbStore: 'kv'
  },
  sync: {
    provider: 'firstvds',
    table: 'user_data',
    apiBase: '',
    offlineCache: true
  },
  video: {
    sources: ['rutube', 'google-drive']
  }
});
