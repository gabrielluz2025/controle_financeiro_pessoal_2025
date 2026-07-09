<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// Ler body da requisição (pode conter clientId/clientSecret enviados pelo frontend)
$rawInput = file_get_contents('php://input');
$inputData = json_decode($rawInput, true) ?? [];

// Ordem de prioridade para credenciais:
// 1. Arquivo pluggy-credentials.php no servidor (mais seguro)
// 2. Variáveis de ambiente
// 3. Credenciais enviadas pelo frontend via POST (para uso pessoal, sobre HTTPS)
if (file_exists(__DIR__ . '/pluggy-credentials.php')) {
    require_once __DIR__ . '/pluggy-credentials.php';
}

$PLUGGY_CLIENT_ID     = defined('PLUGGY_CLIENT_ID')     ? PLUGGY_CLIENT_ID     : (getenv('PLUGGY_CLIENT_ID')     ?: ($inputData['clientId']     ?? ''));
$PLUGGY_CLIENT_SECRET = defined('PLUGGY_CLIENT_SECRET') ? PLUGGY_CLIENT_SECRET : (getenv('PLUGGY_CLIENT_SECRET') ?: ($inputData['clientSecret'] ?? ''));
$PLUGGY_API           = 'https://api.pluggy.ai';

function pluggy_request(string $method, string $path, array $body = [], string $apiKey = ''): array {
    global $PLUGGY_API;
    $ch = curl_init($PLUGGY_API . $path);
    $headers = ['Content-Type: application/json'];
    if ($apiKey) $headers[] = "X-API-KEY: $apiKey";
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 15,
    ]);
    if ($body) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $data = json_decode($res, true) ?? [];
    $data['_http_status'] = $code;
    return $data;
}

function get_api_key(string $clientId, string $clientSecret): string {
    $res = pluggy_request('POST', '/auth', ['clientId' => $clientId, 'clientSecret' => $clientSecret]);
    return $res['apiKey'] ?? '';
}

$action = $_GET['action'] ?? $_POST['action'] ?? 'connect_token';

