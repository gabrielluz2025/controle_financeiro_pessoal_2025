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
    nubank: {
        name: 'Nubank',
        logo: 'https://logodownload.org/wp-content/uploads/2019/10/nubank-logo-0.png',
        color: '#820AD1',
        authorizationEndpoint: 'https://auth.nubank.com.br/oauth2/authorize',
        tokenEndpoint: 'https://auth.nubank.com.br/oauth2/token',
        resourceEndpoint: 'https://openbanking.nubank.com.br',
        sandbox: {
            authorizationEndpoint: 'https://auth.sandbox.nubank.com.br/oauth2/authorize',
            tokenEndpoint: 'https://auth.sandbox.nubank.com.br/oauth2/token',
            resourceEndpoint: 'https://openbanking.sandbox.nubank.com.br'
        }
    },
    itau: {
        name: 'Itaú',
        logo: 'https://logodownload.org/wp-content/uploads/2019/02/logo-itau.png',
        color: '#EC7000',
        authorizationEndpoint: 'https://sts.itau.com.br/seguranca/v1/oauth2/authorize',
        tokenEndpoint: 'https://sts.itau.com.br/seguranca/v1/oauth2/token',
        resourceEndpoint: 'https://openbanking.itau.com.br',
        sandbox: {
            authorizationEndpoint: 'https://sts.sandbox.itau.com.br/seguranca/v1/oauth2/authorize',
            tokenEndpoint: 'https://sts.sandbox.itau.com.br/seguranca/v1/oauth2/token',
            resourceEndpoint: 'https://openbanking.sandbox.itau.com.br'
        }
    },
    bradesco: {
        name: 'Bradesco',
        logo: 'https://logodownload.org/wp-content/uploads/2019/03/logo-bradesco-0.png',
        color: '#CC092F',
        authorizationEndpoint: 'https://proxy.api.prebanco.com.br/auth/oauth/v2/authorize',
        tokenEndpoint: 'https://proxy.api.prebanco.com.br/auth/oauth/v2/token',
        resourceEndpoint: 'https://proxy.api.prebanco.com.br/open-banking',
        sandbox: {
            authorizationEndpoint: 'https://proxy.api.sandbox.prebanco.com.br/auth/oauth/v2/authorize',
            tokenEndpoint: 'https://proxy.api.sandbox.prebanco.com.br/auth/oauth/v2/token',
            resourceEndpoint: 'https://proxy.api.sandbox.prebanco.com.br/open-banking'
        }
    },
    santander: {
        name: 'Santander',
        logo: 'https://logodownload.org/wp-content/uploads/2019/03/logo-santander-0.png',
        color: '#EC0000',
        authorizationEndpoint: 'https://openbanking.santander.com.br/oauth/authorize',
        tokenEndpoint: 'https://openbanking.santander.com.br/oauth/token',
        resourceEndpoint: 'https://openbanking.santander.com.br',
        sandbox: {
            authorizationEndpoint: 'https://openbanking.sandbox.santander.com.br/oauth/authorize',
            tokenEndpoint: 'https://openbanking.sandbox.santander.com.br/oauth/token',
            resourceEndpoint: 'https://openbanking.sandbox.santander.com.br'
        }
    },
    bb: {
        name: 'Banco do Brasil',
        logo: 'https://logodownload.org/wp-content/uploads/2019/03/logo-banco-do-brasil.png',
        color: '#FFEF00',
        authorizationEndpoint: 'https://oauth.bb.com.br/oauth/authorize',
        tokenEndpoint: 'https://oauth.bb.com.br/oauth/token',
        resourceEndpoint: 'https://openbanking.bb.com.br',
        sandbox: {
            authorizationEndpoint: 'https://oauth.sandbox.bb.com.br/oauth/authorize',
            tokenEndpoint: 'https://oauth.sandbox.bb.com.br/oauth/token',
            resourceEndpoint: 'https://openbanking.sandbox.bb.com.br'
        }
    },
    caixa: {
        name: 'Caixa Econômica',
        logo: 'https://logodownload.org/wp-content/uploads/2019/03/logo-caixa-0.png',
        color: '#005CA9',
        authorizationEndpoint: 'https://apisdigitais.caixa.gov.br/oauth/authorize',
        tokenEndpoint: 'https://apisdigitais.caixa.gov.br/oauth/token',
        resourceEndpoint: 'https://apisdigitais.caixa.gov.br/open-banking',
        sandbox: {
            authorizationEndpoint: 'https://apisdigitais.sandbox.caixa.gov.br/oauth/authorize',
            tokenEndpoint: 'https://apisdigitais.sandbox.caixa.gov.br/oauth/token',
            resourceEndpoint: 'https://apisdigitais.sandbox.caixa.gov.br/open-banking'
        }
    },
    inter: {
        name: 'Banco Inter',
        logo: 'https://logodownload.org/wp-content/uploads/2020/04/banco-inter-logo-0.png',
        color: '#FF7A00',
        authorizationEndpoint: 'https://cdpj.partners.bancointer.com.br/oauth/v2/authorize',
        tokenEndpoint: 'https://cdpj.partners.bancointer.com.br/oauth/v2/token',
        resourceEndpoint: 'https://cdpj.partners.bancointer.com.br/open-banking',
        sandbox: {
            authorizationEndpoint: 'https://cdpj.partners.sandbox.bancointer.com.br/oauth/v2/authorize',
            tokenEndpoint: 'https://cdpj.partners.sandbox.bancointer.com.br/oauth/v2/token',
            resourceEndpoint: 'https://cdpj.partners.sandbox.bancointer.com.br/open-banking'
        }
    },
    c6bank: {
        name: 'C6 Bank',
        logo: 'https://logodownload.org/wp-content/uploads/2020/07/c6-bank-logo-0.png',
        color: '#242424',
        authorizationEndpoint: 'https://auth.c6bank.com.br/oauth2/authorize',
        tokenEndpoint: 'https://auth.c6bank.com.br/oauth2/token',
        resourceEndpoint: 'https://openbanking.c6bank.com.br',
        sandbox: {
            authorizationEndpoint: 'https://auth.sandbox.c6bank.com.br/oauth2/authorize',
            tokenEndpoint: 'https://auth.sandbox.c6bank.com.br/oauth2/token',
            resourceEndpoint: 'https://openbanking.sandbox.c6bank.com.br'
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
}

module.exports = OpenFinanceController;
