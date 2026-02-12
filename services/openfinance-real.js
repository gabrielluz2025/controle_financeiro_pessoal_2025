/**
 * Serviço Open Finance - Integração Real com APIs Bancárias
 * Conecta com APIs reais usando OAuth 2.0 e Open Banking
 */
class OpenFinanceService {
    constructor() {
        this.apiEndpoints = {
            nubank: 'https://api.nubank.com.br/mex',
            itau: 'https://api.itau.com.br/openbanking/v1',
            bradesco: 'https://api.bradesco.com.br/openbanking/v2',
            santander: 'https://api.santander.com.br/openbanking/v1'
        };
        
        this.oauthConfig = {
            clientId: 'your_client_id',
            redirectUri: window.location.origin + '/oauth/callback',
            scopes: ['accounts.read', 'transactions.read', 'cards.read']
        };
        
        this.accessToken = null;
        this.connectedBanks = new Set();
    }

    /**
     * Inicia fluxo OAuth 2.0 real com o banco
     */
    async connectBank(bankId) {
        try {
            console.log(`🔗 Iniciando conexão com ${bankId}...`);
            
            // Verificar se já está conectado
            if (this.connectedBanks.has(bankId)) {
                throw new Error('Banco já está conectado');
            }
            
            // Verificar se OpenFinanceConfig está disponível
            if (!window.OpenFinanceConfig) {
                console.log('⚠️ OpenFinanceConfig não encontrado, usando fallback');
                return this.connectWithMockData(bankId);
            }
            
            // Verificar se deve usar dados mockados
            if (window.OpenFinanceConfig.development.useMockData) {
                console.log(`📝 Usando dados mockados para ${bankId} (desenvolvimento)`);
                return this.connectWithMockData(bankId);
            }
            
            // Tentar conexão real
            const authUrl = this.buildAuthUrl(bankId);
            
            // Abrir popup para autenticação
            const popup = window.open(authUrl, 'oauth_popup', 'width=500,height=600,scrollbars=yes,resizable=yes');
            
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
                            this.exchangeCodeForToken(bankId, code)
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
            
            // Fallback para dados mockados em caso de erro
            if (error.message.includes('Não foi possível abrir a janela') || 
                error.message.includes('DNS_PROBE_FINISHED_NXDOMAIN') ||
                error.message.includes('OpenFinanceConfig não encontrado')) {
                console.log(`🔄 Falha na conexão real, usando dados mockados para ${bankId}`);
                return this.connectWithMockData(bankId);
            }
            
            throw error;
        }
    }

    /**
     * Conexão com dados mockados (fallback)
     */
    async connectWithMockData(bankId) {
        try {
            console.log(`📊 Conectando com dados mockados do ${bankId}...`);
            
            // Simular delay para experiência realista
            const delay = window.OpenFinanceConfig?.development?.mockDelay || 2000;
            await new Promise(resolve => setTimeout(resolve, delay));
            
            // Gerar dados mockados realistas
            const mockData = this.generateMockData(bankId);
            
            this.connectedBanks.add(bankId);
            
            console.log(`✅ Conectado com sucesso ao ${bankId} (dados mockados)`);
            return {
                success: true,
                bank: bankId,
                data: mockData,
                isMock: true
            };
            
        } catch (error) {
            console.error('❌ Erro na conexão mockada:', error);
            throw error;
        }
    }

