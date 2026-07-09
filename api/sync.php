<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require __DIR__ . '/db.php';

function jsonResponse(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $pdo = getDb();
    ensureSchema($pdo);

    // Autenticação obrigatória
    $userId = validateToken($pdo);
    if (!$userId) {
        jsonResponse(['error' => 'Não autenticado. Faça login para continuar.'], 401);
    }

    // ── GET: carregar dados do usuário ────────────────────────────────────────
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $stmt = $pdo->prepare('SELECT data_json FROM user_data WHERE user_id = ?');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();

        if (!$row) {
            // Criar registro vazio se não existir
            $emptyJson = json_encode(emptyData(), JSON_UNESCAPED_UNICODE);
            $pdo->prepare('INSERT INTO user_data (user_id, data_json) VALUES (?, ?)')
                ->execute([$userId, $emptyJson]);
            echo $emptyJson;
        } else {
            echo $row['data_json'];
        }
        exit;
    }

    // ── POST: salvar dados do usuário ─────────────────────────────────────────
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = file_get_contents('php://input');
        $data = json_decode($body, true);

        if (!is_array($data)) {
            jsonResponse(['error' => 'JSON inválido'], 400);
        }

        $payload = json_encode([
            'accounts'     => $data['accounts']     ?? [],
            'creditCards'  => $data['creditCards']  ?? [],
            'transactions' => $data['transactions'] ?? [],
            'categories'   => $data['categories']   ?? [],
            'budgets'      => $data['budgets']       ?? [],
        ], JSON_UNESCAPED_UNICODE);

        // Upsert: INSERT ... ON DUPLICATE KEY UPDATE
        $stmt = $pdo->prepare('
            INSERT INTO user_data (user_id, data_json)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE data_json = VALUES(data_json)
        ');
        $stmt->execute([$userId, $payload]);

        jsonResponse(['ok' => true, 'saved_at' => date('Y-m-d H:i:s')]);
    }

    jsonResponse(['error' => 'Método não suportado.'], 405);

} catch (Exception $e) {
    jsonResponse(['error' => 'Erro interno: ' . $e->getMessage()], 500);
}
