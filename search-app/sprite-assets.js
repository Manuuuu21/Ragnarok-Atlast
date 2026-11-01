// Support both the installed catalog and the sprite/ folder produced by the
// GRF exporter. All paths are relative to this app, even after it is renamed.
const roots = ['img/sprites/', 'img/sprite/'].map(path => new URL(path, import.meta.url));

export async function loadSpriteCatalog(fetcher = fetch) {
  for (const root of roots) {
    try {
      const response = await fetcher(new URL('manifest.json', root), { cache: 'no-cache' });
      if (!response.ok) continue;
      const manifest = await response.json();
      if (manifest.version !== 1 || !manifest.characters || !manifest.headgears) continue;
      return { manifest, root };
    } catch {
      // A missing or invalid older installation must not hide a valid export.
    }
  }
  throw new Error('Headgear preview assets are unavailable. Extract data.grf, then copy its sprite folder into this search app’s img folder.');
}
