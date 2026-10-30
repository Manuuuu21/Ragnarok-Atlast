/* Item, monster, and map searches share local data and links between results. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const backgroundToggle = $('#background-toggle');
  if (backgroundToggle) backgroundToggle.onclick = () => {
    const paused = document.body.classList.toggle('background-paused');
    backgroundToggle.setAttribute('aria-pressed', String(paused));
    backgroundToggle.textContent = paused ? 'Play background' : 'Pause background';
  };
  const dropSourcePageSize = 10;
  const mapSpawnPageSize = 10;
  const headgearLocations = new Map([
    ['Headgear (Top)', ['Head_Top', 'Costume_Head_Top']],
    ['Headgear (Middle)', ['Head_Mid', 'Costume_Head_Mid']],
    ['Headgear (Low)', ['Head_Low', 'Costume_Head_Low']]
  ]);
  const costumeLocations = new Map([
    ['Costume Garment', 'Costume_Garment'],
    ['Costume Headgear (Low)', 'Costume_Head_Low'],
    ['Costume Headgear (Middle)', 'Costume_Head_Mid'],
    ['Costume Headgear (Top)', 'Costume_Head_Top']
  ]);
  const databases = {};
  const loading = {};
  const state = { kind: 'item', query: '', category: '', sort: 'id', page: 1, view: 'detailed' };
  const pageSize = () => state.view === 'compact' ? 20 : 6;
  let matches = [];
  let searchTimer;
  let editingSearch = false;
  let activationId = 0;
  let viewReady = false;
  let scrollTimer;
  history.scrollRestoration = 'manual';
  function routeURL(route) {
    const url = new URL(location.href);
    for (const key of ['kind', 'q', 'category', 'sort', 'page', 'view']) url.searchParams.delete(key);
    url.searchParams.set('kind', route.kind);
    url.searchParams.set('view', route.view || state.view);
    if (route.query) url.searchParams.set('q', route.query);
    if (route.category) url.searchParams.set('category', route.category);
    if (route.sort && route.sort !== 'id') url.searchParams.set('sort', route.sort);
    if (route.page > 1) url.searchParams.set('page', route.page);
    return url.href;
  }
  function saveView() {
    if (!viewReady) return;
    const expanded = {};
    document.querySelectorAll('[id^="drop-sources-"], [id^="map-spawn-rows-"]').forEach(list => {
      expanded[list.id] = list.querySelectorAll('.drop-row:not([hidden]), .map-spawn-row:not([hidden])').length;
    });
    const openRecords = [...document.querySelectorAll('.compact-result[open]')].map(row => row.dataset.recordId);
    history.replaceState({ ...history.state, ragnarokView: { x: scrollX, y: scrollY, expanded, openRecords } }, '', location.href);
  }
  function writeHistory(mode, capture = true) {
    if (mode === 'none') return;
    const url = routeURL(state);
    if (url === location.href) return;
    if (capture) saveView();
    history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', url);
  }
  async function restoreRoute(restoreExpanded = true) {
    editingSearch = false;
    const params = new URLSearchParams(location.search);
    const page = Number(params.get('page'));
    const view = history.state?.ragnarokView;
    Object.assign(state, {
      kind: ['monster', 'map'].includes(params.get('kind')) ? params.get('kind') : 'item',
      query: params.get('q') || '', category: params.get('category') || '',
      sort: ['name', 'name-desc'].includes(params.get('sort')) ? params.get('sort') : 'id',
      page: Number.isSafeInteger(page) && page > 0 ? page : 1,
      view: ['compact', 'detailed'].includes(params.get('view')) ? params.get('view') : 'detailed'
    });
    $('#search').value = state.query;
    $('#sort').value = state.sort;
    const pending = activate(state.kind, false, 'none');
    const currentActivation = activationId;
    await pending;
    if (currentActivation !== activationId) return;
    // Keep the selected view explicit for links and Back/Forward navigation.
    if (!params.has('view')) writeHistory('replace', false);
    for (const row of document.querySelectorAll('.compact-result')) {
      if (restoreExpanded && Array.isArray(view?.openRecords)) {
        row.open = view.openRecords.includes(row.dataset.recordId);
        if (row.open) fillCompactDetails(row);
      }
    }
    for (const [id, count] of Object.entries(restoreExpanded ? view?.expanded || {} : {})) {
      const list = document.getElementById(id);
      if (!list) continue;
      [...list.querySelectorAll('.drop-row, .map-spawn-row')].slice(0, count).forEach(row => { row.hidden = false; });
      if (!list.querySelector('.drop-row[hidden], .map-spawn-row[hidden]')) list.closest('section').querySelector('[data-show-more-drops], [data-show-more-maps]')?.remove();
    }
    requestAnimationFrame(() => {
      if (currentActivation === activationId) window.scrollTo(view?.x || 0, view?.y || 0);
    });
  }
  const number = value => Number(value).toLocaleString();
  const clean = value => String(value ?? '').replace(/\^[0-9a-f]{6}/gi, '').replace(/<[^>]*>/g, '');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const normalize = value => clean(value).toLocaleLowerCase().replace(/[_\s]+/g, ' ').trim();
  const placeholder = '<span class="missing-art"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 3-3 5 5"/></svg><span>Image unavailable</span></span>';
  const resolvedImages = new Map();
  const transparentSprites = new Map();
  document.addEventListener('load', event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.imageKey) {
      resolvedImages.set(img.dataset.imageKey, img.getAttribute('src'));
      delete img.dataset.imageKey;
      delete img.dataset.imageFallbacks;
    }
    if (!/\.bmp$/i.test(img.getAttribute('src') || '')) return;
    const original = img.getAttribute('src');
    if (transparentSprites.has(original)) { img.src = transparentSprites.get(original); return; }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(img, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      let changed = false;
      for (let i = 0; i < pixels.data.length; i += 4) {
        if (pixels.data[i] === 255 && pixels.data[i+1] === 0 && pixels.data[i+2] === 255) {
          pixels.data[i+3] = 0; changed = true;
        }
      }
      if (!changed) return;
      context.putImageData(pixels, 0, 0);
      const png = canvas.toDataURL('image/png');
      transparentSprites.set(original, png); img.src = png;
    } catch { /* Keep the original BMP when the browser restricts local-file canvas access. */ }
  }, true);
  function assetPaths(dir, filename) {
    if (!filename) return [];
    const name = String(filename);
    // The bundled files use lowercase ASCII. Preserve the non-ASCII resource names.
    const lowercase = name.replace(/[A-Z]/g, letter => letter.toLowerCase());
    return [...new Set([lowercase, name])].map(value => `img/${dir}/${encodeURIComponent(value)}`);
  }
  function imagePaths(record, kind, large = false) {
    if (kind === 'map') return ['bmp', 'gif', 'png', 'webp', 'jpg', 'jpeg'].flatMap(extension => assetPaths('map', `${record.id}.${extension}`));
    if (kind === 'monster') return assetPaths('monster', record.gif);
    const resource = record.client?.identifiedResourceName || record.client?.unidentifiedResourceName;
    const filename = resource ? `${resource}.bmp` : '';
    return large ? [...assetPaths('cardbmp', record.cardBmp), ...assetPaths('collection', filename)] : assetPaths('item', filename);
  }
  function art(record, kind, large = false) {
    const paths = imagePaths(record, kind, large);
    if (!paths.length) return placeholder;
    const key = JSON.stringify(paths);
    const resolved = resolvedImages.get(key);
    if (resolved === null) return placeholder;
    const path = resolved || paths[0];
    const fallbacks = resolved ? [] : paths.slice(1);
    return `<img src="${escape(path)}" data-image-key="${escape(key)}" data-image-fallbacks="${escape(JSON.stringify(fallbacks))}" alt="${escape(clean(record.name))}${large ? ' illustration' : ' icon'}" loading="lazy">`;
  }
  document.addEventListener('error', event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const fallbacks = JSON.parse(img.dataset.imageFallbacks || '[]');
    if (fallbacks.length) {
      const next = fallbacks.shift();
      img.dataset.imageFallbacks = JSON.stringify(fallbacks);
      img.src = next;
      return;
    }
    if (img.dataset.imageKey) resolvedImages.set(img.dataset.imageKey, null);
    if (img.parentElement) img.parentElement.innerHTML = placeholder;
  }, true);
  function loadDatabase(kind) {
    if (databases[kind]) return Promise.resolve(databases[kind]);
    if (loading[kind]) return loading[kind];
    loading[kind] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `lib/${kind}-data.js?v=${Date.now()}`;
      script.onload = () => {
        try {
          const data = kind === 'item' ? itemDATA : kind === 'monster' ? monsterDATA : mapDATA;
          const records = Object.values(data);
          const searchKeys = new Map(records.map(record => [record.id, normalize(`${record.id} ${record.name} ${record.aegisName}`)]));
          const byAegis = new Map(records.filter(record => record.aegisName).map(record => [record.aegisName, record]));
          databases[kind] = { data, records, searchKeys, byAegis };
          if (kind === 'monster') {
            const droppedBy = new Map();
            for (const monster of records) {
              for (const field of ['Drops', 'MvpDrops']) {
                for (const drop of monster.server?.[field] || []) {
                  if (!drop.Item || drop.Rate === 0) continue;
                  if (!droppedBy.has(drop.Item)) droppedBy.set(drop.Item, []);
                  droppedBy.get(drop.Item).push({ monster, rate: drop.Rate, mvp: field === 'MvpDrops' });
                }
              }
            }
            for (const sources of droppedBy.values()) {
              sources.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
            }
            databases[kind].droppedBy = droppedBy;
          }
          $(`#${kind}-count`).textContent = number(records.length);
          resolve(databases[kind]);
        } catch (error) { delete loading[kind]; reject(error); }
      };
      script.onerror = () => { script.remove(); delete loading[kind]; reject(new Error(`Could not load ${kind} data.`)); };
      document.head.append(script);
    });
    return loading[kind];
  }
  function category(record) {
    const value = state.kind === 'item' ? record.server?.Type : record.server?.Race;
    const canonical = { delayconsume: 'DelayConsume', petarmor: 'PetArmor', petegg: 'PetEgg', shadowgear: 'ShadowGear' };
    return canonical[value?.toLowerCase()] || value || 'Unspecified';
  }
  function buildFilters() {
    if (state.kind === 'map') {
      state.category = '';
      $('#category').innerHTML = '<option value="">All maps</option>';
      return;
    }
    const values = [...new Set(databases[state.kind].records.map(category))].sort();
    if (state.kind === 'item') {
      for (const value of ['Garment', 'Shield', ...headgearLocations.keys(), ...costumeLocations.keys()]) if (!values.includes(value)) values.push(value);
      values.sort();
    }
    if (state.kind === 'monster') values.unshift('MVP');
    $('#category').innerHTML = `<option value="">${state.kind === 'item' ? 'All types' : 'All races'}</option>` + values.map(value => `<option value="${escape(value)}">${escape(value)}</option>`).join('');
    $('#category').value = state.category;
  }
  async function activate(kind, reset = true, historyMode = 'push') {
    clearTimeout(searchTimer);
    clearTimeout(scrollTimer);
    editingSearch = false;
    const currentActivation = ++activationId;
    if (historyMode !== 'none') saveView();
    viewReady = false;
    state.kind = kind;
    if (reset) { state.category = ''; state.page = 1; }
    document.querySelectorAll('.tab').forEach(tab => {
      const active = tab.dataset.kind === kind;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    $('#results-panel').setAttribute('aria-labelledby', `${kind}-tab`);
    $('#search').placeholder = `Search ${kind}s by name or ID…`;
    $('#search-form label[for="search"]').textContent = kind === 'map' ? 'Search by map name' : 'Search by name, ID, or Aegis name';
    if (kind === 'map') $('#search').placeholder = 'Search maps by name, e.g. prt_maze03…';
    $('#category').hidden = $('#category-label').hidden = kind === 'map';
    $('#sort option[value="id"]').textContent = kind === 'map' ? 'Map: A–Z' : 'ID: low to high';
    $('#category-label').textContent = kind === 'item' ? 'Item type' : 'Monster race';
    $('#category').disabled = true;
    document.querySelectorAll('[data-view]').forEach(button => {
      button.disabled = true;
      button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
    });
    $('#pagination').hidden = true;
    $('#results').setAttribute('aria-busy', 'true');
    $('#results-title').textContent = `All ${kind}s`;
    $('#result-summary').textContent = 'Loading database…';
    $('#results').innerHTML = `<div class="empty-state"><span class="loading-dot"></span><h3>Opening the ${kind} database</h3><p>Preparing your adventurer’s reference…</p></div>`;
    try {
      await Promise.all(['item', 'monster', 'map'].map(loadDatabase));
      if (currentActivation !== activationId) return;
      if (!databases.map.spawnsLoaded) buildMapDatabase();
      buildFilters();
      $('#category').disabled = false;
      document.querySelectorAll('[data-view]').forEach(button => { button.disabled = false; });
      search(historyMode, false);
      viewReady = true;
    } catch {
      if (currentActivation !== activationId) return;
      viewReady = true;
      $('#result-summary').textContent = 'Database unavailable';
      $('#results').setAttribute('aria-busy', 'false');
      $('#results').innerHTML = `<div class="empty-state"><h3>The database could not be opened</h3><p>Check that lib/item-data.js, lib/monster-data.js, and lib/map-data.js are available and try again.</p><button class="primary" id="retry">Try again</button></div>`;
      $('#retry').onclick = () => activate(kind, false);
    }
  }
  function search(historyMode = 'push', capture = true) {
    state.query = $('#search').value.trim();
    state.category = $('#category').value;
    state.sort = $('#sort').value;
    if (!databases.item || !databases.monster?.droppedBy) return;
    const db = databases[state.kind];
    const words = normalize(state.query).split(' ').filter(Boolean);
    // A numeric query is an exact ID lookup. Names accept multiple words and Aegis underscores.
    matches = db.records.filter(record => {
      const matchesCategory = !state.category || (state.kind === 'monster' && state.category === 'MVP'
        ? record.server?.Modes?.Mvp === true
        : state.kind === 'item' && costumeLocations.has(state.category)
        ? record.server?.Locations?.[costumeLocations.get(state.category)] === true
        : state.kind === 'item' && state.category === 'Garment'
        ? record.server?.Locations?.Garment === true
        : state.kind === 'item' && state.category === 'Shield'
        ? record.server?.Type === 'Armor' && record.server?.Locations?.Left_Hand === true
        : state.kind === 'item' && headgearLocations.has(state.category)
        ? record.server?.Type === 'Armor' && headgearLocations.get(state.category).some(slot => record.server?.Locations?.[slot] === true)
        : category(record) === state.category);
      return matchesCategory && (state.kind !== 'map' && /^\d+$/.test(state.query) ? String(record.id) === state.query : words.every(word => db.searchKeys.get(record.id).includes(word)));
    });
    matches.sort(state.sort === 'id' ? (a,b) => state.kind === 'map' ? a.id.localeCompare(b.id) : a.id-b.id : (a,b) => clean(a.name).localeCompare(clean(b.name)) * (state.sort === 'name-desc' ? -1 : 1) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
    state.page = Math.min(state.page, Math.max(1, Math.ceil(matches.length/pageSize())));
    writeHistory(historyMode, capture);
    render();
  }
  function stats(pairs) {
    const available = pairs.filter(([,value]) => value !== undefined && value !== null && value !== '');
    return available.length ? `<dl class="stats">${available.map(([label,value,element]) => {
      const text = escape(typeof value === 'number' ? number(value) : value);
      const display = element ? `<span class="element-badge" data-element="${escape(String(element).toLowerCase())}">${text}</span>` : text;
      return `<div class="stat"><dt>${escape(label)}</dt><dd>${display}</dd></div>`;
    }).join('')}</dl>` : '<p class="source-note">No server stats supplied for this entry.</p>';
  }
  function richLine(line) {
    // Only the game's six-digit color markers become markup; database text is escaped.
    const parts = String(line).split(/(\^[0-9a-f]{6})/gi);
    let color = '';
    return parts.map(part => {
      if (/^\^[0-9a-f]{6}$/i.test(part)) { color = part.slice(1); return ''; }
      return color ? `<span style="color:#${color}">${escape(part)}</span>` : escape(part);
    }).join('');
  }
  function description(record, kind) {
    if (kind === 'item') {
      const lines = record.description || record.client?.identifiedDescriptionName || [];
      return '<p class="description-label">DESCRIPTION</p>' + (lines.some(line => line.trim()) ? lines.map(line => /^_{3,}$/.test(line.trim()) ? '<hr>' : `<p>${richLine(line)}</p>`).join('') : '<p class="unavailable">No description supplied for this item.</p>');
    }
    const s = record.server || {};
    return '<p class="description-label">MONSTER OVERVIEW</p>' + stats([['Level',s.Level],['HP',s.Hp],['Race',s.Race],['Size',s.Size],['Element',s.Element ? `${s.Element} ${s.ElementLevel ?? ''}`.trim() : undefined,s.Element],['Class',s.Class],['Base EXP',s.BaseExp],['Job EXP',s.JobExp]]);
  }
  function spawnTime(spawn) {
    const { baseSeconds: base, randomSeconds: random } = spawn.spawnTime || {};
    const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
    if (!valid(base)) return '<span class="unavailable">Not specified</span>';
    const hasRandom = valid(random) && random > 0;
    const maximum = base + (hasRandom ? random : 0);
    const minutes = base >= 60 && base % 60 === 0 && maximum % 60 === 0;
    const divisor = minutes ? 60 : 1;
    const range = `${number(base / divisor)}${hasRandom ? `–${number(maximum / divisor)}` : ''} ${minutes ? 'min' : 'sec'}`;
    const breakdown = `Base ${number(base)} sec${valid(random) ? ` + random 0–${number(random)} sec` : '; random delay not specified'}`;
    return `<span title="${escape(breakdown)}">${escape(range)}</span>${hasRandom ? `<small class="spawn-time-breakdown">${escape(breakdown)}</small>` : ''}`;
  }
  function mapSpawns(record) {
    const spawns = record.spawns || [];
    const listId = `map-spawn-rows-${record.id}`;
    return `<section class="map-spawns"><h4 id="map-spawns-${record.id}">Map spawns</h4>${spawns.length ? `<table aria-labelledby="map-spawns-${record.id}"><thead><tr><th scope="col">Map</th><th scope="col">Spawn count</th><th scope="col">Spawn time</th></tr></thead><tbody id="${escape(listId)}">${spawns.map((spawn, index) => `<tr class="map-spawn-row"${index >= mapSpawnPageSize ? ' hidden' : ''}><td><a class="drop-link" data-map-name="${escape(spawn.map)}" href="${escape(routeURL({ kind: 'map', query: spawn.map }))}"><code>${escape(spawn.map)}</code></a></td><td>${spawn.count != null ? escape(number(spawn.count)) : 'Unavailable'}</td><td>${spawnTime(spawn)}</td></tr>`).join('')}</tbody></table>${spawns.length > mapSpawnPageSize ? `<button type="button" class="page-button show-more-maps" data-show-more-maps aria-controls="${escape(listId)}" aria-label="Click to Show more details: maps for ${escape(clean(record.name))}">Click to Show more details</button>` : ''}<p class="spawn-time-note">Spawn time = base delay + random delay. Server timing settings may vary.</p>` : '<p class="unavailable">No map spawn data available for this monster.</p>'}</section>`;
  }
  function buildMapDatabase() {
    const data = Object.create(null);
    const getMap = name => {
      const id = name.toLowerCase();
      return data[id] ||= { id, name: id, spawns: [] };
    };
    for (const [key, record] of Object.entries(databases.map.data)) {
      const id = String(record.id || key).toLowerCase();
      data[id] = { ...record, id, name: record.name || id, spawns: [] };
    }
    for (const monster of databases.monster.records) {
      for (const spawn of monster.spawns || []) {
        if (!spawn.map) continue;
        getMap(spawn.map).spawns.push({ monster, ...spawn });
      }
    }
    const records = Object.values(data);
    for (const map of records) {
      map.spawns.sort((a, b) => clean(a.monster.name).localeCompare(clean(b.monster.name)) || a.monster.id - b.monster.id);
      map.monsterCount = new Set(map.spawns.map(spawn => spawn.monster.id)).size;
    }
    databases.map = { data, records, spawnsLoaded: true, searchKeys: new Map(records.map(map => [map.id, normalize(`${map.id} ${map.name}`)])) };
    $('#map-count').textContent = number(records.length);
  }
  function monsterRank(monster) {
    const server = monster.server || {};
    // Beelzebub's map spawn entry lacks the MVP flag present on entry 1874.
    if (server.Modes?.Mvp === true || monster.id === 1873) return ' (Boss Monster)';
    return '';
  }
  function mapResult(record) {
    const headingId = `map-name-${record.id}`;
    return `<article class="result map-result" aria-labelledby="${escape(headingId)}"><div class="result-card"><header class="result-header"><div class="result-heading"><h3 id="${escape(headingId)}">${escape(record.name)}</h3><span class="id">Map</span></div><span class="badge">${number(record.monsterCount)} monster${record.monsterCount === 1 ? '' : 's'}</span></header><div class="map-result-body"><figure class="map-preview"><div class="map-image">${art(record, 'map', true)}</div><figcaption>${escape(record.name)}</figcaption></figure><section class="map-monsters" aria-label="Monsters on ${escape(record.name)}"><h4>Monster spawns</h4>${record.spawns.length ? `<div class="map-monster-list">${record.spawns.map(spawn => {
      const monster = spawn.monster;
      const s = monster.server || {};
      return `<div class="map-monster-row"><button type="button" class="drop-link map-monster-link" data-monster-id="${escape(monster.id)}"><span class="map-monster-sprite" aria-hidden="true">${art(monster, 'monster')}</span><span class="map-monster-info"><strong>${escape(clean(monster.name))}${monsterRank(monster)}</strong><span class="id">#${escape(monster.id)}</span><span class="map-monster-stats">HP: ${s.Hp != null ? number(s.Hp) : 'Not specified'} · Level: ${s.Level != null ? number(s.Level) : 'Not specified'}</span></span></button><dl class="map-spawn-values"><div><dt>Spawn count</dt><dd>${spawn.count != null ? number(spawn.count) : 'Not specified'}</dd></div><div><dt>Spawn time</dt><dd>${spawnTime(spawn)}</dd></div></dl></div>`;
    }).join('')}</div><p class="source-note">Spawn time = base delay + random delay. Server timing settings may vary.</p>` : '<p class="unavailable">No monster spawn data available for this map.</p>'}</section></div></div></article>`;
  }
  const enabledKeys = object => Object.entries(object || {}).filter(([,value]) => value === true).map(([key]) => key.replaceAll('_',' ')).join(', ');
  function drops(list,title) {
    if (!list?.length) return '';
    const sortedDrops = [...list].sort((a, b) => (b.Rate ?? -1) - (a.Rate ?? -1));
    return `<section class="drops"><h4>${title}</h4>${sortedDrops.map(drop => {
      const item = databases.item?.byAegis.get(drop.Item);
      return `<div class="drop-row"><button type="button" class="drop-link drop-item-link" data-aegis="${escape(drop.Item)}"><span class="drop-item-icon" aria-hidden="true">${item ? art(item,'item') : placeholder}</span><span>${escape(item?.name || drop.Item.replaceAll('_',' '))}</span></button><span class="drop-rate">${drop.Rate != null ? `${(drop.Rate/100).toLocaleString(undefined,{maximumFractionDigits:2})}%` : 'Rate unavailable'}</span></div>`;
    }).join('')}</section>`;
  }
  function droppedBy(record) {
    const sources = databases.monster.droppedBy.get(record.aegisName) || [];
    const listId = `drop-sources-${record.id}`;
    return `<section class="drops"><h4>Dropped by</h4><div id="${escape(listId)}">${sources.length ? sources.map(({monster,rate,mvp}, index) => `<div class="drop-row"${index >= dropSourcePageSize ? ' hidden' : ''}><button type="button" class="drop-link drop-monster-link" data-monster-id="${escape(monster.id)}"><span class="drop-monster-icon" aria-hidden="true">${art(monster,'monster')}</span><span>${escape(clean(monster.name))} <span class="id">#${monster.id}</span>${mvp ? ' (MVP reward)' : ''}</span></button><span class="drop-rate">${rate != null ? `${(rate/100).toLocaleString(undefined,{maximumFractionDigits:2})}%` : 'Rate unavailable'}</span></div>`).join('') : '<p class="no-drop-result">No Result</p>'}</div>${sources.length > dropSourcePageSize ? `<button type="button" class="page-button show-more-drops" data-show-more-drops aria-controls="${escape(listId)}" aria-label="Click to Show more details: monsters that drop ${escape(clean(record.name))}">Click to Show more details</button>` : ''}</section>`;
  }
  function details(record,kind) {
    const s = record.server || {};
    const itemPairs = [['Type',s.Type],['Subtype',s.SubType],['Weight',s.Weight != null ? s.Weight/10 : undefined],['Buy price',s.Buy != null ? `${number(s.Buy)} z` : undefined],['Sell price',s.Sell != null ? `${number(s.Sell)} z` : undefined],['Slots',s.Slots ?? record.client?.slotCount],['Attack',s.Attack],['Magic attack',s.MagicAttack],['Defense',s.Defense],['Range',s.Range],['Weapon level',s.WeaponLevel],['Armor level',s.ArmorLevel],['Required level',s.EquipLevelMin],['Maximum level',s.EquipLevelMax],['Refineable',s.Refineable == null ? undefined : s.Refineable ? 'Yes' : 'No']];
    const monsterPairs = [['Attack',s.Attack],['Attack 2',s.Attack2],['Defense',s.Defense],['Magic defense',s.MagicDefense],['STR',s.Str],['AGI',s.Agi],['VIT',s.Vit],['INT',s.Int],['DEX',s.Dex],['LUK',s.Luk],['Attack range',s.AttackRange],['Walk speed',s.WalkSpeed],['Attack delay',s.AttackDelay]];
    const notes = kind === 'item' ? [['Jobs',enabledKeys(s.Jobs)],['Equip location',enabledKeys(s.Locations)],['Classes',enabledKeys(s.Classes)]] : [['Modes',enabledKeys(s.Modes)]];
    const noteHTML = notes.filter(([,value])=>value).map(([label,value])=>`<p><strong>${label}:</strong> ${escape(value)}</p>`).join('');
    const scripts = kind === 'item' ? ['Script','EquipScript','UnEquipScript'].filter(key=>s[key]).map(key=>`<section class="script-details"><h5>${escape(key.replace(/([a-z])([A-Z])/g,'$1 $2'))}</h5><pre>${escape(s[key])}</pre></section>`).join('') : '';
    const dropRateNote = s.Drops?.length || s.MvpDrops?.length ? '<p class="source-note">Drop rates use source database values; server rates may vary.</p>' : '';
    return `<div class="other-details"><section class="details-box" aria-label="Other details for ${escape(clean(record.name))}"><h4>Other details</h4>${stats(kind === 'item' ? itemPairs : monsterPairs)}${noteHTML ? `<div class="detail-notes">${noteHTML}</div>` : ''}${scripts}${kind === 'monster' ? drops(s.Drops,'Item drops')+drops(s.MvpDrops,'MVP rewards')+dropRateNote+mapSpawns(record) : droppedBy(record)}<p class="source-note source-reference">Source: ${escape((record.sources || []).join(', ') || 'Local database')}</p></section></div>`;
  }
  function headgearPreview(record) {
    if (state.kind !== 'item' || record.server?.Type !== 'Armor' ||
      ![...headgearLocations.values()].flat().some(slot => record.server?.Locations?.[slot] === true)) return '';
    const view = Number(record.server?.View || record.client?.ClassNum || 0);
    return `<headgear-viewer view-id="${Number.isSafeInteger(view) ? view : 0}" item-name="${escape(clean(record.name))}"></headgear-viewer>`;
  }
  function detailedResult(record) {
    if (state.kind === 'map') return mapResult(record);
    const s = record.server || {};
    const slots = s.Slots ?? record.client?.slotCount;
    return `<article class="result" aria-labelledby="name-${record.id}"><div class="result-card"><header class="result-header">${state.kind === 'item' ? `<div class="item-icon">${art(record,state.kind)}</div>` : ''}<div class="result-heading"><h3 class="${state.kind === 'item' ? 'item-name' : 'monster-name'}" id="name-${record.id}">${escape(clean(record.name))}${state.kind === 'item' && slots > 0 ? ` <span class="slots">[${slots}]</span>` : ''}</h3>${record.aegisName ? `<div class="aegis-name">${escape(record.aegisName)}</div>` : ''}<span class="id">#${record.id}</span></div><span class="badge">${escape(state.kind === 'item' ? s.Type || 'Unspecified' : s.Race || 'Monster')}</span></header><div class="result-body"><figure class="collection"><figcaption>${state.kind === 'item' ? record.cardBmp ? 'Card illustration' : 'Collection image' : 'Monster sprite'}</figcaption><div class="collection-image">${art(record,state.kind,true)}</div>${headgearPreview(record)}</figure><div class="description">${description(record,state.kind)}${details(record,state.kind)}</div></div></div></article>`;
  }
  function compactResult(record) {
    const s = record.server || {};
    const slots = s.Slots ?? record.client?.slotCount;
    const facts = state.kind === 'map'
      ? [record.monsterCount ? `${number(record.monsterCount)} monster types` : 'No spawn data']
      : state.kind === 'monster'
      ? [s.Level != null ? `Lv. ${number(s.Level)}` : '', s.Race, s.Element ? `${s.Element} ${s.ElementLevel ?? ''}`.trim() : '']
      : [s.SubType || s.Type || 'Unspecified', s.EquipLevelMin != null ? `Lv. ${number(s.EquipLevelMin)}+` : '', s.Weight != null ? `Weight ${number(s.Weight / 10)}` : ''];
    return `<details class="compact-result" data-record-id="${escape(record.id)}"><summary class="compact-summary"><span class="compact-icon" aria-hidden="true">${art(record, state.kind)}</span><span class="compact-title"><span class="compact-name">${escape(clean(record.name))}${state.kind === 'item' && slots > 0 ? ` <span class="slots">[${escape(slots)}]</span>` : ''}</span><span class="compact-meta">${state.kind === 'map' ? 'Map' : `#${escape(record.id)}`}${record.aegisName ? ` · ${escape(record.aegisName)}` : ''}</span></span><span class="compact-facts">${facts.filter(Boolean).map(fact => `<span>${escape(fact)}</span>`).join('')}</span><span class="compact-disclosure" aria-hidden="true"><span class="compact-open-label">Details</span><span class="compact-close-label">Close</span><svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg></span></summary><div class="compact-details"></div></details>`;
  }
  function fillCompactDetails(row) {
    const body = row.querySelector('.compact-details');
    if (body.childElementCount) return;
    const record = databases[state.kind]?.data[row.dataset.recordId];
    if (!record) return;
    // Keep descriptions, drops, maps, and sprite viewers out of closed rows.
    const template = document.createElement('template');
    template.innerHTML = detailedResult(record);
    body.append(template.content.querySelector('.result-body, .map-result-body'));
  }
  function render() {
    const start = (state.page-1)*pageSize();
    const rows = matches.slice(start,start+pageSize());
    $('#results').setAttribute('aria-busy','false');
    $('#results').classList.toggle('compact-results', state.view === 'compact' && rows.length > 0);
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
    $('#results-title').textContent = state.query ? `Results for “${state.query}”` : state.category ? `${state.category} ${state.kind}s` : `All ${state.kind}s`;
    $('#result-summary').textContent = matches.length ? `${number(start+1)}–${number(start+rows.length)} of ${number(matches.length)} ${state.kind}${matches.length === 1 ? '' : 's'}` : `0 ${state.kind}s found`;
    if (!rows.length) {
      $('#results').innerHTML = '<div class="empty-state"><h3>No discoveries this time.</h3><p>Try another name or ID, or clear your filters.</p><button class="primary" type="button" id="clear-empty">Clear search</button></div>';
      $('#clear-empty').onclick = reset;
    } else {
      $('#results').innerHTML = rows.map(state.view === 'compact' ? compactResult : detailedResult).join('');
      if (state.view === 'compact' && matches.length === 1) {
        const row = $('#results .compact-result');
        fillCompactDetails(row);
        row.open = true;
      }
    }
    renderPagination();
  }
  function renderPagination() {
    const pages = Math.ceil(matches.length/pageSize());
    const nav = $('#pagination');
    nav.hidden = pages <= 1;
    if (pages <= 1) return;
    const numbers = [...new Set([1,state.page-1,state.page,state.page+1,pages])].filter(n=>n>0 && n<=pages).sort((a,b)=>a-b);
    const button = (page,label,disabled=false) => `<button type="button" class="page-button${page===state.page && typeof label==='number' ? ' current' : ''}" data-page="${page}" ${disabled ? 'disabled' : ''} ${page===state.page && typeof label==='number' ? 'aria-current="page"' : ''} aria-label="${typeof label==='number' ? `Page ${page}` : label}">${label}</button>`;
    nav.innerHTML = `<span>Page ${number(state.page)} of ${number(pages)}</span><div class="page-controls"><div class="page-buttons">${button(state.page-1,'Previous',state.page===1)}${numbers.map((n,i)=>(i && n-numbers[i-1]>1 ? '<span class="page-ellipsis">…</span>' : '')+button(n,n)).join('')}${button(state.page+1,'Next',state.page===pages)}</div><form class="page-jump"><label for="jump-page">Jump to page</label><input id="jump-page" name="page" type="number" inputmode="numeric" min="1" max="${pages}" step="1" value="${state.page}" required><button type="submit" class="page-button" aria-label="Go to page">Go</button></form></div>`;
  }
  function goToPage(page) {
    if (!Number.isSafeInteger(page) || page < 1 || page > Math.ceil(matches.length/pageSize())) return;
    clearTimeout(searchTimer);
    editingSearch = false;
    state.page = page;
    writeHistory('push');
    render();
    $('.results-heading').scrollIntoView({block:'start'});
    $('.results-heading h2').tabIndex = -1;
    $('.results-heading h2').focus({preventScroll:true});
  }
  function reset() {
    clearTimeout(searchTimer);
    editingSearch = false;
    $('#search').value=''; $('#category').value=''; $('#sort').value='id'; state.page=1; search();
  }
  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick=()=>activate(tab.dataset.kind);
    tab.onkeydown=event=>{
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const kinds = ['item', 'monster', 'map'];
      const kind=event.key==='Home' ? kinds[0] : event.key==='End' ? kinds[kinds.length - 1] : kinds[(kinds.indexOf(state.kind) + (event.key === 'ArrowRight' ? 1 : -1) + kinds.length) % kinds.length];
      $(`#${kind}-tab`).focus(); activate(kind);
    };
  });
  $('#search-form').onsubmit=event=>{event.preventDefault();clearTimeout(searchTimer);state.page=1;search(editingSearch ? 'replace' : 'push');editingSearch=false;};
  $('#search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.page=1;search(editingSearch ? 'replace' : 'push');editingSearch=true;},180);};
  $('#search').onblur=()=>{editingSearch=false;};
  $('#category').onchange=$('#sort').onchange=()=>{clearTimeout(searchTimer);editingSearch=false;state.page=1;search();};
  $('#reset').onclick=reset;
  document.querySelectorAll('[data-view]').forEach(button => {
    button.onclick = () => {
      if (state.view === button.dataset.view) return;
      clearTimeout(searchTimer);
      editingSearch = false;
      saveView();
      state.view = button.dataset.view;
      state.page = 1;
      search('push', false);
    };
  });
  $('#results').addEventListener('toggle', event => {
    const row = event.target;
    if (!row.matches('.compact-result')) return;
    if (row.open) fillCompactDetails(row);
    saveView();
  }, true);
  $('#pagination').onclick=event=>{const button=event.target.closest('[data-page]');if(!button || button.disabled) return;goToPage(Number(button.dataset.page));};
  $('#pagination').onsubmit=event=>{
    if (!event.target.matches('.page-jump')) return;
    event.preventDefault();
    if (event.target.reportValidity()) goToPage(event.target.elements.page.valueAsNumber);
  };
  $('#results').onclick=async event=>{
    const mapLink = event.target.closest('[data-map-name]');
    if (mapLink) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      $('#search').value = mapLink.dataset.mapName;
      $('#sort').value = 'id';
      await activate('map');
      $('.tabs').scrollIntoView({block:'start'});
      $('#search').focus({preventScroll:true});
      return;
    }
    const showMore = event.target.closest('[data-show-more-drops], [data-show-more-maps]');
    if (showMore) {
      const list = document.getElementById(showMore.getAttribute('aria-controls'));
      const batchSize = showMore.hasAttribute('data-show-more-maps') ? mapSpawnPageSize : dropSourcePageSize;
      const hiddenRows = [...list.querySelectorAll('.drop-row[hidden], .map-spawn-row[hidden]')];
      hiddenRows.slice(0, batchSize).forEach(row => { row.hidden = false; });
      hiddenRows[0]?.querySelector('button, a')?.focus({preventScroll:true});
      if (hiddenRows.length <= batchSize) showMore.remove();
      saveView();
      return;
    }
    const button=event.target.closest('[data-aegis], [data-monster-id]'); if(!button || button.disabled) return;
    const kind=button.dataset.monsterId != null ? 'monster' : 'item';
    button.disabled=true;
    try {
      const db=await loadDatabase(kind);
      const record=kind === 'monster' ? db.data[button.dataset.monsterId] : db.byAegis.get(button.dataset.aegis);
      if(record) {$('#search').value=String(record.id);await activate(kind);$('.tabs').scrollIntoView({block:'start'});$('#search').focus({preventScroll:true});}
      else button.textContent=`${kind === 'monster' ? 'Monster' : 'Item'} not found in this database`;
    } catch {button.textContent=`Could not load ${kind}. Try again.`;} finally {button.disabled=false;}
  };
  window.addEventListener('popstate', () => restoreRoute());
  window.addEventListener('pagehide', saveView);
  // Keep the departing entry's scroll position without overwriting the target on Back.
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    if (viewReady) scrollTimer = setTimeout(saveView, 150);
  }, { passive: true });
  // A fresh page load starts with ten drop sources/map spawns; Back/Forward restores expansion.
  restoreRoute(false);
})();