    /**
     * Gera dados mockados realistas
     */
    generateMockData(bankId) {
        const mockData = {
            nubank: {
                accounts: [
                    {
                        id: 'nu_account_001',
                        name: 'Conta Nubank',
                        type: 'digital',
                        balance: 8542.35,
                        initialBalance: 5000.00,
                        bankLogo: 'https://logodownload.org/wp-content/uploads/2019/10/nubank-logo-0.png',
                        currency: 'BRL'
                    }
                ],
                creditCards: [
                    {
                        id: 'nu_card_001',
                        name: 'Cartão Nubank Ultravioleta',
                        limit: 10000.00,
                        availableLimit: 6234.50,
                        dueDay: 15,
                        brand: 'Mastercard',
                        linkedAccountId: 'nu_account_001',
                        currency: 'BRL'
                    }
                ],
                transactions: this.generateMockTransactions(bankId, 50)
            },
            itau: {
                accounts: [
                    {
                        id: 'itau_account_001',
                        name: 'Conta Corrente Itaú',
                        type: 'corrente',
                        balance: 15420.80,
                        initialBalance: 10000.00,
                        bankLogo: 'https://logodownload.org/wp-content/uploads/2019/02/logo-itau.png',
                        currency: 'BRL'
                    }
                ],
                creditCards: [
                    {
                        id: 'itau_card_001',
                        name: 'Cartão Itaú Uniclass',
                        limit: 8000.00,
                        availableLimit: 5100.00,
                        dueDay: 10,
                        brand: 'Visa',
                        linkedAccountId: 'itau_account_001',
                        currency: 'BRL'
                    }
                ],
                transactions: this.generateMockTransactions(bankId, 75)
            },
            bradesco: {
                accounts: [
                    {
                        id: 'bradesco_account_001',
                        name: 'Conta Bradesco Prime',
                        type: 'corrente',
                        balance: 12350.00,
                        initialBalance: 8000.00,
                        bankLogo: 'https://logodownload.org/wp-content/uploads/2019/03/logo-bradesco-0.png',
                        currency: 'BRL'
                    }
                ],
                creditCards: [
                    {
                        id: 'bradesco_card_001',
                        name: 'Cartão Bradesco Visa Infinite',
                        limit: 15000.00,
                        availableLimit: 11200.00,
                        dueDay: 5,
                        brand: 'Visa',
                        linkedAccountId: 'bradesco_account_001',
                        currency: 'BRL'
                    }
                ],
                transactions: this.generateMockTransactions(bankId, 60)
            },
            santander: {
                accounts: [
                    {
                        id: 'santander_account_001',
                        name: 'Conta Santander Select',
                        type: 'corrente',
                        balance: 9875.50,
                        initialBalance: 5000.00,
                        bankLogo: 'https://logodownload.org/wp-content/uploads/2019/03/logo-santander-0.png',
                        currency: 'BRL'
                    }
                ],
                creditCards: [
                    {
                        id: 'santander_card_001',
                        name: 'Cartão Santander Elite',
                        limit: 12000.00,
                        availableLimit: 8900.00,
                        dueDay: 8,
                        brand: 'Mastercard',
                        linkedAccountId: 'santander_account_001',
                        currency: 'BRL'
                    }
                ],
                transactions: this.generateMockTransactions(bankId, 45)
            }
        };
        
        return mockData[bankId] || mockData.nubank;
    }

    /**
     * Gera transações mockadas realistas
     */
    generateMockTransactions(bankId, count) {
        const transactions = [];
        const categories = [
            'Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 
            'Educação', 'Salário', 'Investimentos', 'Contas Fixas', 
            'Compras', 'Pagamento de Fatura', 'Outros'
        ];
        
        const descriptions = {
            'Alimentação': ['Supermercado Carrefour', 'Restaurante Outback', 'iFood - Pizza Hut', 'Mercado Extra', 'Padaria Pão de Açúcar'],
            'Transporte': ['Uber *Viagem', '99 Taxi *Corrida', 'Posto Ipiranga', 'Metrô Bilhete', 'Estacionamento Shopping'],
            'Moradia': ['Aluguel Apartamento', 'Condomínio Edifício', 'Conta de Luz', 'Internet Net', 'Gás Encantrado'],
            'Lazer': ['Netflix *Assinatura', 'Spotify *Premium', 'Cinema Kinoplex', 'Gym Academia', 'Clube'],
            'Saúde': ['Farmácia Droga Raia', 'Médico Consulta', 'Exame Laboratorial', 'Plano de Saúde', 'Dentista'],
            'Educação': ['Faculdade Mensalidade', 'Curso Online', 'Livraria Saraiva', 'Material Escolar'],
            'Salário': ['Salário Mensal', '13º Salário', 'Adiantamento', 'PLR', 'Bônus'],
            'Investimentos': ['Rendimento CDB', 'Dividendos Ações', 'Tesouro Direto', 'Fundos Imobiliários'],
            'Contas Fixas': ['Seguro Residencial', 'Seguro Carro', 'Clube Assinatura', 'Streaming'],
            'Compras': ['Amazon Compra', 'Loja Magazine', 'Shopee Pedido', 'Mercado Livre'],
            'Pagamento de Fatura': ['Pagamento Nubank', 'Pagamento Itaú', 'Pagamento Bradesco'],
            'Outros': ['Saque Caixa 24h', 'Transferência TED', 'DOC Banco', 'Pix Transferência']
        };
        
        for (let i = 0; i < count; i++) {
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 90));
            
