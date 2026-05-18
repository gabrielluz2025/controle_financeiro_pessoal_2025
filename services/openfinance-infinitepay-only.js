/**
 * Serviço Open Finance - Integração Exclusiva com InfinitePay
 * Conecta apenas com InfinitePay via OAuth 2.0 e Open Banking
 */
class OpenFinanceServiceInfinitePay {
    constructor() {
        this.apiEndpoint = 'https://api.banking.infinitepay.io/open-banking/v1';
        this.authEndpoint = 'https://auth.banking.infinitepay.io/oauth2/authorize';
        
        this.oauthConfig = {
            clientId: 'your_client_id',
            redirectUri: window.location.origin + '/oauth/callback',
            scopes: ['accounts.read', 'transactions.read', 'cards.read']
        };
        
        this.accessToken = localStorage.getItem('infinitepay_auth_token') || null;
        this.isConnected = localStorage.getItem('infinitepay_connected') === 'true';
    }

    /**
     * Obtém token de acesso armazenado
     */
    getAccessToken() {
        return this.accessToken || localStorage.getItem('infinitepay_auth_token') || '';
    }

    /**
     * Define token de acesso
     */
    setAccessToken(token) {
        this.accessToken = token;
        localStorage.setItem('infinitepay_auth_token', token);
    }

    /**
     * Verifica se está conectado ao InfinitePay
     */
    isConnectedToInfinitePay() {
        return this.isConnected;
    }

