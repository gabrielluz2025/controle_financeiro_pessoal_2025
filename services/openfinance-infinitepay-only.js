/**
 * Serviço Open Finance - Integração Exclusiva com InfinitePay
 * Conecta apenas com InfinitePay via OAuth 2.0 e Open Banking
 * Com fallback automático para modo demonstração se backend estiver offline
 */
class OpenFinanceServiceInfinitePay {
    constructor() {
        this.apiBaseUrl = window.OpenFinanceConfig?.apiBaseUrl || 'http://localhost:3000/api';
        this.accessToken = localStorage.getItem('infinitepay_auth_token') || null;
        this.isConnected = localStorage.getItem('infinitepay_connected') === 'true';
        this.backendAvailable = true; // Será testado na primeira requisição
    }

    /**
     * Método principal chamado pelo index.html
     */
    async connectBank(bank) {
        if (bank !== 'infinitepay') {
            throw new Error('Apenas InfinitePay é suportado neste sistema.');
        }
        return this.connectToInfinitePay();
    }

    /**
     * Obtém token de acesso do sistema (JWT do usuário)
     * Se não houver token, retorna um token de fallback para permitir a conexão
     */
    getSystemToken() {
        const token = localStorage.getItem('auth_token');
        if (token) return token;
        
        // Fallback: Se o usuário não estiver logado, usamos um token temporário
        // Isso permite que o usuário use o Open Finance mesmo sem login formal no app
        console.warn('⚠️ Usuário não autenticado. Usando sessão temporária para Open Finance.');
        return 'temporary_session_token';
    }

