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

    $body  = json_decode(file_get_contents('php://input'), true) ?? [];
    $action = $body['action'] ?? $_GET['action'] ?? '';

    switch ($action) {

        // ── Registro ──────────────────────────────────────────────────────────
        case 'register': {
            $name     = trim($body['name'] ?? '');
            $email    = strtolower(trim($body['email'] ?? ''));
            $password = $body['password'] ?? '';

            if (!$name || !$email || !$password) {
                jsonResponse(['error' => 'Preencha nome, e-mail e senha.'], 400);
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                jsonResponse(['error' => 'E-mail inválido.'], 400);
            }
            if (strlen($password) < 6) {
                jsonResponse(['error' => 'A senha deve ter ao menos 6 caracteres.'], 400);
            }

            // Verificar duplicata
            $chk = $pdo->prepare('SELECT id FROM users WHERE email = ?');
            $chk->execute([$email]);
            if ($chk->fetch()) {
                jsonResponse(['error' => 'Este e-mail já está cadastrado.'], 409);
            }

            $hash = password_hash($password, PASSWORD_DEFAULT);
            $ins  = $pdo->prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
            $ins->execute([$name, $email, $hash]);
            $userId = (int) $pdo->lastInsertId();

            // Criar registro de dados vazio para o usuário
            $emptyJson = json_encode(emptyData(), JSON_UNESCAPED_UNICODE);
            $dataIns = $pdo->prepare('INSERT INTO user_data (user_id, data_json) VALUES (?, ?)');
            $dataIns->execute([$userId, $emptyJson]);

            $token = generateToken($pdo, $userId);

            jsonResponse([
                'ok'    => true,
                'token' => $token,
                'user'  => ['id' => $userId, 'name' => $name, 'email' => $email],
            ]);
        }

        // ── Login ─────────────────────────────────────────────────────────────
        case 'login': {
            $email    = strtolower(trim($body['email'] ?? ''));
            $password = $body['password'] ?? '';

            if (!$email || !$password) {
                jsonResponse(['error' => 'Informe e-mail e senha.'], 400);
            }

            $stmt = $pdo->prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?');
            $stmt->execute([$email]);
            $user = $stmt->fetch();

            if (!$user || !password_verify($password, $user['password_hash'])) {
                jsonResponse(['error' => 'E-mail ou senha incorretos.'], 401);
            }

            $token = generateToken($pdo, (int) $user['id']);

            jsonResponse([
                'ok'    => true,
                'token' => $token,
                'user'  => [
                    'id'    => (int) $user['id'],
                    'name'  => $user['name'],
                    'email' => $user['email'],
                ],
            ]);
        }

        // ── Logout ────────────────────────────────────────────────────────────
        case 'logout': {
            $userId = validateToken($pdo);
            if ($userId) {
                $pdo->prepare('UPDATE users SET token = NULL, token_expires_at = NULL WHERE id = ?')
                    ->execute([$userId]);
            }
            jsonResponse(['ok' => true]);
        }

        // ── Verificar sessão (page load) ──────────────────────────────────────
        case 'me': {
            $userId = validateToken($pdo);
            if (!$userId) {
                jsonResponse(['error' => 'Sessão expirada. Faça login novamente.'], 401);
            }
            $stmt = $pdo->prepare('SELECT id, name, email FROM users WHERE id = ?');
            $stmt->execute([$userId]);
            $user = $stmt->fetch();
            if (!$user) {
                jsonResponse(['error' => 'Usuário não encontrado.'], 404);
            }
            jsonResponse([
                'ok'   => true,
                'user' => [
                    'id'    => (int) $user['id'],
                    'name'  => $user['name'],
                    'email' => $user['email'],
                ],
            ]);
        }

        // ── Alterar senha ─────────────────────────────────────────────────────
        case 'change_password': {
            $userId = validateToken($pdo);
            if (!$userId) jsonResponse(['error' => 'Não autenticado.'], 401);

            $current = $body['current_password'] ?? '';
            $newPass = $body['new_password'] ?? '';

            if (!$current || !$newPass) {
                jsonResponse(['error' => 'Informe a senha atual e a nova senha.'], 400);
            }
            if (strlen($newPass) < 6) {
                jsonResponse(['error' => 'A nova senha deve ter ao menos 6 caracteres.'], 400);
            }

            $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ?');
            $stmt->execute([$userId]);
            $row = $stmt->fetch();

            if (!password_verify($current, $row['password_hash'])) {
                jsonResponse(['error' => 'Senha atual incorreta.'], 401);
            }

            $newHash = password_hash($newPass, PASSWORD_DEFAULT);
            $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')
                ->execute([$newHash, $userId]);

            jsonResponse(['ok' => true]);
        }

        default:
            jsonResponse(['error' => 'Ação inválida.'], 400);
    }

} catch (Exception $e) {
    jsonResponse(['error' => 'Erro interno: ' . $e->getMessage()], 500);
}
