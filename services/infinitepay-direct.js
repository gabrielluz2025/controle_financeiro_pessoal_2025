/**
 * Serviço de Conexão Direta com InfinitePay
 * Usa API Key e InfiniteTag para buscar dados reais em tempo real
 */
class InfinitePayDirectService {
    constructor() {
        this.apiBaseUrl = 'http://localhost:3000/api/infinitepay-direct';
    }

    /**
     * Salva as credenciais localmente e tenta a primeira sincronização
     */
    async saveAndConnect(tag, apiKey) {
        try {
            console.log('🔐 Salvando credenciais e conectando ao InfinitePay...');
            
            // Salvar no localStorage para persistência no navegador
            localStorage.setItem('inf_tag', tag);
            localStorage.setItem('inf_api_key', apiKey);

            // Tentar sincronização inicial
            return await this.syncRealData();
        } catch (error) {
            console.error('❌ Erro ao conectar:', error);
            throw error;
        }
    }

    /**
     * Sincroniza dados reais chamando o backend
     */
    async syncRealData() {
        const tag = localStorage.getItem('inf_tag');
        const apiKey = localStorage.getItem('inf_api_key');

        if (!tag || !apiKey) {
            throw new Error('Credenciais do InfinitePay não configuradas.');
        }

        const response = await fetch(`${this.apiBaseUrl}/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tag, apiKey })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Erro ao sincronizar com InfinitePay');
        }

        const result = await response.json();
        
        // Importar dados para o AppState
        if (result.success && result.data) {
            this.importToAppState(result.data);
        }

        return result;
    }

    /**
     * Importa os dados recebidos da API para o estado da aplicação
     */
    importToAppState(data) {
        if (!window.AppState) return;

        // 1. Importar Contas
        if (data.accounts) {
            data.accounts.forEach(acc => {
                const index = window.AppState.accounts.findIndex(a => a.externalId === acc.id || a.name === acc.name);
                const accountData = {
                    id: acc.id || `inf_${Date.now()}`,
                    externalId: acc.id,
                    name: acc.name || 'Conta InfinitePay',
                    type: 'corrente',
                    balance: acc.balance || 0,
                    initialBalance: acc.balance || 0,
                    bankName: 'InfinitePay',
                    bankLogo: 'https://assets.infinitepay.io/brand/infinitepay-logo-symbol.svg'
                };

                if (index >= 0) {
                    window.AppState.accounts[index] = { ...window.AppState.accounts[index], ...accountData };
                } else {
                    window.AppState.accounts.push(accountData);
                }
            });
        }

        // 2. Importar Transações
        if (data.transactions) {
            data.transactions.forEach(tx => {
                const exists = window.AppState.transactions.some(t => t.externalId === tx.id);
                if (!exists) {
                    window.AppState.transactions.push({
                        id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        externalId: tx.id,
                        accountId: window.AppState.accounts.find(a => a.bankName === 'InfinitePay')?.id,
                        description: tx.description,
                        value: tx.value,
                        fundamentalType: tx.type === 'receita' ? 'receita' : 'despesa',
                        category: tx.category || 'Outros',
                        date: tx.date,
                        isPaid: true
                    });
                }
            });
        }

        window.AppState.recalculateAllBalances();
        window.AppState.saveAll();
        if (window.UI) window.UI.render();
    }
}

window.InfinitePayDirect = new InfinitePayDirectService();

// Funções globais para a UI
window.showInfinitePayConfig = function() {
    const configDiv = document.getElementById('infinitepay-config');
    configDiv.style.display = configDiv.style.display === 'none' ? 'block' : 'none';
    
    // Preencher se já existir
    document.getElementById('inf-tag').value = localStorage.getItem('inf_tag') || '';
    document.getElementById('inf-api-key').value = localStorage.getItem('inf_api_key') || '';
};

window.saveAndConnectInfinitePay = async function() {
    const tag = document.getElementById('inf-tag').value;
    const apiKey = document.getElementById('inf-api-key').value;

    if (!tag || !apiKey) {
        alert('Por favor, preencha a Tag e a Chave de API.');
        return;
    }

    try {
        const btn = event.target;
        const originalText = btn.innerText;
        btn.innerText = 'Conectando...';
        btn.disabled = true;

        const result = await window.InfinitePayDirect.saveAndConnect(tag, apiKey);
        
        localStorage.setItem('inf_connected', 'true');
        localStorage.setItem('inf_last_sync', new Date().toLocaleString());
        
        alert(`Sucesso! Sincronizado: ${result.summary.transactions} transações encontradas.`);
        UI.renderAccountsPage(); // Recarregar a página para atualizar o status visual
    } catch (error) {
        alert('Erro ao conectar: ' + error.message);
    } finally {
        const btn = document.querySelector('#infinitepay-config button');
        btn.innerText = 'Salvar e Sincronizar Agora';
        btn.disabled = false;
    }
};