    /**
     * Testa se o backend está disponível
     */
    async checkBackendAvailability() {
        if (window.OpenFinanceConfig?.standaloneMode) {
            return false;
        }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const response = await fetch(`${this.apiBaseUrl}/openfinance/banks`, {
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            console.warn('⚠️ Backend não disponível, usando modo demonstração');
            return false;
        }
    }

    /**
     * Inicia fluxo OAuth 2.0 com InfinitePay
     */
    async connectToInfinitePay() {
        try {
            console.log('🔗 Iniciando conexão com InfinitePay...');
            
            // Verificar se backend está disponível
            this.backendAvailable = await this.checkBackendAvailability();
            
            if (!this.backendAvailable) {
                console.log('📱 Backend offline - Usando modo de demonstração');
                return this.connectToInfinitePayDemo();
            }
            
            const systemToken = this.getSystemToken();

            // Chamar backend para iniciar conexão OAuth
            const response = await fetch(`${this.apiBaseUrl}/openfinance/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${systemToken}`
                },
                body: JSON.stringify({ bank: 'infinitepay' })
            });
            
            if (!response.ok) {
                // Se falhar, usar modo demo
                console.warn('⚠️ Falha ao conectar com backend, usando modo demo');
                return this.connectToInfinitePayDemo();
            }
            
            const data = await response.json();
            
            if (!data.authUrl) {
                throw new Error('URL de autenticação não recebida');
            }
            
            console.log('🔗 Abrindo autenticação OAuth para InfinitePay...');
            
            // Abrir popup para autenticação
            const width = 500;
            const height = 600;
            const left = (window.screen.width / 2) - (width / 2);
            const top = (window.screen.height / 2) - (height / 2);
            
            const popup = window.open(
                data.authUrl, 
                'infinitepay_oauth', 
                `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
            );
            
            if (!popup) {
                throw new Error('Não foi possível abrir a janela de autenticação. Verifique se o popup não foi bloqueado.');
            }
            
            // Aguardar mensagem do popup (via oauth-callback.js) ou fechamento
            return new Promise((resolve, reject) => {
                const handleMessage = (event) => {
                    if (event.origin !== window.location.origin) return;
                    
                    if (event.data.type === 'oauth_success') {
                        window.removeEventListener('message', handleMessage);
                        this.isConnected = true;
                        localStorage.setItem('infinitepay_connected', 'true');
                        
                        // Após sucesso, solicitar sincronização de dados ao backend
                        this.syncData()
                            .then(result => resolve({ success: true, data: result }))
                            .catch(err => {
                                console.warn('Conectado, mas erro na sincronização inicial:', err);
                                resolve({ success: true, isMock: true, data: null });
                            });
                    } else if (event.data.type === 'oauth_error') {
                        window.removeEventListener('message', handleMessage);
                        reject(new Error(event.data.error || 'Erro na autenticação'));
                    }
                };

                window.addEventListener('message', handleMessage);
                
                const checkPopup = setInterval(() => {
                    if (!popup || popup.closed) {
                        clearInterval(checkPopup);
                        // Pequeno delay para dar tempo da mensagem chegar
                        setTimeout(() => {
                            if (!this.isConnected) {
                                window.removeEventListener('message', handleMessage);
                                reject(new Error('Autenticação cancelada ou janela fechada'));
                            }
                        }, 1000);
                    }
                }, 1000);
            });
            
        } catch (error) {
            console.error('❌ Erro na conexão:', error);
            // Fallback para modo demo em caso de erro
            return this.connectToInfinitePayDemo();
        }
    }

    /**
     * Modo de demonstração - Simula conexão com dados fictícios
     */
    async connectToInfinitePayDemo() {
        console.log('📱 Entrando em modo de demonstração do InfinitePay...');
        
        return new Promise((resolve) => {
            // Simular delay de conexão
            setTimeout(() => {
                this.isConnected = true;
                localStorage.setItem('infinitepay_connected', 'true');
                
                // Dados de demonstração
                const demoData = {
                    success: true,
                    isMock: true,
                    message: 'Conectado em modo de demonstração',
                    summary: {
                        accounts: 1,
                        cards: 1,
                        transactions: 2
                    },
                    data: {
                        accounts: [
                            {
                                id: 'demo_account_1',
                                name: 'Conta PJ - InfinitePay',
                                type: 'corrente',
                                balance: 5000.00,
                                initialBalance: 5000.00,
                                bankName: 'InfinitePay',
                                bankLogo: 'https://assets.infinitepay.io/brand/infinitepay-logo-symbol.svg'
                            }
                        ],
                        cards: [
                            {
                                id: 'demo_card_1',
                                name: 'Cartão InfinitePay',
                                brand: 'Mastercard',
                                limit: 10000.00,
                                availableLimit: 8500.00,
                                dueDay: 10
                            }
                        ],
                        transactions: [
                            {
                                id: 'demo_tx_1',
                                description: 'Venda de Produto',
                                value: 1500.00,
                                type: 'receita',
                                category: 'Receita',
                                date: new Date().toISOString().split('T')[0],
                                isPaid: true
                            },
                            {
                                id: 'demo_tx_2',
                                description: 'Pagamento de Fornecedor',
                                value: 450.00,
                                type: 'despesa',
                                category: 'Outros',
                                date: new Date().toISOString().split('T')[0],
                                isPaid: true
                            }
                        ]
                    }
                };
                
                // Importar dados de demo para o AppState
                this.importDemoData(demoData.data);
                
                resolve(demoData);
            }, 1500); // Simular delay de 1.5s
        });
    }

    /**
     * Importa dados de demonstração para o AppState
     */
    importDemoData(data) {
        if (!window.AppState) {
            console.warn('AppState não disponível');
            return;
        }

        try {
            // Importar contas
            if (data.accounts && Array.isArray(data.accounts)) {
                data.accounts.forEach(acc => {
                    const exists = window.AppState.accounts.find(a => a.name === acc.name);
                    if (!exists) {
                        window.AppState.accounts.push({
                            id: acc.id || `acc_${Date.now()}`,
                            name: acc.name,
                            type: acc.type,
                            balance: acc.balance,
                            initialBalance: acc.initialBalance,
                            bankName: acc.bankName,
                            bankLogo: acc.bankLogo,
                            overdraftLimit: 0
                        });
                    }
                });
            }

            // Importar cartões
            if (data.cards && Array.isArray(data.cards)) {
                data.cards.forEach(card => {
                    const exists = window.AppState.creditCards.find(c => c.name === card.name);
                    if (!exists) {
                        window.AppState.creditCards.push({
                            id: card.id || `card_${Date.now()}`,
                            name: card.name,
                            brand: card.brand,
                            limit: card.limit,
                            availableLimit: card.availableLimit,
                            dueDay: card.dueDay,
                            linkedAccountId: window.AppState.accounts[0]?.id,
                            isCreditCard: true
                        });
                    }
                });
            }

            // Importar transações
            if (data.transactions && Array.isArray(data.transactions)) {
                data.transactions.forEach(tx => {
                    const exists = window.AppState.transactions.find(t => 
                        t.description === tx.description && t.date === tx.date
                    );
                    if (!exists) {
                        window.AppState.transactions.push({
                            id: tx.id || `tx_${Date.now()}`,
                            accountId: window.AppState.accounts[0]?.id,
                            description: tx.description,
                            value: tx.value,
                            fundamentalType: tx.type === 'receita' ? 'receita' : 'despesa',
                            category: tx.category,
                            date: tx.date,
                            isPaid: tx.isPaid,
                            isCreditCard: false
                        });
                    }
                });
            }

            window.AppState.recalculateAllBalances();
            window.AppState.saveAll();
            
            console.log('✅ Dados de demonstração importados com sucesso');
        } catch (error) {
            console.error('❌ Erro ao importar dados de demo:', error);
        }
    }

    /**
     * Solicita ao backend a sincronização de todos os dados
     */
    async syncData() {
        console.log('🔄 Sincronizando dados com InfinitePay...');
        const systemToken = this.getSystemToken();
        
        try {
            const response = await fetch(`${this.apiBaseUrl}/openfinance/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${systemToken}`
                },
                body: JSON.stringify({ bank: 'infinitepay' })
            });

            if (!response.ok) {
                throw new Error('Erro na sincronização');
            }

            return await response.json();
        } catch (error) {
            console.warn('⚠️ Erro ao sincronizar, retornando dados em cache');
            return null;
        }
    }

    /**
     * Desconecta do InfinitePay
     */
    async disconnect() {
        const systemToken = this.getSystemToken();
        try {
            await fetch(`${this.apiBaseUrl}/openfinance/disconnect/infinitepay`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${systemToken}`
                }
            });
        } catch (error) {
            console.warn('⚠️ Erro ao desconectar do backend');
        }
        
        this.isConnected = false;
        localStorage.removeItem('infinitepay_connected');
        console.log('✅ Desconectado do InfinitePay');
    }
}

// Criar instância global compatível com o que o index.html espera
window.OpenFinanceService = new OpenFinanceServiceInfinitePay();
