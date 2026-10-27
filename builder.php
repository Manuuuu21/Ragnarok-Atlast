<?php require __DIR__ . '/includes/layout.php'; page_start('Data builder','builder.php'); ?>
<section class="page-intro"><div><p class="eyebrow">WORKSPACE / DATA BUILDER</p><h1>From server files to searchable data.</h1><p>Combine Renewal databases, client descriptions, and map names. Export clean JavaScript tables, ready for your website.</p></div><span class="format-label">YAML + LUA + TXT → JS</span></section>
<div class="workspace-grid">
<section class="panel"><div class="panel-heading"><h2><span class="step">01</span> Source files</h2><span id="file-count" class="muted">No files selected</span></div>
<div class="upload-zone"><span class="upload-symbol">↥</span><h3>Bring your database together</h3><p>Select iteminfo.lua, item_db_equip.yml, item_db_usable.yml,<br>item_db_etc.yml, mob_db.yml, and your custom overrides.<br>Add num2cardillustnametable.txt for card illustration filenames.<br>Select your <strong>map/</strong> BMP folder or <strong>mapnametable.txt</strong> to create <strong>map-data.js</strong>.</p><div class="actions"><label class="button primary file-label">Choose files<input id="data-files" type="file" multiple accept=".lua,.lub,.yml,.yaml,.txt,.conf,.bmp" aria-label="Choose files"></label><label class="button file-label">Choose folder<input id="data-folder" type="file" multiple webkitdirectory aria-label="Choose folder"></label></div><small>Text Lua, rAthena YAML, monster spawns, card mappings, map BMPs, map names, and legacy TXT · up to 64 MB per file</small></div>
<div class="toolbar"><label>Default text encoding <select id="encoding"><option value="auto">Auto (UTF-8 / legacy)</option></select></label><button id="clear-files" class="text-button">Clear files</button></div>
<p class="hint">Auto reads each file separately, trying UTF-8 first and reporting any legacy fallback. If text looks garbled, set the correct encoding next to that file. Your Lua and YAML files can use different encodings.</p>
<p class="hint">For Lua/LUB and num2cardillustnametable.txt, Auto reads legacy bytes as Western (Windows-1252). All Korean text in parsed Lua fields is converted to its CP949 bytes displayed as Western filename characters, including Unicode sources and explicit Korean decoding. This is filename conversion, not English translation.</p>
<p class="hint">Files merge from top to bottom. Put custom overrides last. Nested maps merge; lists such as drops are replaced. Include referenced files explicitly.</p>
<p class="hint">For <code>map-data.js</code>, use <strong>Choose folder</strong> to select your <code>map/</code> folder containing <code>&lt;mapname&gt;.bmp</code> files, then click <strong>Build data tables</strong> and <strong>Download map-data.js</strong>. For example, <code>prontera.bmp</code> creates <code>id: "prontera", name: "prontera", image: "prontera.bmp"</code>. Only filenames are indexed; keep the BMP images on your website separately. A parent folder containing <code>map/</code> or individually selected BMPs also work.</p>
<p class="hint">You can also import <code>mapnametable.txt</code> alone or together with the BMPs. Matching map codes merge into one entry. Both <code>id</code> and <code>name</code> use the lowercase map code without its extension. Localized display labels are omitted.</p>
<p class="hint">For monster artwork, add text/decompiled <code>npcidentity.lub</code> and <code>jobname.lub</code> from your client alongside <code>mob_db.yml</code>. The builder joins client IDs to sprite filenames and exports <code>spriteName</code> and <code>gif</code> in monster-data.js. NPC identity alone contains IDs, not filenames. Convert the matching ACT/SPR pairs to GIFs in Sprite studio.</p>
<p class="hint">For spawn maps and quantities, choose your server’s <code>npc/re</code> folder, then add <code>db/re/mob_db.yml</code>. All <code>mobs/**/*.txt</code> files are read; <code>scripts_monsters.conf</code> limits counts to enabled files. Selecting only the <code>mobs</code> folder imports every selected spawn file. Exports include <code>spawns: [{ map: "prt_fild01", count: 42, spawnTime: { baseSeconds: 5, randomSeconds: null } }]</code> per matching monster. Timing is in seconds; <code>null</code> means omitted in the source. The random delay is added to the base delay. Server timing settings are not applied. Counts combine static declarations per map and timing; script-controlled events and live populations are not evaluated.</p>
<ol id="source-list" class="source-list"></ol>
<div class="panel-bottom actions"><button id="build" class="button primary" disabled>Build data tables <span>→</span></button><span id="build-status" role="status">Select files to begin.</span></div>
</section>
<aside class="panel"><div class="panel-heading"><h2><span class="step">02</span> Export & inspect</h2></div><div class="panel-body"><div class="count-grid builder-counts"><div><strong id="item-count">0</strong><span>Items</span></div><div><strong id="monster-count">0</strong><span>Monsters</span></div><div><strong id="map-count">0</strong><span>Maps</span></div></div><p>Items and monsters use numeric IDs. Maps use the map code from BMP filenames or mapnametable.txt for both id and name.</p><pre class="code-sample">const itemDATA = {
  "501": {
    id: 501,
    name: "…",
    server: { /* stats */ },
    client: { /* descriptions */ }
  }
};

const mapDATA = {
  "prontera": {
    id: "prontera",
    name: "prontera",
    image: "prontera.bmp",
    sources: ["map/prontera.bmp"]
  }
};</pre><div class="stack"><button id="export-items" class="button" disabled>Download item-data.js</button><button id="export-monsters" class="button" disabled>Download monster-data.js</button><button id="export-maps" class="button" disabled>Download map-data.js</button><button id="export-data-zip" class="button primary" disabled>Download tables as ZIP</button></div><p class="hint">The ZIP includes each nonempty table and the import report. Add the generated JavaScript files to your website.</p></div></aside>
</div>
<section class="panel report-panel"><div class="panel-heading report-heading"><span class="terminal-prompt" aria-hidden="true">&gt;_</span><h2 class="report-title">Import report</h2><span class="muted">Errors, overrides &amp; missing references</span></div><div id="import-report" class="panel-body report-output" role="status" tabindex="0" aria-label="Import report output">Your import report will appear here. Files containing unsupported expressions are reported, never executed.</div></section>
<?php page_end('builder.js'); ?>
