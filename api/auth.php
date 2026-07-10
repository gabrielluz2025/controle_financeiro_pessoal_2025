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

        // ── Esqueci minha senha ───────────────────────────────────────────────
        case 'forgot_password': {
            $email = strtolower(trim($body['email'] ?? ''));
            if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                jsonResponse(['error' => 'Informe um e-mail válido.'], 400);
            }

            $msg = 'Se este e-mail estiver cadastrado, enviamos um link para redefinir sua senha. Verifique também a pasta de spam.';

            $stmt = $pdo->prepare('SELECT id, name, email FROM users WHERE email = ?');
            $stmt->execute([$email]);
            $user = $stmt->fetch();

            if ($user) {
                $token = bin2hex(random_bytes(32));
                $tokenHash = hash('sha256', $token);
                $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));

                $pdo->prepare('DELETE FROM password_resets WHERE user_id = ?')->execute([(int) $user['id']]);
                $pdo->prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
                    ->execute([(int) $user['id'], $tokenHash, $expires]);

                $host = $_SERVER['HTTP_HOST'] ?? 'financasmais.com';
                $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                $resetUrl = $scheme . '://' . $host . '/classico.html?reset=' . urlencode($token);

                $subject = 'Finanças+ — Redefinir sua senha';
                $mailBody = "Olá, {$user['name']}!\n\n"
                    . "Recebemos um pedido para redefinir sua senha no Finanças+.\n\n"
                    . "Clique no link abaixo (válido por 1 hora):\n{$resetUrl}\n\n"
                    . "Se você não solicitou, ignore este e-mail.\n\n— Finanças+";
                $headers = "From: Finanças+ <noreply@{$host}>\r\nContent-Type: text/plain; charset=UTF-8";
                @mail($user['email'], $subject, $mailBody, $headers);
            }

            jsonResponse(['ok' => true, 'message' => $msg]);
        }

        // ── Redefinir senha (com token do e-mail) ─────────────────────────────
        case 'reset_password': {
            $token   = trim($body['token'] ?? '');
            $newPass = $body['new_password'] ?? '';

            if (!$token || strlen($token) < 32) {
                jsonResponse(['error' => 'Link inválido ou expirado.'], 400);
            }
            if (strlen($newPass) < 6) {
                jsonResponse(['error' => 'A nova senha deve ter ao menos 6 caracteres.'], 400);
            }

            $tokenHash = hash('sha256', $token);
            $stmt = $pdo->prepare('
                SELECT pr.user_id FROM password_resets pr
                WHERE pr.token_hash = ? AND pr.expires_at > NOW()
            ');
            $stmt->execute([$tokenHash]);
            $row = $stmt->fetch();

            if (!$row) {
                jsonResponse(['error' => 'Link inválido ou expirado. Solicite um novo.'], 400);
            }

            $userId = (int) $row['user_id'];
            $newHash = password_hash($newPass, PASSWORD_DEFAULT);
            $pdo->prepare('UPDATE users SET password_hash = ?, token = NULL, token_expires_at = NULL WHERE id = ?')
                ->execute([$newHash, $userId]);
            $pdo->prepare('DELETE FROM password_resets WHERE user_id = ?')->execute([$userId]);

            jsonResponse(['ok' => true, 'message' => 'Senha redefinida! Faça login com a nova senha.']);
        }

        default:
            jsonResponse(['error' => 'Ação inválida.'], 400);
    }

} catch (Exception $e) {
    jsonResponse(['error' => 'Erro interno: ' . $e->getMessage()], 500);
}
