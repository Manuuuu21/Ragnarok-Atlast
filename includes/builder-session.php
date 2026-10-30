<?php
// The save endpoint accepts requests only from a builder session.
function builder_save_token() {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        $options = ['cookie_httponly' => true];
        if (PHP_VERSION_ID >= 70300) $options['cookie_samesite'] = 'Strict';
        if (!@session_start($options)) return '';
    }
    if (empty($_SESSION['builder_save_token'])) {
        $_SESSION['builder_save_token'] = bin2hex(random_bytes(32));
    }
    $token = $_SESSION['builder_save_token'];
    session_write_close();
    return $token;
}
