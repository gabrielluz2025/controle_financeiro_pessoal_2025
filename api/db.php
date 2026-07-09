<?php
function getDbConfig() {
    $configFile = __DIR__ . '/config.php';
    if (!file_exists($configFile)) {
        throw new RuntimeException('Arquivo api/config.php não encontrado.');
    }
    return require $configFile;
}

function getDb() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $config = getDbConfig();
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        $config['db_name']
    );

    $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    return $pdo;
}

function ensureSchema(PDO $pdo) {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS financeiro_data (
            id INT PRIMARY KEY,
            data_json LONGTEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $stmt = $pdo->query('SELECT COUNT(*) AS total FROM financeiro_data WHERE id = 1');
    $row = $stmt->fetch();
    if ((int) $row['total'] === 0) {
        $empty = json_encode([
            'accounts' => [],
            'creditCards' => [],
            'transactions' => [],
            'categories' => [],
            'budgets' => [],
        ], JSON_UNESCAPED_UNICODE);

        $insert = $pdo->prepare('INSERT INTO financeiro_data (id, data_json) VALUES (1, ?)');
        $insert->execute([$empty]);
    }
}