try {
    switch ($action) {

        // ── Criar connect token (para abrir o Pluggy Widget) ──────────────
        case 'connect_token': {
            if (!$PLUGGY_CLIENT_ID || !$PLUGGY_CLIENT_SECRET) {
                http_response_code(400);
                echo json_encode(['error' => 'Pluggy credentials not configured. Add PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET to api/config.php']);
                exit;
            }
            $apiKey   = get_api_key($PLUGGY_CLIENT_ID, $PLUGGY_CLIENT_SECRET);
            $body     = ['clientUserId' => 'financasmais-user'];
            $input    = json_decode(file_get_contents('php://input'), true);
            if (!empty($input['itemId'])) $body['itemId'] = $input['itemId'];
            $res = pluggy_request('POST', '/connect_token', $body, $apiKey);
            echo json_encode(['connectToken' => $res['accessToken'] ?? null, 'error' => $res['error'] ?? null]);
            break;
        }

        // ── Listar items (bancos conectados) ───────────────────────────────
        case 'items': {
            if (!$PLUGGY_CLIENT_ID || !$PLUGGY_CLIENT_SECRET) {
                echo json_encode(['results' => [], 'error' => 'credentials_missing']); exit;
            }
            $apiKey = get_api_key($PLUGGY_CLIENT_ID, $PLUGGY_CLIENT_SECRET);
            $res    = pluggy_request('GET', '/items', [], $apiKey);
            echo json_encode(['results' => $res['results'] ?? []]);
            break;
        }

        // ── Buscar contas de um item ───────────────────────────────────────
        case 'accounts': {
            $itemId = $_GET['itemId'] ?? '';
            if (!$itemId) { echo json_encode(['error' => 'itemId required']); exit; }
            $apiKey = get_api_key($PLUGGY_CLIENT_ID, $PLUGGY_CLIENT_SECRET);
            $res    = pluggy_request('GET', "/accounts?itemId=$itemId", [], $apiKey);
            echo json_encode(['results' => $res['results'] ?? []]);
            break;
        }

        // ── Buscar transações de uma conta ─────────────────────────────────
        case 'transactions': {
            $accountId = $_GET['accountId'] ?? '';
            $from      = $_GET['from'] ?? date('Y-m-d', strtotime('-30 days'));
            $to        = $_GET['to']   ?? date('Y-m-d');
            if (!$accountId) { echo json_encode(['error' => 'accountId required']); exit; }
            $apiKey = get_api_key($PLUGGY_CLIENT_ID, $PLUGGY_CLIENT_SECRET);
            $res    = pluggy_request('GET', "/transactions?accountId=$accountId&from=$from&to=$to&pageSize=100", [], $apiKey);
            echo json_encode(['results' => $res['results'] ?? []]);
            break;
        }

        // ── Buscar cartões de crédito ─────────────────────────────────────
        case 'credit_cards': {
            $itemId = $_GET['itemId'] ?? '';
            if (!$itemId) { echo json_encode(['error' => 'itemId required']); exit; }
            $apiKey = get_api_key($PLUGGY_CLIENT_ID, $PLUGGY_CLIENT_SECRET);
            // Credit cards are accounts of type CREDIT
            $res    = pluggy_request('GET', "/accounts?itemId=$itemId&type=CREDIT", [], $apiKey);
            echo json_encode(['results' => $res['results'] ?? []]);
            break;
        }

        // ── Sincronizar todos os dados (contas + transações) ───────────────
        case 'sync_all': {
            if (!$PLUGGY_CLIENT_ID || !$PLUGGY_CLIENT_SECRET) {
                echo json_encode(['accounts' => [], 'transactions' => [], 'creditCards' => [], 'error' => 'credentials_missing']); exit;
            }
            $apiKey     = get_api_key($PLUGGY_CLIENT_ID, $PLUGGY_CLIENT_SECRET);
            $itemsRes   = pluggy_request('GET', '/items', [], $apiKey);
            $items      = $itemsRes['results'] ?? [];
            $accounts   = []; $creditCards = []; $transactions = [];

            foreach ($items as $item) {
                if (($item['status'] ?? '') !== 'UPDATED') continue;
                $accsRes = pluggy_request('GET', "/accounts?itemId={$item['id']}", [], $apiKey);
                foreach ($accsRes['results'] ?? [] as $acc) {
                    $type = $acc['type'] ?? 'BANK';
                    if ($type === 'CREDIT') {
                        $creditCards[] = [
                            'id'             => 'pluggy-' . $acc['id'],
                            'name'           => $acc['name'] . ' (' . ($item['connector']['name'] ?? 'Banco') . ')',
                            'brand'          => $item['connector']['name'] ?? 'Visa',
                            'limit'          => $acc['creditData']['creditLimit'] ?? 0,
                            'availableLimit' => $acc['creditData']['availableCreditLimit'] ?? 0,
                            'dueDay'         => (int)($acc['creditData']['dueDate'] ? date('d', strtotime($acc['creditData']['dueDate'])) : 10),
                            'pluggyId'       => $acc['id'],
                            'pluggyItemId'   => $item['id'],
                        ];
                    } else {
                        $accounts[] = [
                            'id'             => 'pluggy-' . $acc['id'],
                            'name'           => $acc['name'] . ' (' . ($item['connector']['name'] ?? 'Banco') . ')',
                            'type'           => strtolower($acc['subtype'] ?? 'corrente'),
                            'balance'        => $acc['balance'] ?? 0,
                            'initialBalance' => $acc['balance'] ?? 0,
                            'bankName'       => $item['connector']['name'] ?? '',
                            'pluggyId'       => $acc['id'],
                            'pluggyItemId'   => $item['id'],
                        ];
                        // Fetch transactions
                        $from   = date('Y-m-d', strtotime('-30 days'));
                        $to     = date('Y-m-d');
                        $txRes  = pluggy_request('GET', "/transactions?accountId={$acc['id']}&from=$from&to=$to&pageSize=100", [], $apiKey);
                        foreach ($txRes['results'] ?? [] as $tx) {
                            $transactions[] = [
                                'id'              => 'pluggy-' . $tx['id'],
                                'description'     => $tx['description'] ?? $tx['descriptionRaw'] ?? 'Transação',
                                'value'           => abs($tx['amount'] ?? 0),
                                'fundamentalType' => ($tx['type'] ?? 'DEBIT') === 'CREDIT' ? 'receita' : 'despesa',
                                'category'        => $tx['category'] ?? 'Outros',
                                'date'            => substr($tx['date'] ?? date('Y-m-d'), 0, 10),
                                'isPaid'          => true,
                                'accountId'       => 'pluggy-' . $acc['id'],
                                'isCreditCard'    => false,
                                'paidByAccountId' => 'pluggy-' . $acc['id'],
                            ];
                        }
                    }
                }
            }
            echo json_encode(compact('accounts', 'creditCards', 'transactions'));
            break;
        }

        default:
            http_response_code(400);
            echo json_encode(['error' => "Unknown action: $action"]);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
