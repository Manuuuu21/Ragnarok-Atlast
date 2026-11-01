<?php
function page_start($title, $active) {
    header('Content-Type: text/html; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    $safeTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    $styleVersion = (int) filemtime(dirname(__DIR__) . '/assets/style.css');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . $safeTitle . ' · Ragnarok Atlas</title><link rel="stylesheet" href="assets/style.css?v=' . $styleVersion . '"></head><body>';
    echo '<header class="site-header"><a class="brand" href="index.php"><span class="brand-icon">R</span><span>Ragnarok <strong>Atlas</strong><small>YOUR WORLD, DOCUMENTED</small></span></a><nav aria-label="Main navigation">';
    foreach (['builder.php'=>'Data builder', 'grf.php'=>'GRF extractor', 'sprites.php'=>'Sprite studio'] as $path=>$label) {
        echo '<a href="' . $path . '"' . ($active === $path ? ' aria-current="page"' : '') . '>' . $label . '</a>';
    }
    echo '<button type="button" id="open-settings" class="nav-settings" aria-haspopup="dialog" aria-controls="settings-dialog">Settings</button></nav><span class="badge"><i></i> Renewal</span></header><main>';
}
function page_end($module) {
    $version = (int) filemtime(dirname(__DIR__) . '/assets/' . $module);
    $storageNote = $module === 'builder.js' ? '<span id="builder-storage-note">Direct saving to search-app/lib/ is enabled.</span>' : '<span>Your files stay in your browser.</span>';
    echo '</main><footer class="site-footer"><span>RAGNAROK ATLAS <span class="muted">/ Local database toolkit</span></span>' . $storageNote . '</footer>';
    echo '<dialog id="settings-dialog" class="settings-dialog" aria-labelledby="settings-title">
        <div class="panel-heading"><h2 id="settings-title">Settings</h2><button type="button" id="close-settings" class="text-button settings-close" aria-label="Close settings">&times;</button></div>
        <div class="panel-body">
            <p>Choose how Data Builder saves your generated tables.</p>
            <label class="settings-option"><input type="checkbox" id="save-directly" checked aria-describedby="save-directly-help"><span>Save data directly to <code>search-app/lib/</code></span></label>
            <p id="save-directly-help" class="hint">When enabled, each successful build saves populated <code>item-data.js</code>, <code>monster-data.js</code>, and <code>map-data.js</code> tables to this folder, replacing their previous files. When disabled, use the download buttons; files in this folder stay untouched.</p>
            <p id="settings-busy" class="hint" hidden>Wait for the current build to finish before changing this setting.</p>
            <p id="settings-status" class="hint" role="status">Changes apply immediately and are remembered in this browser. Enabled by default.</p>
        </div>
        <form method="dialog" class="panel-bottom settings-actions"><button class="button primary">Done</button></form>
    </dialog>';
    echo '<script src="assets/vendor/jquery.min.js"></script><script src="assets/vendor/fflate.js"></script><script type="module" src="assets/settings.js?v=direct-save-1"></script><script type="module" src="assets/' . htmlspecialchars($module, ENT_QUOTES, 'UTF-8') . '?v=' . $version . '"></script></body></html>';
}
