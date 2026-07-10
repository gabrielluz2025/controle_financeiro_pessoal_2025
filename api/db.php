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
    // Tabela de usuários
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(150) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            token VARCHAR(64) DEFAULT NULL,
            token_expires_at DATETIME DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // Dados financeiros por usuário
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS user_data (
            user_id INT PRIMARY KEY,
            data_json LONGTEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // Tabela legada (mantida para compatibilidade, não usada com auth)
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS financeiro_data (
            id INT PRIMARY KEY,
            data_json LONGTEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // Tokens de redefinição de senha
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS password_resets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token_hash CHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_token (token_hash),
            INDEX idx_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}

/**
 * Valida o token Bearer do header Authorization.
 * Retorna o user_id ou null se inválido/expirado.
 */
function validateToken(PDO $pdo): ?int {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
        return null;
    }
    $token = trim($m[1]);
    if (strlen($token) < 32) return null;

    $stmt = $pdo->prepare('
        SELECT id FROM users
        WHERE token = ? AND token_expires_at > NOW()
    ');
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    return $row ? (int) $row['id'] : null;
}

/**
 * Gera um token seguro de 64 caracteres e salva no usuário.
 * Expira em 30 dias.
 */
function generateToken(PDO $pdo, int $userId): string {
    $token = bin2hex(random_bytes(32)); // 64 chars hex
    $expires = date('Y-m-d H:i:s', strtotime('+30 days'));
    $stmt = $pdo->prepare('UPDATE users SET token = ?, token_expires_at = ? WHERE id = ?');
    $stmt->execute([$token, $expires, $userId]);
    return $token;
}

/**
 * Retorna o JSON de dados vazio padrão.
 */
function emptyData(): array {
    return [
        'accounts'     => [],
        'creditCards'  => [],
        'transactions' => [],
        'categories'   => [],
        'budgets'      => [],
    ];
}
