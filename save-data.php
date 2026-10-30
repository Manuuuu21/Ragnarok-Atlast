<?php
require __DIR__ . '/includes/builder-session.php';
require __DIR__ . '/includes/table-storage.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function save_response($status, $data) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

// PUT keeps large generated tables out of PHP's form-upload/post_max_size limit.
if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    header('Allow: PUT');
    save_response(405, ['error' => 'Use the Data Builder to save tables.']);
}
if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
    save_response(403, ['error' => 'Open the Data Builder on this server before saving.']);
}
$token = builder_save_token();
if ($token === '') {
    save_response(500, ['error' => 'PHP could not open the builder session. Check session storage permissions. Downloads are still available.']);
}
if (!hash_equals($token, $_SERVER['HTTP_X_BUILDER_TOKEN'] ?? '')) {
    save_response(403, ['error' => 'The builder session expired. Download your tables, then refresh the builder before building again.']);
}
if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
    save_response(415, ['error' => 'Expected a JSON data table.']);
}
$name = $_GET['table'] ?? '';
if (!is_string($name) || !isset(BUILDER_TABLE_FILES[$name])) {
    save_response(400, ['error' => 'Unknown data table.']);
}
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > BUILDER_TABLE_LIMIT) {
    save_response(413, ['error' => 'A generated table must be smaller than 128 MB.']);
}
// Large item descriptions need more memory while JSON is validated. This only
// applies to saving; no global PHP configuration is changed.
$memory = trim(ini_get('memory_limit'));
$unit = strtolower(substr($memory, -1));
$memoryBytes = (int) $memory * (['g' => 1073741824, 'm' => 1048576, 'k' => 1024][$unit] ?? 1);
if ($memory !== '-1' && $memoryBytes < 512 * 1024 * 1024) @ini_set('memory_limit', '512M');

try {
    $json = file_get_contents('php://input', false, null, 0, BUILDER_TABLE_LIMIT + 1);
    if ($json === false) throw new RuntimeException('Could not read the generated table.');
    $filename = save_builder_table(__DIR__ . '/search-app/lib', $name, $json);
    save_response(200, ['saved' => $filename]);
} catch (InvalidArgumentException $error) {
    save_response(400, ['error' => $error->getMessage()]);
} catch (LengthException $error) {
    save_response(413, ['error' => $error->getMessage()]);
} catch (Throwable $error) {
    save_response(500, ['error' => $error instanceof RuntimeException ? $error->getMessage() : 'Could not save the generated table. Downloads are still available.']);
}
