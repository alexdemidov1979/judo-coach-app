/**
 * Unified video source model.
 * Supported now: RuTube and Google Drive.
 */
export function normalizeVideoSource(source = {}) {
  const type = source.type === 'google-drive' ? 'google-drive' : 'rutube';
  return {
    type,
    url: String(source.url || ''),
    title: String(source.title || ''),
    duration: source.duration ?? null,
    enabled: source.enabled !== false
  };
}

export function techniqueVideoModel(technique = {}) {
  return {
    rutube: technique.video ? normalizeVideoSource({
      type: 'rutube',
      url: technique.video,
      title: technique.videoTitle || ''
    }) : null,
    googleDrive: technique.video2 ? normalizeVideoSource({
      type: 'google-drive',
      url: technique.video2,
      title: technique.video2Title || ''
    }) : null
  };
}
