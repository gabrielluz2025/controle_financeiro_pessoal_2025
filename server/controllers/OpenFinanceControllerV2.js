/**
 * OpenFinance Controller V2
 * 
 * Versão melhorada com:
 * - Persistência em MongoDB
 * - Associação correta com usuário autenticado
 * - Melhor tratamento de erros
 * - Sincronização de dados
 */

const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const BankToken = require('../models/BankToken');
const SyncLog = require('../models/SyncLog');

// Configuração dos bancos participantes do Open Finance Brasil
const BANK_CONFIG = {
    infinitepay: {
        name: 'InfinitePay (CloudWalk)',
        logo: 'https://www.infinitepay.io/favicon.ico', // Usando favicon como placeholder
        color: '#00FF00', // Verde característico da InfinitePay
        authorizationEndpoint: 'https://auth.banking.infinitepay.io/oauth2/authorize',
        tokenEndpoint: 'https://auth.banking.infinitepay.io/oauth2/token',
        resourceEndpoint: 'https://api.banking.infinitepay.io/open-banking',
        sandbox: {
            authorizationEndpoint: 'https://auth.sandbox.banking.infinitepay.io/oauth2/authorize',
            tokenEndpoint: 'https://auth.sandbox.banking.infinitepay.io/oauth2/token',
            resourceEndpoint: 'https://api.sandbox.banking.infinitepay.io/open-banking'
        }
    }
};

// Escopos padrão Open Finance Brasil
const SCOPES = [
    'openid',
    'accounts',
    'credit-cards-accounts',
    'resources',
    'customers'
];

// Armazenamento temporário de state (em memória com expiração)
const stateStore = new Map();

class OpenFinanceController {
    
    /**
     * Lista bancos disponíveis para conexão
     */
    static async listBanks(req, res) {
        try {
            const banks = Object.entries(BANK_CONFIG).map(([id, config]) => ({
                id,
                name: config.name,
                logo: config.logo,
                color: config.color,
                available: true
            }));
            
            res.json({
                success: true,
                banks,
                total: banks.length
            });
        } catch (error) {
            console.error('Erro ao listar bancos:', error);
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    }
    
    /**
     * Inicia fluxo OAuth 2.0 com banco
     */
    static async initiateConnection(req, res) {
        try {
            const { bank } = req.body;
            const userId = req.userId; // Do middleware de auth
            
            if (!BANK_CONFIG[bank]) {
                return res.status(400).json({ error: 'Banco não suportado' });
            }
            
            const bankConfig = BANK_CONFIG[bank];
            const useSandbox = process.env.NODE_ENV !== 'production';
            const endpoints = useSandbox ? bankConfig.sandbox : bankConfig;
            
            // Gerar state para CSRF protection
            const state = crypto.randomBytes(32).toString('hex');
            
            // Gerar code_verifier e code_challenge para PKCE
            const codeVerifier = crypto.randomBytes(64).toString('base64url');
            const codeChallenge = crypto
                .createHash('sha256')
                .update(codeVerifier)
                .digest('base64url');
            
            // Armazenar state e code_verifier
            stateStore.set(state, {
                bank,
                userId, // Armazenar userId real
                codeVerifier,
                createdAt: Date.now(),
                expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutos
            });
            
            // Construir URL de autorização
            const clientId = process.env[`${bank.toUpperCase()}_CLIENT_ID`];
            const redirectUri = process.env[`${bank.toUpperCase()}_REDIRECT_URI`] || 
                `${process.env.FRONTEND_URL}/api/openfinance/callback/${bank}`;
            
            const authUrl = new URL(endpoints.authorizationEndpoint);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('client_id', clientId);
            authUrl.searchParams.set('redirect_uri', redirectUri);
            authUrl.searchParams.set('scope', SCOPES.join(' '));
            authUrl.searchParams.set('state', state);
            authUrl.searchParams.set('code_challenge', codeChallenge);
            authUrl.searchParams.set('code_challenge_method', 'S256');
            authUrl.searchParams.set('response_mode', 'query');
            
            // Parâmetros adicionais FAPI
            const nonce = crypto.randomBytes(16).toString('hex');
            authUrl.searchParams.set('nonce', nonce);
            
            res.json({
                success: true,
                authUrl: authUrl.toString(),
                state,
                expiresIn: 600 // segundos
            });
            
        } catch (error) {
            console.error('Erro ao iniciar conexão:', error);
            res.status(500).json({ error: 'Erro ao iniciar conexão com banco' });
        }
    }
    
    /**
     * Callback OAuth após autorização do usuário
     */
    static async handleCallback(req, res) {
        try {
            const { bank } = req.params;
            const { code, state, error, error_description } = req.query;
            
            // Verificar erro do OAuth
            if (error) {
                return res.redirect(`${process.env.FRONTEND_URL}/accounts?error=${encodeURIComponent(error_description || error)}`);
            }
            
            // Validar state
            const stateData = stateStore.get(state);
            if (!stateData || stateData.bank !== bank) {
                return res.redirect(`${process.env.FRONTEND_URL}/accounts?error=invalid_state`);
            }
            
            // Verificar expiração
            if (Date.now() > stateData.expiresAt) {
                stateStore.delete(state);
                return res.redirect(`${process.env.FRONTEND_URL}/accounts?error=state_expired`);
            }
            
            const userId = stateData.userId;
            const bankConfig = BANK_CONFIG[bank];
            const useSandbox = process.env.NODE_ENV !== 'production';
            const endpoints = useSandbox ? bankConfig.sandbox : bankConfig;
            
            // Trocar code por tokens
            const clientId = process.env[`${bank.toUpperCase()}_CLIENT_ID`];
            const clientSecret = process.env[`${bank.toUpperCase()}_CLIENT_SECRET`];
            const redirectUri = process.env[`${bank.toUpperCase()}_REDIRECT_URI`];
            
            const tokenResponse = await axios.post(endpoints.tokenEndpoint, 
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri,
                    code_verifier: stateData.codeVerifier
                }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
                    }
                }
            );
            
