<?php
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require __DIR__ . '/db.php';

try {
    $pdo = getDb();
    ensureSchema($pdo);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $stmt = $pdo->query('SELECT data_json FROM financeiro_data WHERE id = 1');
        $row = $stmt->fetch();

        if (!$row) {
            echo json_encode([
                'accounts' => [],
                'creditCards' => [],
                'transactions' => [],
                'categories' => [],
                'budgets' => [],
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        echo $row['data_json'];
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = file_get_contents('php://input');
        $data = json_decode($body, true);

        if (!is_array($data)) {
            http_response_code(400);
            echo json_encode(['error' => 'JSON inválido']);
            exit;
        }

        $payload = json_encode([
            'accounts' => $data['accounts'] ?? [],
            'creditCards' => $data['creditCards'] ?? [],
            'transactions' => $data['transactions'] ?? [],
            'categories' => $data['categories'] ?? [],
            'budgets' => $data['budgets'] ?? [],
        ], JSON_UNESCAPED_UNICODE);

        $stmt = $pdo->prepare('
            INSERT INTO financeiro_data (id, data_json)
            VALUES (1, ?)
            ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), updated_at = CURRENT_TIMESTAMP
        ');
        $stmt->execute([$payload]);

        echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Método não permitido']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
