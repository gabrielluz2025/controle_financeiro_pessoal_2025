/**
 * Controlador para Conexão Direta via API Key
 */
const axios = require('axios');

class InfinitePayDirectController {
    /**
     * Sincroniza dados usando a API Key fornecida pelo usuário
     */
    static async sync(req, res) {
        try {
            const { tag, apiKey } = req.body;

            if (!tag || !apiKey) {
                return res.status(400).json({ error: 'Tag e API Key são obrigatórias' });
            }

            console.log(`🚀 Buscando dados reais para InfiniteTag: ${tag}`);

            // 1. Buscar Saldo da Conta
            // Nota: Usando os endpoints oficiais da CloudWalk/InfinitePay
            let balance = 0;
            try {
                const balanceRes = await axios.get(`https://api.infinitepay.io/v1/balances`, {
                    headers: { 'Authorization': apiKey }
                });
                balance = balanceRes.data.available || 0;
            } catch (e) {
                console.warn('⚠️ Erro ao buscar saldo real, usando 0');
            }

            // 2. Buscar Transações Recentes
            let transactions = [];
            try {
                const txRes = await axios.get(`https://api.infinitepay.io/v1/transactions?limit=50`, {
                    headers: { 'Authorization': apiKey }
                });
                
                if (txRes.data && txRes.data.data) {
                    transactions = txRes.data.data.map(tx => ({
                        id: tx.id,
                        description: `Venda InfinitePay - ${tx.last_four || ''}`,
                        value: tx.amount / 100, // Convertendo centavos
                        type: 'receita',
                        category: 'Receita',
                        date: tx.created_at
                    }));
                }
            } catch (e) {
                console.warn('⚠️ Erro ao buscar transações reais');
                // Fallback para uma lista vazia ou erro controlado
            }

            res.json({
                success: true,
                summary: {
                    transactions: transactions.length
                },
                data: {
                    accounts: [{
                        id: `inf_acc_${tag}`,
                        name: `Conta InfinitePay ($${tag})`,
                        balance: balance
                    }],
                    transactions: transactions
                }
            });

        } catch (error) {
            console.error('❌ Erro no controlador direto:', error.message);
            res.status(500).json({ error: 'Falha na comunicação com a API da InfinitePay' });
        }
    }
}

module.exports = InfinitePayDirectController;