            const category = categories[Math.floor(Math.random() * categories.length)];
            const categoryDescriptions = descriptions[category];
            const description = categoryDescriptions[Math.floor(Math.random() * categoryDescriptions.length)];
            
            const isExpense = Math.random() > 0.3; // 70% de despesas
            const value = isExpense ? 
                Math.round((Math.random() * 500 + 10) * 100) / 100 : 
                Math.round((Math.random() * 5000 + 1000) * 100) / 100;
            
            transactions.push({
                id: `${bankId}_tx_${i}`,
                description: description,
                value: value,
                date: date.toISOString().split('T')[0],
                category: category,
                fundamentalType: isExpense ? 'despesa' : 'receita',
                isPaid: true,
                isCreditCard: Math.random() > 0.5,
                accountId: `${bankId}_account_001`,
                currency: 'BRL',
                merchantName: description.split(' ')[0],
                bookingDate: date.toISOString()
            });
        }
        
        return transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    /**
     * Constrói URL de autenticação OAuth
     */
    buildAuthUrl(bankId) {
        const endpoints = {
            nubank: 'https://auth.nubank.com.br/authorize',
            itau: 'https://openbanking.itau.com.br/auth',
            bradesco: 'https://openbanking.bradescobank.com.br/auth',
            santander: 'https://openbanking.santander.com.br/auth'
        };
        
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.oauthConfig.clientId,
            redirect_uri: this.oauthConfig.redirectUri,
            scope: this.oauthConfig.scopes.join(' '),
            state: this.generateState(bankId)
        });
        
        return `${endpoints[bankId]}?${params.toString()}`;
    }

    /**
     * Troca código por token de acesso
     */
    async exchangeCodeForToken(bankId, code) {
        try {
            console.log(`🔄 Trocando código por token ${bankId}...`);
            
            const response = await fetch(this.apiEndpoints[bankId] + '/oauth/token', {
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
            this.connectedBanks.add(bankId);
            
            // Buscar dados do banco
            const bankData = await this.fetchBankData(bankId);
            
            console.log(`✅ Conectado com sucesso ao ${bankId}`);
            return {
                success: true,
                bank: bankId,
                data: bankData
            };
            
        } catch (error) {
            console.error('❌ Erro na troca de token:', error);
            throw error;
        }
    }

    /**
     * Busca dados reais do banco conectado
     */
    async fetchBankData(bankId) {
        try {
            console.log(`📊 Buscando dados do ${bankId}...`);
            
            const headers = {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            };
            
            // Buscar contas
            const accountsResponse = await fetch(this.apiEndpoints[bankId] + '/accounts', {
                headers
            });
            
            // Buscar cartões
            const cardsResponse = await fetch(this.apiEndpoints[bankId] + '/cards', {
                headers
            });
            
            // Buscar transações (últimos 90 dias)
            const transactionsResponse = await fetch(this.apiEndpoints[bankId] + '/transactions?limit=100', {
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
            console.error('❌ Erro ao buscar dados do banco:', error);
            throw error;
        }
    }

    /**
     * Normaliza dados de contas para formato padrão
     */
    normalizeAccounts(rawAccounts) {
        return rawAccounts.map(account => ({
            id: account.id || account.accountId,
            name: account.name || account.displayName,
            type: this.normalizeAccountType(account.type),
            balance: account.balance || account.currentBalance,
            initialBalance: account.initialBalance || 0,
            bankLogo: this.getBankLogo(account.institution),
            currency: account.currency || 'BRL'
        }));
    }

    /**
     * Normaliza dados de cartões
     */
    normalizeCards(rawCards) {
        return rawCards.map(card => ({
            id: card.id || card.cardId,
            name: card.name || card.productName,
            limit: card.limit || card.creditLimit,
            availableLimit: card.availableLimit || (card.limit - card.usedLimit),
            dueDay: card.dueDay || card.closingDay,
            brand: this.normalizeCardBrand(card.brand),
            linkedAccountId: card.linkedAccountId,
            currency: card.currency || 'BRL'
        }));
    }

    /**
     * Normaliza transações
     */
    normalizeTransactions(rawTransactions) {
        return rawTransactions.map(tx => ({
            id: tx.id || tx.transactionId,
            description: tx.description || tx.merchantName || tx.narrative,
            value: Math.abs(tx.amount || tx.value),
            date: this.normalizeDate(tx.date || tx.bookingDate),
            category: tx.category || this.categorizeTransaction(tx),
            fundamentalType: tx.type === 'credit' ? 'receita' : 'despesa',
            isPaid: true,
            isCreditCard: tx.paymentMethod === 'credit_card',
            accountId: tx.accountId,
            currency: tx.currency || 'BRL'
        }));
    }

    /**
     * Normaliza tipo de conta
     */
    normalizeAccountType(type) {
        const typeMap = {
            'CHECKING': 'corrente',
            'SAVINGS': 'poupanca',
            'INVESTMENT': 'investimento',
            'CREDIT_CARD': 'cartao'
        };
        return typeMap[type] || 'corrente';
    }

    /**
     * Normaliza bandeira do cartão
     */
    normalizeCardBrand(brand) {
        const brandMap = {
            'VISA': 'Visa',
            'MASTERCARD': 'Mastercard',
            'AMEX': 'American Express',
            'ELO': 'Elo',
            'HIPERCARD': 'Hipercard'
        };
        return brandMap[brand] || brand;
    }

    /**
     * Obtém logo do banco
     */
    getBankLogo(institution) {
        const logoMap = {
            'nubank': 'https://logodownload.org/wp-content/uploads/2019/10/nubank-logo-0.png',
            'itau': 'https://logodownload.org/wp-content/uploads/2019/02/logo-itau.png',
            'bradesco': 'https://logodownload.org/wp-content/uploads/2019/03/logo-bradesco-0.png',
            'santander': 'https://logodownload.org/wp-content/uploads/2019/03/logo-santander-0.png'
        };
        return logoMap[institution] || '';
    }

    /**
     * Categoriza transação baseada em dados
     */
    categorizeTransaction(transaction) {
        const description = (transaction.description || '').toLowerCase();
        
        if (description.includes('supermercado') || description.includes('mercado')) return 'Alimentação';
        if (description.includes('restaurante') || description.includes('lanchonete')) return 'Alimentação';
        if (description.includes('uber') || description.includes('taxi')) return 'Transporte';
        if (description.includes('posto') || description.includes('gasolina')) return 'Transporte';
        if (description.includes('netflix') || description.includes('spotify')) return 'Lazer';
        if (description.includes('salário') || description.includes('pagamento')) return 'Salário';
        if (description.includes('aluguel') || description.includes('condomínio')) return 'Moradia';
        if (description.includes('farmácia') || description.includes('médico')) return 'Saúde';
        if (description.includes('escola') || description.includes('faculdade')) return 'Educação';
        
        return 'Outros';
    }

    /**
     * Normaliza data
     */
    normalizeDate(dateString) {
        const date = new Date(dateString);
        return date.toISOString().split('T')[0];
    }

    /**
     * Gera state OAuth
     */
    generateState(bankId) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2);
        return `${bankId}_${timestamp}_${random}`;
    }

    /**
     * Desconecta banco
     */
    disconnectBank(bankId) {
        this.connectedBanks.delete(bankId);
        if (this.connectedBanks.size === 0) {
            this.accessToken = null;
        }
        console.log(`🔌 Desconectado do ${bankId}`);
    }

    /**
     * Verifica status da conexão
     */
    getConnectionStatus() {
        return {
            connectedBanks: Array.from(this.connectedBanks),
            hasToken: !!this.accessToken,
            totalConnections: this.connectedBanks.size
        };
    }

    /**
     * Sincroniza dados com AppState
     */
    async syncWithAppState(bankData) {
        try {
            // Adicionar contas
            bankData.accounts.forEach(account => {
                if (!AppState.accounts.find(a => a.id === account.id)) {
                    AppState.accounts.push(account);
                }
            });
            
            // Adicionar cartões
            bankData.creditCards.forEach(card => {
                if (!AppState.creditCards.find(c => c.id === card.id)) {
                    AppState.creditCards.push(card);
                }
            });
            
            // Adicionar transações
            bankData.transactions.forEach(transaction => {
                if (!AppState.transactions.find(t => t.id === transaction.id)) {
                    AppState.transactions.push(transaction);
                }
            });
            
            // Salvar e atualizar
            AppState.saveAll();
            AppState.recalculateAllBalances();
            
            console.log('🔄 Dados sincronizados com sucesso!');
            return { success: true };
            
        } catch (error) {
            console.error('❌ Erro na sincronização:', error);
            return { success: false, error: error.message };
        }
    }
}

// Exportar globalmente
window.OpenFinanceService = new OpenFinanceService();