    /**
     * Inicia fluxo OAuth 2.0 com InfinitePay
     */
    async connectToInfinitePay() {
        try {
            console.log('🔗 Iniciando conexão com InfinitePay...');
            
            // Verificar se já está conectado
            if (this.isConnected) {
                throw new Error('Você já está conectado ao InfinitePay');
            }
            
            // Obter URL base da API
            const apiBaseUrl = window.OpenFinanceConfig?.apiBaseUrl || 'http://localhost:3000/api';
            
            // Chamar backend para iniciar conexão OAuth
            const response = await fetch(`${apiBaseUrl}/openfinance/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAccessToken()}`
                },
                body: JSON.stringify({ bank: 'infinitepay' })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Erro ao conectar com InfinitePay');
            }
            
            const data = await response.json();
            
            if (!data.authUrl) {
                throw new Error('URL de autenticação não recebida');
            }
            
            console.log('🔗 Abrindo autenticação OAuth para InfinitePay...');
            
            // Abrir popup para autenticação
            const popup = window.open(data.authUrl, 'infinitepay_oauth', 'width=500,height=600,scrollbars=yes,resizable=yes');
            
            if (!popup) {
                throw new Error('Não foi possível abrir a janela de autenticação. Verifique se o popup não foi bloqueado.');
            }
            
            // Aguardar callback
            return new Promise((resolve, reject) => {
                const checkPopup = setInterval(() => {
                    if (!popup || popup.closed) {
                        clearInterval(checkPopup);
                        reject(new Error('Autenticação cancelada pelo usuário'));
                        return;
                    }
                    
                    try {
                        const popupUrl = new URL(popup.location.href);
                        const code = popupUrl.searchParams.get('code');
                        const error = popupUrl.searchParams.get('error');
                        
                        if (code) {
                            clearInterval(checkPopup);
                            popup.close();
                            this.exchangeCodeForToken(code)
                                .then(resolve)
                                .catch(reject);
                        } else if (error) {
                            clearInterval(checkPopup);
                            popup.close();
                            reject(new Error(`Erro na autenticação: ${error}`));
                        }
                    } catch (e) {
                        // Ainda está na página de login, continuar aguardando
                    }
                }, 1000);
                
                // Timeout após 5 minutos
                setTimeout(() => {
                    clearInterval(checkPopup);
                    if (popup && !popup.closed) {
                        popup.close();
                    }
                    reject(new Error('Timeout na autenticação'));
                }, 300000);
            });
            
        } catch (error) {
            console.error('❌ Erro na conexão:', error);
            throw error;
        }
    }

    /**
     * Troca código por token de acesso
     */
    async exchangeCodeForToken(code) {
        try {
            console.log('🔄 Trocando código por token...');
            
            const response = await fetch(this.apiEndpoint + '/oauth/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    client_id: this.oauthConfig.clientId,
                    redirect_uri: this.oauthConfig.redirectUri
                })
            });
            
            if (!response.ok) {
                throw new Error(`Erro na troca de token: ${response.status}`);
            }
            
            const tokenData = await response.json();
            this.accessToken = tokenData.access_token;
            this.isConnected = true;
            localStorage.setItem('infinitepay_connected', 'true');
            
            // Buscar dados do InfinitePay
            const bankData = await this.fetchInfinitepayData();
            
            console.log('✅ Conectado com sucesso ao InfinitePay');
            return {
                success: true,
                bank: 'infinitepay',
                data: bankData
            };
            
        } catch (error) {
            console.error('❌ Erro na troca de token:', error);
            throw error;
        }
    }

    /**
     * Busca dados reais do InfinitePay
     */
    async fetchInfinitepayData() {
        try {
            console.log('📊 Buscando dados do InfinitePay...');
            
            const headers = {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            };
            
            // Buscar contas
            const accountsResponse = await fetch(this.apiEndpoint + '/accounts', {
                headers
            });
            
            // Buscar cartões
            const cardsResponse = await fetch(this.apiEndpoint + '/cards', {
                headers
            });
            
            // Buscar transações (últimos 90 dias)
            const transactionsResponse = await fetch(this.apiEndpoint + '/transactions?limit=100', {
                headers
            });
            
            const [accounts, cards, transactions] = await Promise.all([
                accountsResponse.json(),
                cardsResponse.json(),
                transactionsResponse.json()
            ]);
            
            return {
                accounts: this.normalizeAccounts(accounts.data || []),
                creditCards: this.normalizeCards(cards.data || []),
                transactions: this.normalizeTransactions(transactions.data || []),
                summary: {
                    totalIncome: transactions.data?.filter(t => t.type === 'credit').reduce((sum, t) => sum + t.amount, 0) || 0,
                    totalExpense: transactions.data?.filter(t => t.type === 'debit').reduce((sum, t) => sum + t.amount, 0) || 0,
                    transactionCount: transactions.data?.length || 0
                },
                lastSync: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Erro ao buscar dados do InfinitePay:', error);
            throw error;
        }
    }

    /**
     * Normaliza dados de contas
     */
    normalizeAccounts(rawAccounts) {
        return rawAccounts.map(account => ({
            id: account.id || account.accountId,
            name: account.name || account.displayName,
            type: account.type || 'digital',
            balance: account.balance || account.currentBalance || 0,
            initialBalance: account.balance || account.currentBalance || 0,
            bankLogo: 'https://www.infinitepay.io/favicon.ico',
            currency: account.currency || 'BRL'
        }));
    }

    /**
     * Normaliza dados de cartões
     */
    normalizeCards(rawCards) {
        return rawCards.map(card => ({
            id: card.id || card.cardId,
            name: card.name || card.displayName,
            limit: card.limit || card.creditLimit || 0,
            availableLimit: card.availableLimit || card.availableCreditLimit || 0,
            dueDay: card.dueDay || 20,
            brand: card.brand || 'Visa',
            linkedAccountId: card.linkedAccountId || card.accountId,
            currency: card.currency || 'BRL'
        }));
    }

    /**
     * Normaliza dados de transações
     */
    normalizeTransactions(rawTransactions) {
        return rawTransactions.map(tx => ({
            id: tx.id || tx.transactionId,
            description: tx.description || tx.merchantName,
            value: Math.abs(tx.amount || tx.value || 0),
            date: tx.date || tx.transactionDate,
            category: this.categorizeTransaction(tx),
            fundamentalType: tx.type === 'credit' || tx.amount > 0 ? 'receita' : 'despesa',
            isPaid: tx.status === 'completed' || tx.status === 'posted',
            isCreditCard: tx.isCreditCardTransaction || false,
            accountId: tx.accountId,
            currency: tx.currency || 'BRL',
            merchantName: tx.merchantName || tx.description,
            bookingDate: tx.bookingDate || tx.date
        }));
    }

    /**
     * Categoriza transação automaticamente
     */
    categorizeTransaction(tx) {
        const description = (tx.description || tx.merchantName || '').toLowerCase();
        
        const categories = {
            'Alimentação': ['restaurante', 'supermercado', 'ifood', 'padaria', 'mercado', 'açougue'],
            'Transporte': ['uber', '99', 'taxi', 'combustível', 'gasolina', 'estacionamento', 'metrô'],
            'Moradia': ['aluguel', 'condomínio', 'luz', 'água', 'gás', 'internet'],
            'Lazer': ['cinema', 'netflix', 'spotify', 'academia', 'gym', 'clube'],
            'Saúde': ['farmácia', 'médico', 'hospital', 'exame', 'dentista', 'plano'],
            'Educação': ['faculdade', 'curso', 'livro', 'escola', 'aula'],
            'Compras': ['amazon', 'magazine', 'shopee', 'mercado livre', 'loja'],
            'Investimentos': ['investimento', 'fundo', 'ação', 'tesouro'],
            'Salário': ['salário', 'recebimento', 'adiantamento', 'bônus', 'plr']
        };
        
        for (const [category, keywords] of Object.entries(categories)) {
            if (keywords.some(keyword => description.includes(keyword))) {
                return category;
            }
        }
        
        return 'Outros';
    }

    /**
     * Desconecta do InfinitePay
     */
    disconnect() {
        this.accessToken = null;
        this.isConnected = false;
        localStorage.removeItem('infinitepay_auth_token');
        localStorage.removeItem('infinitepay_connected');
        console.log('✅ Desconectado do InfinitePay');
    }

    /**
     * Sincroniza dados com InfinitePay
     */
    async syncData() {
        if (!this.isConnected) {
            throw new Error('Não conectado ao InfinitePay');
        }
        
        console.log('🔄 Sincronizando dados com InfinitePay...');
        return await this.fetchInfinitepayData();
    }
};

// Criar instância global
const openFinanceService = new OpenFinanceServiceInfinitePay();
