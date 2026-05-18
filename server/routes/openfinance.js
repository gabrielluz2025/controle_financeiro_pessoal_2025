/**
 * Rotas Open Finance Brasil
 * 
 * Implementa integração real com bancos brasileiros via Open Finance
 * seguindo as especificações do Banco Central do Brasil
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { validateToken } = require('../middleware/auth');
const OpenFinanceController = require('../controllers/OpenFinanceControllerV2');

// Validação de banco
const validateBank = body('bank')
    .isIn(['infinitepay'])
    .withMessage('Banco não suportado');

// ================================================
// ROTAS DE CONEXÃO (Protegidas por Token)
// ================================================

/**
 * GET /api/openfinance/banks
 * Lista bancos disponíveis para conexão
 */
router.get('/banks', OpenFinanceController.listBanks);

/**
 * POST /api/openfinance/connect
 * Inicia fluxo OAuth 2.0 com banco selecionado
 */
router.post('/connect', [validateToken, validateBank], OpenFinanceController.initiateConnection);

/**
 * POST /api/openfinance/sync
 * Sincroniza e importa dados do banco para o sistema
 */
router.post('/sync', validateToken, OpenFinanceController.syncData);

/**
 * GET /api/openfinance/callback/:bank
 * Callback OAuth do banco após autorização do usuário
 */
router.get('/callback/:bank', OpenFinanceController.handleCallback);

/**
 * POST /api/openfinance/token/refresh
 * Renova token de acesso
 */
router.post('/token/refresh', OpenFinanceController.refreshToken);

/**
 * DELETE /api/openfinance/disconnect/:bank
 * Desconecta banco e revoga tokens
 */
router.delete('/disconnect/:bank', OpenFinanceController.disconnect);

// ================================================
// ROTAS DE DADOS
// ================================================

/**
 * GET /api/openfinance/accounts
 * Lista contas do usuário conectadas via Open Finance
 */
router.get('/accounts', OpenFinanceController.getAccounts);

/**
 * GET /api/openfinance/accounts/:accountId/balance
 * Obtém saldo de conta específica
 */
router.get('/accounts/:accountId/balance', OpenFinanceController.getAccountBalance);

/**
 * GET /api/openfinance/accounts/:accountId/transactions
 * Lista transações de conta específica
 */
router.get('/accounts/:accountId/transactions', OpenFinanceController.getTransactions);

/**
 * GET /api/openfinance/credit-cards
 * Lista cartões de crédito conectados
 */
router.get('/credit-cards', OpenFinanceController.getCreditCards);

/**
 * GET /api/openfinance/credit-cards/:cardId/bill
 * Obtém fatura do cartão
 */
router.get('/credit-cards/:cardId/bill', OpenFinanceController.getCreditCardBill);

/**
 * GET /api/openfinance/credit-cards/:cardId/transactions
 * Lista transações do cartão
 */
router.get('/credit-cards/:cardId/transactions', OpenFinanceController.getCreditCardTransactions);

// ================================================
// ROTAS DE STATUS
// ================================================

/**
 * GET /api/openfinance/status
 * Status das conexões Open Finance do usuário
 */
router.get('/status', OpenFinanceController.getConnectionStatus);

/**
 * GET /api/openfinance/consents
 * Lista consentimentos ativos
 */
router.get('/consents', OpenFinanceController.getConsents);

/**
 * DELETE /api/openfinance/consents/:consentId
 * Revoga consentimento específico
 */
router.delete('/consents/:consentId', OpenFinanceController.revokeConsent);

module.exports = router;
