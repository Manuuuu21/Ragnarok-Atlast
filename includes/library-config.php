<?php
// Paths are project-relative. No user-supplied paths are loaded by this page.
function library_config($root) {
    $pick = function ($paths, $directory = false) use ($root) {
        foreach ($paths as $path) {
            if ($directory ? is_dir($root . '/' . $path) : is_file($root . '/' . $path)) return $path;
        }
        return null;
    };
    $items = $pick(['lib/item-data.js', 'lib/js/item-data.js']);
    $monsters = $pick(['lib/mob-data.js', 'lib/monster-data.js', 'lib/js/mob-data.js', 'lib/js/monster-data.js']);
    $missing = [];
    if (!$items) $missing[] = 'lib/item-data.js';
    if (!$monsters) $missing[] = 'lib/mob-data.js (or lib/monster-data.js)';
    return [
        'scripts' => array_values(array_filter([$items, $monsters])),
        'sourceLabel' => 'lib/ · Renewal',
        'useBrowserPreview' => false,
        'missingFiles' => $missing,
        'itemImageBase' => ($pick(['lib/items', 'lib/item', 'items', 'item'], true) ?? 'lib/items') . '/',
        'monsterImageBase' => ($pick(['lib/monster', 'monster'], true) ?? 'lib/monster') . '/',
        'cardImageBase' => ($pick(['lib/cardbmp', 'cardbmp'], true) ?? 'lib/cardbmp') . '/',
        'manifestUrl' => $pick(['lib/sprite-manifest.json']),
        'manifestBase' => 'lib/',
    ];
}
