/**
 * Controlador para Integração Real com InfinitePay
 * Implementa chamadas reais à API do InfinitePay e suporte a webhooks
 */

const axios = require('axios');
const crypto = require('crypto');
const BankToken = require('../models/BankToken');
const Account = require('../models/Account');
const Card = require('../models/Card');
const Transaction = require('../models/Transaction');

class InfinitepayRealController {
    /**
     * Endpoints da API InfinitePay (Sandbox e Produção)
     */
    static getEndpoints() {
        const useSandbox = process.env.NODE_ENV !== 'production';
        return {
            sandbox: {
                auth: 'https://auth.sandbox.banking.infinitepay.io/oauth2/authorize',
                token: 'https://auth.sandbox.banking.infinitepay.io/oauth2/token',
                accounts: 'https://api.sandbox.banking.infinitepay.io/v1/accounts',
                transactions: 'https://api.sandbox.banking.infinitepay.io/v1/transactions',
                cards: 'https://api.sandbox.banking.infinitepay.io/v1/cards'
            },
            production: {
                auth: 'https://auth.banking.infinitepay.io/oauth2/authorize',
                token: 'https://auth.banking.infinitepay.io/oauth2/token',
                accounts: 'https://api.banking.infinitepay.io/v1/accounts',
                transactions: 'https://api.banking.infinitepay.io/v1/transactions',
                cards: 'https://api.banking.infinitepay.io/v1/cards'
            }
        };
    }

    /**
     * Obtém as credenciais do InfinitePay
     */
    static getCredentials() {
        return {
            clientId: process.env.INFINITEPAY_CLIENT_ID || 'mock_client_id',
            clientSecret: process.env.INFINITEPAY_CLIENT_SECRET || 'mock_secret',
            redirectUri: process.env.INFINITEPAY_REDIRECT_URI || `${process.env.FRONTEND_URL}/oauth/callback`
        };
    }

