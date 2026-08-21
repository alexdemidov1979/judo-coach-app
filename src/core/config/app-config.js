/**
 * Judo Coach 4.0 — central runtime configuration.
 * Keep secrets out of this file. Public OAuth client IDs are configuration;
 * client secrets/tokens must never be committed here.
 */
export const APP_CONFIG = Object.freeze({
  appVersion: '4.0.0',
  schemaVersion: 2,
  product: 'Judo Coach',
  storage: {
    indexedDbName: 'judocoach_db',
    indexedDbStore: 'kv'
  },
  sync: {
    provider: 'supabase',
    table: 'user_data',
    offlineCache: true
  },
  video: {
    sources: ['rutube', 'google-drive']
  }
});
