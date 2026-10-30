<?php
function page_start($title, $active) {
    header('Content-Type: text/html; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    $safeTitle = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . $safeTitle . ' · Ragnarok Atlas</title><link rel="stylesheet" href="assets/style.css"></head><body>';
    echo '<header class="site-header"><a class="brand" href="index.php"><span class="brand-icon">R</span><span>Ragnarok <strong>Atlas</strong><small>YOUR WORLD, DOCUMENTED</small></span></a><nav aria-label="Main navigation">';
    foreach (['builder.php'=>'Data builder', 'grf.php'=>'GRF extractor', 'sprites.php'=>'Sprite studio'] as $path=>$label) {
        echo '<a href="' . $path . '"' . ($active === $path ? ' aria-current="page"' : '') . '>' . $label . '</a>';
    }
    echo '</nav><span class="badge"><i></i> Renewal</span></header><main>';
}
function page_end($module) {
    $version = (int) filemtime(dirname(__DIR__) . '/assets/' . $module);
    $storageNote = $module === 'builder.js' ? 'Built tables save to search-app/lib/ on this server.' : 'Your files stay in your browser.';
    echo '</main><footer class="site-footer"><span>RAGNAROK ATLAS <span class="muted">/ Local database toolkit</span></span><span>' . $storageNote . '</span></footer><script src="assets/vendor/jquery.min.js"></script><script src="assets/vendor/fflate.js"></script><script type="module" src="assets/' . htmlspecialchars($module, ENT_QUOTES, 'UTF-8') . '?v=' . $version . '"></script></body></html>';
}
