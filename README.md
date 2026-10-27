# Ragnarok Atlas

A local PHP, HTML, CSS, JavaScript, and jQuery toolkit for **rAthena Renewal** data exports and artwork. It includes a data importer, GRF extractor, and ACT/SPR-to-GIF converter.

## Web server requirement

You need a **web server with PHP support** to run this application.

## Application pages

- `builder.php`: import source files to export into JavaScript tables.
- `grf.php`: select data.grf, extract four texture folders, and convert monster sprites directly to GIFs. Click Download to Zip for faster.
- `sprites.php`: preview ACT/SPR pairs and export GIFs or a ZIP.


File selection, parsing, rendering, and exports happen in the browser.

## Upload guide: item and monster data

Open [Data Builder](http://localhost/ragnarok-database-builder/builder.php) and select the files for the export you need. You can upload both groups together to build both tables and resolve item references in monster drops. Use Renewal server databases and client files that match your game installation.

### Files for `map-data.js`

Upload the generated map/ folder to retrieve all files that contain image assets.

### Files for `monster-data.js`

| Upload | Purpose |
| --- | --- |
| `npc/re/mobs/**/*.txt` | Optional static monster spawn maps and quantities, combined per monster, map, and respawn timing. |
| `mob_db.yml` | Monster IDs, names, stats, drops, and MVP rewards from the server database, normally `db/re/mob_db.yml`. |
| `jobname.lub` | Client sprite resource names used to generate each mapped monster's `spriteName` and `gif` fields. |
| `npcidentity.lub` | Client identity constants and numeric IDs, used to connect `jobname.lub` entries to monster IDs. |

Upload all three for monster data with client sprite mappings. Extract `jobname.lub` and `npcidentity.lub` from the same client as your monster sprites, normally under `data/luafiles514/lua files/datainfo/` in the GRF. Both must be readable text; decompile binary LUB files first. Text `.lua` versions with the same basenames are also supported.

Add any custom monster database overrides after the base `mob_db.yml`. The two client mapping files can appear in either order. If a monster has no matching client mapping, the builder keeps the lowercase AegisName GIF convention when available and reports missing mappings.

### Files for `item-data.js`

| Upload | Purpose |
| --- | --- |
| `itemInfo.lua` | Client item names, descriptions, resource names, and other client fields. |
| Your other `itemInfo.lua` files, if you have them | Additional or custom item definitions, such as `itemInfo_custom.lua`. Select every applicable file separately. |
| `item_db_equip.yml` | Server equipment data: weapons, armor, requirements, stats, and scripts. |
| `item_db_usable.yml` | Server data and scripts for usable items and consumables. |
| `item_db_etc.yml` | Server data for miscellaneous items, materials, and cards. |
| `num2cardillustnametable.txt` | Optional card illustration mapping; adds `cardBmp` to matching items. Include it when you want card illustration filenames. |

The three base item YAML files are normally in `db/re/`. Add any applicable custom item databases from `db/import/` after those base files. Place your custom itemInfo files after the base itemInfo file so later definitions override earlier fields for the same item ID.

Upload the files containing the actual item tables. A Lua loader that only calls `require` or `dofile` does not import its referenced files automatically. Likewise, selecting a wrapper `item_db.yml` does not load the three item databases listed above. Lua must contain a supported literal item table; compiled LUB must be decompiled first.

### JavaScript output

```js
const itemDATA = {
  "501": {
    id: 501,
    name: "Name from iteminfo, falling back to server name",
    aegisName: "SERVER_NAME",
    description: ["Client description lines"],
    server: { /* original item database fields, including scripts */ },
    client: { /* original iteminfo fields */ },
    sources: ["item_db_usable.yml", "iteminfo.lua"]
  }
};

const monsterDATA = {
  "1002": {
    id: 1002,
    name: "Monster name",
    aegisName: "SERVER_NAME",
    gif: "server_name.gif",
    server: { /* original monster fields, Drops, MvpDrops, etc. */ },
    sources: ["mob_db.yml"]
  }
};
```

The exported constants are intended for ordinary `<script>` tags before your application module. These are ID-keyed objects, not arrays.

## References and bundled libraries

- ACT / SPR layouts: [Ragnarok Research Lab](https://ragnarokresearchlab.github.io/file-formats/).
- GRF layout: [Ragnarok Research Lab](https://ragnarokresearchlab.github.io/file-formats/grf/). Standard GRF DES decoder adapted from [grf-loader](https://github.com/vthibault/grf-loader) (MIT); attribution and license are in `assets/vendor/grf-des-LICENSE.txt`.
- GRF 3.0/protected-record format reference: [GRF Editor](https://github.com/Tokeiburu/GRFEditor/tree/main/GRF/Core). The browser decoder uses native WebCrypto and locally bundled [hash-wasm 4.12.0](https://github.com/Daninet/hash-wasm/tree/v4.12.0); its MIT license and embedded xxHash BSD notices are in `assets/vendor/hash-wasm-LICENSE.txt` and `assets/vendor/hash-wasm-xxhash-LICENSE.txt`.
- Streaming ZIP64 export: [zip.js 2.20.0](https://github.com/gildas-lormeau/zip.js/tree/v2.20.0), bundled native ES module; BSD-3-Clause license in `assets/vendor/zip-LICENSE.txt`. No runtime CDN or npm install is required.
- rAthena fields: [Renewal item database](https://github.com/rathena/rathena/blob/master/db/re/item_db.yml) and [monster database](https://github.com/rathena/rathena/blob/master/db/re/mob_db.yml).
- [jQuery 3.7.1](https://jquery.com/), [js-yaml 4.1.1](https://github.com/nodeca/js-yaml), [gifenc 1.0.3](https://github.com/mattdesl/gifenc), and [fflate 0.8.2](https://github.com/101arrowz/fflate). Their MIT license files are distributed alongside the libraries.