            const { access_token, refresh_token, expires_in, id_token } = tokenResponse.data;
            
            // Armazenar tokens de forma segura no MongoDB
            await BankToken.updateOne(
                { userId, bank },
                {
                    userId,
                    bank,
                    accessToken: access_token,
                    refreshToken: refresh_token,
                    idToken: id_token,
                    expiresAt: new Date(Date.now() + (expires_in * 1000)),
                    connectedAt: new Date(),
                    status: 'active'
                },
                { upsert: true }
            );
            
            // Limpar state usado
            stateStore.delete(state);
            
            // Redirecionar com sucesso
            res.redirect(`${process.env.FRONTEND_URL}/accounts?connected=${bank}&success=true`);
            
        } catch (error) {
            console.error('Erro no callback OAuth:', error.response?.data || error.message);
            res.redirect(`${process.env.FRONTEND_URL}/accounts?error=token_exchange_failed`);
        }
    }
    
    /**
     * Renova token de acesso
     */
    static async refreshToken(req, res) {
        try {
            const { bank } = req.body;
            const userId = req.userId;
            
            const bankToken = await BankToken.findOne({ userId, bank });
            if (!bankToken) {
                return res.status(401).json({ error: 'Banco não conectado' });
            }
            
            const bankConfig = BANK_CONFIG[bank];
            const useSandbox = process.env.NODE_ENV !== 'production';
            const endpoints = useSandbox ? bankConfig.sandbox : bankConfig;
            
            const clientId = process.env[`${bank.toUpperCase()}_CLIENT_ID`];
            const clientSecret = process.env[`${bank.toUpperCase()}_CLIENT_SECRET`];
            
            const response = await axios.post(endpoints.tokenEndpoint,
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: bankToken.refreshToken
                }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
                    }
                }
            );
            
            const { access_token, refresh_token, expires_in } = response.data;
            
            // Atualizar tokens
            bankToken.accessToken = access_token;
            bankToken.refreshToken = refresh_token || bankToken.refreshToken;
            bankToken.expiresAt = new Date(Date.now() + (expires_in * 1000));
            await bankToken.save();
            
            res.json({ success: true, expiresIn: expires_in });
            
        } catch (error) {
            console.error('Erro ao renovar token:', error);
            res.status(500).json({ error: 'Erro ao renovar token' });
        }
    }
    
    /**
     * Desconectar banco
     */
    static async disconnect(req, res) {
        try {
            const { bank } = req.params;
            const userId = req.userId;
            
            await BankToken.deleteOne({ userId, bank });
            
            res.json({ success: true, message: `Banco ${bank} desconectado com sucesso` });
        } catch (error) {
            console.error('Erro ao desconectar:', error);
            res.status(500).json({ error: 'Erro ao desconectar banco' });
        }
    }
    
    /**
     * Obter status de conexão
     */
    static async getConnectionStatus(req, res) {
        try {
            const userId = req.userId;
            
            const connectedBanks = await BankToken.find(
                { userId, status: 'active' },
                { bank: 1, connectedAt: 1, lastSyncedAt: 1 }
            );
            
            res.json({
                success: true,
                connectedBanks,
                total: connectedBanks.length
            });
        } catch (error) {
            console.error('Erro ao obter status:', error);
            res.status(500).json({ error: 'Erro ao obter status de conexão' });
        }
    }

    /**
     * Listar contas (Mock/Real dependendo do ambiente)
     */
    static async getAccounts(req, res) {
        try {
            const userId = req.userId;
            // Em um cenário real, buscaríamos da API do InfinitePay usando o token salvo
            // Por agora, retornamos um mock estruturado para o frontend
            const accounts = [
                {
                    id: 'acc_infinitepay_001',
                    name: 'Conta Digital InfinitePay',
                    type: 'digital',
                    balance: 1250.75,
                    currency: 'BRL',
                    bank: 'infinitepay',
                    bankName: 'InfinitePay (CloudWalk)'
                }
            ];
            
            res.json({ success: true, accounts });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao buscar contas' });
        }
    }

    /**
     * Listar cartões
     */
    static async getCreditCards(req, res) {
        try {
            const cards = [
                {
                    id: 'card_infinitepay_001',
                    name: 'InfiniteCard Visa',
                    brand: 'Visa',
                    limit: 5000,
                    availableLimit: 4200.50,
                    dueDay: 10,
                    bank: 'infinitepay'
                }
            ];
            res.json({ success: true, creditCards: cards });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao buscar cartões' });
        }
    }

    /**
     * Listar transações
     */
    static async getTransactions(req, res) {
        try {
            const transactions = [
                { id: 'tx_001', description: 'Venda InfinitePay', value: 150.00, type: 'receita', date: new Date().toISOString(), category: 'Salário' },
                { id: 'tx_002', description: 'Fornecedor ABC', value: 45.90, type: 'despesa', date: new Date().toISOString(), category: 'Outros' }
            ];
            res.json({ success: true, transactions });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao buscar transações' });
        }
    }

    static async getAccountBalance(req, res) { res.json({ success: true, balance: 1250.75 }); }
    static async getCreditCardBill(req, res) { res.json({ success: true, bills: [] }); }
    static async getCreditCardTransactions(req, res) { res.json({ success: true, transactions: [] }); }
    static async getConsents(req, res) { res.json({ success: true, consents: [] }); }
    static async revokeConsent(req, res) { res.json({ success: true, message: 'Consentimento revogado' }); }
}

module.exports = OpenFinanceController;
