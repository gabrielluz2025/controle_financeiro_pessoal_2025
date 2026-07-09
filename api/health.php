<?php
header('Content-Type: application/json; charset=utf-8');

require __DIR__ . '/db.php';

try {
    $pdo = getDb();
    ensureSchema($pdo);
    $pdo->query('SELECT 1');

    echo json_encode([
        'status' => 'ok',
        'database' => 'connected',
        'timestamp' => date('c'),
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'database' => 'disconnected',
        'message' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
