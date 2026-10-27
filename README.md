# Ragnarok Atlas

A local PHP, HTML, CSS, JavaScript, and jQuery toolkit for **rAthena Renewal** data exports and artwork. It includes a data importer, GRF extractor, and ACT/SPR-to-GIF converter.

## Web server requirement

You need a **web server with PHP support** to run this application.

## Application pages

- `index.php`: opens Data Builder.
- `builder.php`: import source files and export JavaScript tables.
- `sprites.php`: preview ACT/SPR pairs and export GIFs or a ZIP.
- `grf.php`: select data.grf, extract four texture folders, and convert monster sprites directly to GIFs.

File selection, parsing, rendering, and exports happen in the browser.

## Upload guide: item, monster, and map data

Open [Data Builder](http://localhost/ragnarok-database-builder/builder.php) and select the files for the export you need. You can combine sources to build all three tables; importing items with monsters also resolves item references in monster drops. Use Renewal server databases and client files that match your game installation.

### File or folder for `map-data.js`

Use **Choose folder** to select the `map/` folder containing `<mapname>.bmp` images (or a parent folder containing `map/`). Click **Build data tables**, then **Download map-data.js**. The folder alone is enough. You can also select individual BMPs with **Choose files**. Folder selection ignores artwork outside `map/` and unrelated files such as `Thumbs.db`.

Each BMP exports an entry with `id` and `name` set to the lowercase filename without `.bmp`, plus `image` and `sources`. For example, `map/Prontera.BMP` produces `{ id: "prontera", name: "prontera", image: "Prontera.BMP", sources: ["map/Prontera.BMP"] }` under the `prontera` key. Image paths preserve case and subfolders relative to `map/`. Only filenames are indexed; image contents are not decoded, validated, or embedded. Install the images separately on your website. Text encoding settings do not apply to BMPs.

Use **Choose files** to select your client's `mapnametable.txt`. Click **Build data tables**, then **Download map-data.js**. No item or monster databases are required. The folder picker also includes `mapnametable.txt`, and you can combine it with the other sources in one build.

The parser reads `map.rsw#Display name#` records, ignores blank lines and `//` comments, and reports malformed entries with their line number. Localized display labels are omitted; valid map codes are included even when the display label is empty. Auto tries Unicode first, then Korean (EUC-KR / CP949) and Windows-1252. The import report shows the encoding used.

The output is a `const mapDATA` object keyed by the lowercase map code without its extension. Each entry contains `id` and `name` (both the same map code) and `sources` (selected source paths). `mapnametable.txt` supplies `rsw` (original resource filename); BMPs supply `image`. For example, `prontera.rsw#Prontera#` produces:

```js
const mapDATA = {
  "prontera": {
    "id": "prontera",
    "name": "prontera",
    "rsw": "prontera.rsw",
    "sources": ["mapnametable.txt"]
  }
};
```

BMPs and `mapnametable.txt` can be imported together. Matching codes merge into one entry with both `image` and `rsw`, regardless of source order. Multiple BMPs for the same code or repeated table definitions use the last value and produce a warning. Put custom files after the base files to override entries. The table contains map codes and resource filenames; it does not contain images, terrain, or map geometry.

### Files for `monster-data.js`

| Upload | Purpose |
| --- | --- |
| `npc/re/mobs/**/*.txt` | Optional static monster spawn maps and quantities, combined per monster, map, and respawn timing. |
| `npc/re/scripts_monsters.conf` | Optional enabled-file list; excludes unlisted spawn files when selected. Include the referenced TXT files too. |
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

### Build and install the exports

1. Click **Choose files** and select the applicable files above, or use **Choose folder**. Use **Choose files** for custom filenames that the folder filter does not include.
2. Review the source list. Put base files first and custom overrides last. Later fields override earlier fields; nested maps merge and lists are replaced.
3. Leave encoding on **Auto** initially. Check reported legacy fallbacks and adjust an individual file's encoding if its text or filenames look wrong.
4. Click **Build data tables** and review the import report. Fix any errors before exporting.
5. Click **Download monster-data.js**, **Download item-data.js**, **Download map-data.js**, or **Download tables as ZIP**. The ZIP includes each nonempty table and the import report.
6. Add the generated JavaScript files to the website that will consume your data.

## GRF Extractor — `grf.php`

1. Select your `data.grf` (GRF 2.0 or 3.0). Match its filename encoding to your database.
2. Choose the monster animation, size, speed, and background.
3. Click **Download as ZIP** or **Extract to folder**.

Outputs: `cardbmp/`, `collection/`, `item/`, `map/`, and `monster/<sprite_name>.gif`. Monster conversion requires matching ACT/SPR pairs.

ZIP exports preserve original filenames and support large archives through ZIP64. Folder extraction records adjusted filenames in `filename-map.json`. Review the export report and keep the page open until completion.

### Image files are separate

The JavaScript exports contain data and resource names, not embedded images. Use **GRF extractor** for direct artwork extraction and GIF conversion, or convert extracted ACT/SPR pairs in **Sprite studio**. Install artwork in your destination website's image folders. Preserve the mapped filenames and case.

ItemInfo resource names remain in each item's `client` fields. The GRF extractor preserves client texture filenames and formats in `item/`; it does not rename them to item IDs. Card mappings only identify card illustrations. `accessoryid.lub` is not part of the supported item upload set.

## Build your database

1. Select the item, monster, or map files listed above, with base files first and custom overrides last.
2. Start with **Auto** encoding; adjust individual files if text looks incorrect.
3. Click **Build data tables** and resolve errors in the import report.
4. Download `item-data.js`, `monster-data.js`, `map-data.js`, or the populated tables as ZIP, then install them in your destination website.

Select referenced files explicitly; Lua loaders and YAML import wrappers do not load them automatically.

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

The exported constants are intended for ordinary `<script>` tags before your application module. These are objects, not arrays: items and monsters use numeric IDs; maps use map codes.

For accurate monster filenames, select text/decompiled `npcidentity.lub` and `jobname.lub` (or `.lua`) from the same client as your extracted sprites, together with `mob_db.yml`. The folder picker includes these files too. `npcidentity` maps `JT_*` constants to client IDs; `jobname` maps those constants (or numeric IDs) to sprite basenames. The builder joins them to monster IDs regardless of file order, then exports `spriteName` and `gif: "<sprite_basename>.gif"`. Filename case is preserved. Korean filenames use the same legacy Western conversion as other Lua fields. No Lua code is executed; compiled LUB must be decompiled first. Later mappings override earlier mappings with warnings, and missing identity keys are reported.

Relative client resource paths, including mercenary subfolders separated by `/` or `\`, are accepted and preserved in `spriteName`. The `gif` field uses only the final basename to match Sprite Studio's flat export folder. Absolute paths and parent-directory segments are rejected. Sprite Studio reports duplicate output basenames rather than overwriting them.

NPC identity alone cannot determine sprite filenames. Monsters without a resolved mapping retain `gif: "<lowercase_aegis_name>.gif"` when an AegisName is supplied. This fallback is only a convention and may not match a client sprite. Server-side view overrides such as `mob_avail.yml` are not imported; those need an explicit mapping for the displayed client view ID. Client mappings do not contain images: convert the corresponding ACT/SPR pairs in Sprite studio, then install the GIFs and generated `monster-data.js` in the destination website that consumes your exports.

### Monster spawn maps and quantities

Select your server's `npc/re` folder, including spawn TXT files and `scripts_monsters.conf`, then add `mob_db.yml`.

The exported `monster-data.js` includes each matched monster's maps, quantities, and respawn delays in seconds. Counts with the same map and timing are combined. With `scripts_monsters.conf`, only listed files are counted; otherwise, all selected spawn files are counted.

Only static spawn declarations are included. Script-controlled events and server timing adjustments are not applied.

### Card illustration filenames

Add `num2cardillustnametable.txt` with your item files to export `cardBmp: "<filename>.bmp"` for matching items. Original filename characters are preserved; install the BMP images separately.

**Auto** reads Unicode files first and falls back to Windows-1252 for legacy text. Adjust the encoding if filenames look incorrect.

### Lua legacy filename characters

Parsed Lua/LUB fields and keys convert Korean characters into CP949 bytes displayed as Windows-1252 characters, matching legacy resource filenames. For example, `미네랄` becomes `¹Ì³×¶ö`.

This is filename encoding conversion, not English translation. **Auto** uses Windows-1252 for legacy Lua files; YAML and card-table Unicode values retain their existing behavior.

### Supported source formats

- **YAML:** rAthena `ITEM_DB` and `MOB_DB` files with `Body` entries. Duplicate keys produce warnings; the last value wins.
- **Lua/LUB:** readable literal tables. Lua code is never executed; decompile binary LUB files first.
- **Legacy TXT:** `item_db*.txt` with 22 columns and `mob_db*.txt` with 57 columns.
- **Map names:** `mapnametable.txt` records in `map.rsw#Display name#` format, exported as `mapDATA` in `map-data.js`.
- **Map BMPs:** `<mapcode>.bmp` images in `map/` (or selected individually), indexed by filename into `map-data.js`.
- **Limits:** 64 MB per source file and 256 MB per build.

## Convert monster sprites

1. Open **Sprite studio** (`sprites.php`) and select matching `.act` and `.spr` files from the same folder.
2. Preview a pair and choose its action, size, speed, and background.
3. Download the GIF or export the folder as ZIP.

Batch exports place one GIF per sprite in `monster/` and include a manifest and report. Missing pairs, invalid assets, and duplicate output names are reported.

Supports SPR 1.1, 2.0, 2.1 and ACT 1.1, 2.0–2.5. Large animations may require smaller batches or lower export sizes. For direct GRF conversion, use **GRF extractor**.

### Use the exported artwork

- **Item icons:** GRF extractor preserves client texture filenames and formats in `item/`. Mapping those to ID-named PNGs, if required by your website, is a separate step.
- **Monster animations:** the exports contain `monster/<sprite_name>.gif` and `sprite-manifest.json`. Use the mapped `gif` field in your monster data to connect artwork to records.
- Preserve the manifest's `file`, `name`, `action`, and dimensions when using it in your destination website.

## References and bundled libraries

- ACT / SPR layouts: [Ragnarok Research Lab](https://ragnarokresearchlab.github.io/file-formats/).
- GRF layout: [Ragnarok Research Lab](https://ragnarokresearchlab.github.io/file-formats/grf/). Standard GRF DES decoder adapted from [grf-loader](https://github.com/vthibault/grf-loader) (MIT); attribution and license are in `assets/vendor/grf-des-LICENSE.txt`.
- GRF 3.0/protected-record format reference: [GRF Editor](https://github.com/Tokeiburu/GRFEditor/tree/main/GRF/Core). The browser decoder uses native WebCrypto and locally bundled [hash-wasm 4.12.0](https://github.com/Daninet/hash-wasm/tree/v4.12.0); its MIT license and embedded xxHash BSD notices are in `assets/vendor/hash-wasm-LICENSE.txt` and `assets/vendor/hash-wasm-xxhash-LICENSE.txt`.
- Streaming ZIP64 export: [zip.js 2.20.0](https://github.com/gildas-lormeau/zip.js/tree/v2.20.0), bundled native ES module; BSD-3-Clause license in `assets/vendor/zip-LICENSE.txt`. No runtime CDN or npm install is required.
- rAthena fields: [Renewal item database](https://github.com/rathena/rathena/blob/master/db/re/item_db.yml) and [monster database](https://github.com/rathena/rathena/blob/master/db/re/mob_db.yml).
- [jQuery 3.7.1](https://jquery.com/), [js-yaml 4.1.1](https://github.com/nodeca/js-yaml), [gifenc 1.0.3](https://github.com/mattdesl/gifenc), and [fflate 0.8.2](https://github.com/101arrowz/fflate). Their MIT license files are distributed alongside the libraries.