    /**
     * Busca contas reais do usuário na API do InfinitePay
     */
    static async fetchRealAccounts(accessToken) {
        try {
            const useSandbox = process.env.NODE_ENV !== 'production';
            const endpoints = this.getEndpoints();
            const baseUrl = useSandbox ? endpoints.sandbox.accounts : endpoints.production.accounts;

            const response = await axios.get(baseUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            console.log('✅ Contas reais obtidas da API InfinitePay');
            return response.data.data || [];
        } catch (error) {
            console.warn('⚠️ Erro ao buscar contas reais:', error.message);
            return null;
        }
    }

    /**
     * Busca transações reais do usuário na API do InfinitePay
     */
    static async fetchRealTransactions(accessToken, accountId = null, limit = 100) {
        try {
            const useSandbox = process.env.NODE_ENV !== 'production';
            const endpoints = this.getEndpoints();
            let url = useSandbox ? endpoints.sandbox.transactions : endpoints.production.transactions;

            if (accountId) {
                url += `?accountId=${accountId}&limit=${limit}`;
            } else {
                url += `?limit=${limit}`;
            }

            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            console.log('✅ Transações reais obtidas da API InfinitePay');
            return response.data.data || [];
        } catch (error) {
            console.warn('⚠️ Erro ao buscar transações reais:', error.message);
            return null;
        }
    }

    /**
     * Busca cartões reais do usuário na API do InfinitePay
     */
    static async fetchRealCards(accessToken) {
        try {
            const useSandbox = process.env.NODE_ENV !== 'production';
            const endpoints = this.getEndpoints();
            const baseUrl = useSandbox ? endpoints.sandbox.cards : endpoints.production.cards;

            const response = await axios.get(baseUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            console.log('✅ Cartões reais obtidos da API InfinitePay');
            return response.data.data || [];
        } catch (error) {
            console.warn('⚠️ Erro ao buscar cartões reais:', error.message);
            return null;
        }
    }

    /**
     * Sincroniza dados reais do InfinitePay para o banco de dados local
     */
    static async syncRealData(userId, accessToken) {
        try {
            console.log(`📥 Iniciando sincronização real de dados para usuário: ${userId}`);

            const importedAccounts = [];
            const importedCards = [];
            const importedTransactions = [];

            // 1. Buscar e importar contas reais
            const realAccounts = await this.fetchRealAccounts(accessToken);
            if (realAccounts && Array.isArray(realAccounts)) {
                for (const acc of realAccounts) {
                    try {
                        const account = await Account.findOneAndUpdate(
                            { userId, name: acc.name || acc.id },
                            {
                                userId,
                                name: acc.name || acc.id,
                                type: acc.type || 'corrente',
                                balance: acc.balance || 0,
                                initialBalance: acc.balance || 0,
                                bankName: 'InfinitePay',
                                bankLogo: 'https://assets.infinitepay.io/brand/infinitepay-logo-symbol.svg',
                                externalId: acc.id,
                                lastSyncedAt: new Date()
                            },
                            { upsert: true, new: true }
                        );
                        importedAccounts.push(account);
                        console.log(`✅ Conta sincronizada: ${account.name}`);
                    } catch (e) {
                        console.warn(`⚠️ Erro ao sincronizar conta ${acc.name}:`, e.message);
                    }
                }
            }

            // 2. Buscar e importar cartões reais
            const realCards = await this.fetchRealCards(accessToken);
            if (realCards && Array.isArray(realCards)) {
                for (const card of realCards) {
                    try {
                        const linkedAccount = importedAccounts[0];
                        await Card.findOneAndUpdate(
                            { userId, name: card.name || card.id },
                            {
                                userId,
                                name: card.name || card.id,
                                brand: card.brand || 'Mastercard',
                                limit: card.limit || 0,
                                availableLimit: card.availableLimit || card.limit || 0,
                                dueDay: card.dueDay || 10,
                                linkedAccountId: linkedAccount?._id,
                                externalId: card.id,
                                lastSyncedAt: new Date()
                            },
                            { upsert: true, new: true }
                        );
                        importedCards.push(card);
                        console.log(`✅ Cartão sincronizado: ${card.name}`);
                    } catch (e) {
                        console.warn(`⚠️ Erro ao sincronizar cartão ${card.name}:`, e.message);
                    }
                }
            }

            // 3. Buscar e importar transações reais
            const realTransactions = await this.fetchRealTransactions(accessToken);
            if (realTransactions && Array.isArray(realTransactions)) {
                for (const tx of realTransactions) {
                    try {
                        // Evitar duplicatas
                        const startOfDay = new Date(tx.date || new Date());
                        startOfDay.setHours(0, 0, 0, 0);
                        const endOfDay = new Date(tx.date || new Date());
                        endOfDay.setHours(23, 59, 59, 999);

                        const exists = await Transaction.findOne({
                            userId,
                            description: tx.description,
                            date: { $gte: startOfDay, $lte: endOfDay },
                            externalId: tx.id
                        });

                        if (!exists) {
                            const linkedAccount = importedAccounts[0];
                            await new Transaction({
                                userId,
                                accountId: linkedAccount?._id,
                                description: tx.description,
                                value: tx.value || 0,
                                fundamentalType: tx.type === 'receita' ? 'receita' : 'despesa',
                                category: tx.category || 'Outros',
                                date: tx.date || new Date(),
                                isPaid: true,
                                isCreditCard: false,
                                externalId: tx.id,
                                lastSyncedAt: new Date()
                            }).save();
                            importedTransactions.push(tx);
                        }
                    } catch (e) {
                        console.warn(`⚠️ Erro ao sincronizar transação:`, e.message);
                    }
                }
            }

            // 4. Atualizar token com último sync
            try {
                await BankToken.findOneAndUpdate(
                    { userId, bank: 'infinitepay' },
                    { lastSyncedAt: new Date() }
                );
            } catch (e) {
                console.warn('⚠️ Erro ao atualizar token de sincronização');
            }

            console.log(`✅ Sincronização concluída: ${importedAccounts.length} contas, ${importedCards.length} cartões, ${importedTransactions.length} transações`);

            return {
                success: true,
                summary: {
                    accounts: importedAccounts.length,
                    cards: importedCards.length,
                    transactions: importedTransactions.length
                },
                data: {
                    accounts: importedAccounts,
                    cards: importedCards,
                    transactions: importedTransactions
                }
            };
        } catch (error) {
            console.error('❌ Erro na sincronização real:', error);
            throw error;
        }
    }

    /**
     * Processa webhook de pagamento recebido do InfinitePay
     */
    static async handlePaymentWebhook(req, res) {
        try {
            const { event, data } = req.body;

            console.log(`🔔 Webhook recebido: ${event}`);

            if (event === 'payment.completed') {
                // Criar transação automaticamente quando pagamento é recebido
                const userId = data.userId || '000000000000000000000000';
                const account = await Account.findOne({ userId, bankName: 'InfinitePay' });

                if (account) {
                    const transaction = new Transaction({
                        userId,
                        accountId: account._id,
                        description: `Pagamento recebido - ${data.description || 'Venda'}`,
                        value: data.amount || 0,
                        fundamentalType: 'receita',
                        category: 'Receita',
                        date: new Date(),
                        isPaid: true,
                        isCreditCard: false,
                        externalId: data.paymentId,
                        webhookData: data
                    });

                    await transaction.save();
                    console.log(`✅ Transação criada automaticamente via webhook`);
                }
            }

            res.json({ success: true, message: 'Webhook processado' });
        } catch (error) {
            console.error('❌ Erro ao processar webhook:', error);
            res.status(500).json({ error: 'Erro ao processar webhook' });
        }
    }

    /**
     * Retorna a URL para registrar webhook no InfinitePay
     */
    static getWebhookUrl() {
        return `${process.env.FRONTEND_URL}/api/openfinance/webhook/infinitepay`;
    }
}

module.exports = InfinitepayRealController;
