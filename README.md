# Ragnarok Atlas

A local toolkit for **rAthena Renewal** with a database builder, GRF extractor, ACT/SPR-to-GIF converter, and searchable item, monster, and map database. The builder pages use PHP, HTML, CSS, JavaScript, and jQuery; Data Search and its headgear viewer use HTML, CSS, and JavaScript.

## Requirements

- A local web server with PHP support, such as OpenServer or XAMPP.
- A modern browser. Open the application through HTTP(S), including localhost.
- Matching rAthena Renewal database files and client resources for the data and artwork being generated.

The PHP server needs permission to create and write `search-app/lib/` to save generated tables automatically.

## Quick start

1. Download or clone this repository into the web server's document root. The example URLs below assume the project folder is named `ragnarok-database-builder`; adjust that part of the URL if the folder has a different name.
2. Start the web server and open [Data Builder](http://localhost/ragnarok-database-builder/builder.php).
3. Select the [item, monster, and map sources](#upload-guide-item-monster-and-map-data), then click **Build data tables**. Review the import report and confirm that `item-data.js`, `monster-data.js`, and `map-data.js` were saved in `search-app/lib/`. Data Search loads all three files, so all three are required to open it. If automatic saving fails, download the tables and place them in that folder manually.
4. Open [GRF Extractor](http://localhost/ragnarok-database-builder/grf.php), select the matching `data.grf`, and export the artwork. Install the exported folders using the [destination table](#install-artwork-for-data-search) below.
5. Open [Data Search](http://localhost/ragnarok-database-builder/search-app/index.html).

## Application pages and endpoints

| Path | Purpose |
| --- | --- |
| [`builder.php`](builder.php) | Data Builder: import source files, save tables, and download exports. |
| [`grf.php`](grf.php) | GRF Extractor: extract artwork, convert monster sprites to GIFs, and prepare headgear preview assets. |
| [`sprites.php`](sprites.php) | Sprite Studio: preview extracted ACT/SPR pairs and export GIFs or a ZIP. |
| [`search-app/index.html`](search-app/index.html) | Data Search: browse items, monsters, and maps, including headgear previews. |
| [`index.php`](index.php) | Redirects to `builder.php` with HTTP status 302. |
| [`search.php`](search.php) | Legacy URL that also redirects to `builder.php`. |
| [`save-data.php`](save-data.php) | Endpoint used by Data Builder to save generated tables. |

File selection, parsing, rendering, and downloads happen in the browser. After a successful build, generated tables are sent to this PHP server and saved in `search-app/lib/`.

## Generated files and artwork

Game artwork and generated database tables are not included in the repository. `.gitignore` excludes all `img/` folders (including `search-app/img/`), generated databases in `search-app/lib/` and `lib/`, local `data/` and `exports/` folders, GRF/GPF archives, extracted ACT/SPR files, ZIP exports, and generated reports.

Data Builder creates `search-app/lib/` when saving tables. Create the artwork destination folders as needed when installing GRF exports.

## Upload guide: item, monster, and map data

Open [Data Builder](http://localhost/ragnarok-database-builder/builder.php) and select the files for the export you need. You can combine sources to build all three tables; importing items with monsters also resolves item references in monster drops. Use Renewal server databases and client files that match your game installation.

The **Upload checklist** updates as files are added, removed, or cleared. It shows selected and missing guide sources for items, monsters, and maps, with optional card illustrations and spawn files labeled separately. Warnings apply to the data sets you selected; partial builds remain available. Filename checks accept case differences, `.yaml` databases, and readable `.lua` client mappings. File contents are validated during the build, and missing-upload reminders are included in the import report and its ZIP copy. A map BMP selection is accepted as an alternative to `mapnametable.txt`.

Spawn folder detection uses the selected files' relative paths and accepts both `npc/re/mobs/` and `npc/re/mob/`, including directly selected `mobs/` or `mob/` folders. The checklist shows how many spawn TXT files were selected; that count does not prove the entire folder is present. Individually selected spawn TXT files without folder paths are recognized after parsing. **`scripts_monsters.conf` is optional and never uploads referenced files automatically.** Select the actual spawn files too. With the config, the import report lists missing references, even when no spawn files were selected. Without it, all selected spawn files are used.

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

Select `mob_db.yml`, `jobname.lub`, and `npcidentity.lub` for monster data with client sprite mappings. Spawn TXT files and `scripts_monsters.conf` are optional. Extract `jobname.lub` and `npcidentity.lub` from the same client as your monster sprites, normally under `data/luafiles514/lua files/datainfo/` in the GRF. Both must be readable text; decompile binary LUB files first. Text `.lua` versions with the same basenames are also supported.

Add any custom monster database overrides after the base `mob_db.yml`. The two client mapping files can appear in either order. If a monster has no matching client mapping, the builder keeps the lowercase AegisName GIF convention when available and reports missing mappings.

### Files for `item-data.js`

| Upload | Purpose |
| --- | --- |
| `iteminfo*.lua` | Client item names, descriptions, resource names, and other client fields. The checklist accepts any filename starting with `iteminfo` and ending in `.lua`, regardless of capitalization, including `itemInfo_EN.lua` and `itemInfo_custom.lua`. Readable `.lub` variants are also supported. |
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
4. Click **Build data tables**. After a successful build, each populated table automatically replaces its matching file in `search-app/lib/`. Empty tables leave installed files untouched. Include all sources needed for each table; saving replaces a whole table rather than merging it with the installed version.
5. Review the import report for parsing warnings and save results. Once all three tables are installed, open or refresh `search-app/index.html`. The PHP server needs write access to `search-app/lib/`. Each file is validated and staged before replacement; a failed save is reported and downloads remain available. Saves are limited to 128 MB of JSON per table. The save endpoint attempts to raise a lower PHP memory limit to 512 MB for validation.
6. **Download monster-data.js**, **Download item-data.js**, **Download map-data.js**, and **Download tables as ZIP** remain available for backups or another website. The ZIP includes each nonempty table and the import report.

## GRF Extractor — `grf.php`

1. Select your `data.grf` (GRF 2.0 or 3.0). Match its filename encoding to your database. This scans the archive and displays counts; it does not extract assets or save anything to the server.
2. Choose the monster animation, size, speed, and background.
3. Click **Download as ZIP** or **Extract to folder**.

Export categories: `cardbmp/`, `collection/`, `item/`, `map/`, `monster/<sprite_name>.gif`, and `sprite/`. One export processes all available categories; the files produced depend on the archive's contents and validation results. Monster conversion requires matching ACT/SPR pairs. The `sprite/` row counts mapped Novice/headgear ACT/SPR pairs (two files per pair); validation updates the count after export. When preview extraction succeeds, both ZIP and folder exports include `sprite/base/`, `sprite/headgear/`, `sprite/manifest.json`, and `sprite/extraction-report.json`. These raw sprites retain their animation data for the viewer; monster GIF settings do not alter them.

ZIP exports preserve original filenames and support large archives through ZIP64. Folder extraction records adjusted filenames in `filename-map.json`. Review the export report and keep the page open until completion.

### Install artwork for Data Search

Extract the downloaded ZIP, or use the folder created by **Extract to folder**. Copy each exported folder's contents to its destination:

| Exported folder | Destination in this project |
| --- | --- |
| `cardbmp/` | `search-app/img/cardbmp/` |
| `collection/` | `search-app/img/collection/` |
| `item/` | `search-app/img/item/` |
| `map/` | `search-app/img/map/` |
| `monster/` | `search-app/img/monster/` |
| `sprite/` | `search-app/img/sprites/` |

The export uses singular `sprite/`; the viewer reads plural `sprites/`. Place `manifest.json`, `extraction-report.json`, `base/`, and `headgear/` directly inside `search-app/img/sprites/`, without an extra `sprite/` level. The root `sprite-manifest.json` describes monster GIF exports and is separate from the headgear viewer's `sprites/manifest.json`.

Keep filenames and subfolders intact. The bundled map viewer looks for `<mapcode>.<extension>` directly in `search-app/img/map/`; BMP paths recorded by the builder may need to be arranged accordingly if the source uses nested map folders.

### Image files are separate

The JavaScript exports contain data and resource names, not embedded images. Use **GRF extractor** for direct artwork extraction and GIF conversion, or convert extracted ACT/SPR pairs in **Sprite studio**. Install artwork in your destination website's image folders. Preserve the mapped filenames and case.

ItemInfo resource names remain in each item's `client` fields. The GRF extractor preserves client texture filenames and formats in `item/`; it does not rename them to item IDs. Card mappings only identify card illustrations. `accessoryid.lub` is not part of the supported item upload set.

## JavaScript output and data details

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

### Data Builder source formats

- **YAML:** rAthena `ITEM_DB` and `MOB_DB` files with `Body` entries. Duplicate keys produce warnings; the last value wins.
- **Lua/LUB:** readable literal tables. Lua code is never executed; decompile binary LUB files first.
- **Legacy TXT:** `item_db*.txt` with 22 columns and `mob_db*.txt` with 57 columns.
- **Map names:** `mapnametable.txt` records in `map.rsw#Display name#` format, exported as `mapDATA` in `map-data.js`.
- **Map BMPs:** `<mapcode>.bmp` images in `map/` (or selected individually), indexed by filename into `map-data.js`.
- **Limits:** 64 MB per source file and 256 MB per build.

The GRF headgear extractor has separate support for the accessory mapping tables described below.

## Convert monster sprites

1. Open **Sprite studio** (`sprites.php`) and select matching `.act` and `.spr` files from the same folder.
2. Preview a pair and choose its action, size, speed, and background.
3. Download the GIF or export the folder as ZIP.

Batch exports place one GIF per sprite in `monster/` and include a manifest and report. Missing pairs, invalid assets, and duplicate output names are reported.

Supports SPR 1.1, 2.0, 2.1 and ACT 1.1, 2.0–2.5. Large animations may require smaller batches or lower export sizes. For direct GRF conversion, use **GRF extractor**.

## Headgear previews in Data Search

Headgear item cards display an **Item preview** below the Collection image. Choose Male or Female, rotate through eight directions, and switch between Standing and Walking. Animated previews have Play/Pause controls and pause while off screen. Reduced-motion preferences start animation paused.

Open **GRF extractor** (`grf.php`), choose `data.grf`, and click **Download as ZIP** (or **Extract to folder**). The export includes Novice/headgear assets under `sprite/` alongside the other artwork folders. Copy the contents of the exported `sprite/` folder into `search-app/img/sprites/`, then refresh the search app.

The GRF stays in the browser. Selecting it only reads the file index and accessory mapping tables; extraction starts when you click an export button. ACT/SPR pairs are validated as they are exported, and the preview catalog is included after its referenced pairs have been written. No sprite assets are uploaded to or automatically installed on the server. Texture and monster GIF exports are still available if an archive lacks the preview sources; unavailable sprites are explained in the report.

The viewer uses each item's server `View`, falling back to client `ClassNum`. ACT anchors align the head and headgear to the body. Missing assets and items with no sprite view show an unavailable message. Scripted hat effects, garments, weapons, and equip restrictions are not simulated. Previewing an item on a Novice demonstrates its appearance, not whether that character can equip it.

Serve the app over HTTP(S), including localhost. When deploying it, preserve the relative paths to the shared `assets/formats.js`, `assets/renderer.js`, and `assets/vendor/gifenc.js` modules alongside `search-app/`. The browser never downloads the GRF itself. No changes are needed to the existing item data tables.

### Optional command-line sprite preparation

With Node.js 24 installed, run from the project directory:

```powershell
node tools/prepare-headgear-sprites.mjs 'C:\path\to\data.grf'
```

The command writes preview assets directly to `search-app/img/sprites/`.

Both methods read the archive without changing it and write male/female Novice bodies, default heads, available headgear ACT/SPR pairs, `manifest.json`, and `extraction-report.json`. Choose the archive again after changing your client resources. They share the same extraction rules and use the archive's `AccessoryId.lub` and `AccName.lub` tables (preferring `Datainfo/`) to resolve view IDs, extracting the male/female `data/sprite/악세사리/` resources. Compiled Lua 5.1 table assignments and readable Lua tables exported by GRF Editor are supported; Lua functions and host access are not executed. Output size varies by client and can be several hundred MB; the page loads only the sprites it displays.

To rebuild the installed previews with corrected external mappings, supply both tables from the same client:

```powershell
node tools/prepare-headgear-sprites.mjs 'C:\path\to\data.grf' --accessory-id 'C:\path\to\accessoryid.lub' --acc-name 'C:\path\to\accname.lub'
```

These overrides take precedence over the archive's tables. The CLI backs up the previous catalogs, reuses unchanged sprites, and gives changed sprites new filenames before replacing the catalog. Missing sprite pairs are listed in `extraction-report.json`; mapping tables do not contain the sprite artwork itself. Browser exports continue to use the selected GRF's tables.

If the client loads additional GRFs, append `--overlay 'C:\path\to\patch.grf'` for each one, from lowest to highest priority (reverse numeric order in `DATA.INI`). Later archives replace earlier resources at the same path. The external mapping pair still takes precedence over all embedded tables.

### Use the exported artwork

- **Item icons:** GRF extractor preserves client texture filenames and formats in `item/`. Mapping those to ID-named PNGs, if required by your website, is a separate step.
- **Monster animations:** the exports contain `monster/<sprite_name>.gif` and `sprite-manifest.json`. Use the mapped `gif` field in your monster data to connect artwork to records.
- Preserve the manifest's `file`, `name`, `action`, and dimensions when using it in your destination website.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Opening `index.php` or `search.php` shows Data Builder | Both URLs redirect there. Open `search-app/index.html` for Data Search. |
| Data Search reports that the database could not be opened | All three files must be present in `search-app/lib/`: `item-data.js`, `monster-data.js`, and `map-data.js`. |
| Tables build successfully but are not saved | Review the import report for session or permission errors. Download the tables and copy them into `search-app/lib/` if needed. |
| Item, monster, or map artwork is missing | Check the artwork destination table, filenames, and client/database mappings. Artwork is installed separately from the data tables. |
| A headgear preview is unavailable | Check `search-app/img/sprites/manifest.json` and its referenced ACT/SPR files, then review `extraction-report.json` for missing mappings or sprites. |

## References and bundled libraries

- ACT / SPR layouts: [Ragnarok Research Lab](https://ragnarokresearchlab.github.io/file-formats/).
- GRF layout: [Ragnarok Research Lab](https://ragnarokresearchlab.github.io/file-formats/grf/). Standard GRF DES decoder adapted from [grf-loader](https://github.com/vthibault/grf-loader) (MIT); attribution and license are in `assets/vendor/grf-des-LICENSE.txt`.
- GRF 3.0/protected-record format reference: [GRF Editor](https://github.com/Tokeiburu/GRFEditor/tree/main/GRF/Core). The browser decoder uses native WebCrypto and locally bundled [hash-wasm 4.12.0](https://github.com/Daninet/hash-wasm/tree/v4.12.0); its MIT license and embedded xxHash BSD notices are in `assets/vendor/hash-wasm-LICENSE.txt` and `assets/vendor/hash-wasm-xxhash-LICENSE.txt`.
- Streaming ZIP64 export: [zip.js 2.20.0](https://github.com/gildas-lormeau/zip.js/tree/v2.20.0), bundled native ES module; BSD-3-Clause license in `assets/vendor/zip-LICENSE.txt`. No runtime CDN or npm install is required.
- rAthena fields: [Renewal item database](https://github.com/rathena/rathena/blob/master/db/re/item_db.yml) and [monster database](https://github.com/rathena/rathena/blob/master/db/re/mob_db.yml).
- [jQuery 3.7.1](https://jquery.com/), [js-yaml 4.1.1](https://github.com/nodeca/js-yaml), [gifenc 1.0.3](https://github.com/mattdesl/gifenc), and [fflate 0.8.2](https://github.com/101arrowz/fflate). Their MIT license files are distributed alongside the libraries.
