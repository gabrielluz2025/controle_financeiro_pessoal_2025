const express = require('express');
const router = express.Router();
const { validateToken } = require('../middleware/auth');
const Transaction = require('../models/Transaction');

// Obter resumo real baseado no MongoDB
router.get('/summary', validateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const transactions = await Transaction.find({
            userId,
            date: { $gte: startOfMonth }
        }).sort({ date: -1 });

        const totalIncome = transactions
            .filter(t => t.type === 'receita')
            .reduce((sum, t) => sum + t.value, 0);
            
        const totalExpenses = transactions
            .filter(t => t.type === 'despesa')
            .reduce((sum, t) => sum + t.value, 0);

        // Agrupar por categoria
        const categoryMap = {};
        transactions.filter(t => t.type === 'despesa').forEach(t => {
            categoryMap[t.category] = (categoryMap[t.category] || 0) + t.value;
        });

        const categories = Object.entries(categoryMap).map(([name, value]) => ({
            name,
            value,
            percentage: totalExpenses > 0 ? Math.round((value / totalExpenses) * 100) : 0
        }));

        res.json({
            success: true,
            data: {
                totalIncome,
                totalExpenses,
                balance: totalIncome - totalExpenses,
                categories,
                topTransactions: transactions.slice(0, 5)
            }
        });
    } catch (error) {
        console.error('Erro ao obter análise:', error);
        res.status(500).json({ error: 'Erro ao obter análise de gastos' });
    }
});

// Análise detalhada por período
router.get('/period/:year/:month', validateToken, (req, res) => {
    try {
        const { year, month } = req.params;
        
        const analysis = {
            period: `${month}/${year}`,
            totalIncome: 5000,
            totalExpenses: 2150,
            balance: 2850,
            categoryBreakdown: [
                { 
                    category: 'Alimentação', 
                    value: 650, 
                    percentage: 30,
                    transactions: 12
                },
                { 
                    category: 'Transporte', 
                    value: 400, 
                    percentage: 19,
                    transactions: 8
                },
                { 
                    category: 'Moradia', 
                    value: 800, 
                    percentage: 37,
                    transactions: 1
                },
                { 
                    category: 'Lazer', 
                    value: 150, 
                    percentage: 7,
                    transactions: 3
                },
                { 
                    category: 'Saúde', 
                    value: 150, 
                    percentage: 7,
                    transactions: 2
                }
            ],
            insights: [
                'Suas despesas com alimentação aumentaram 15% em relação ao mês anterior',
                'Você está dentro do orçamento em todas as categorias',
                'Oportunidade de economia: reduza gastos com lazer em R$ 50'
            ]
        };
        
        res.json({
            success: true,
            data: analysis
        });
    } catch (error) {
        console.error('Erro ao obter análise do período:', error);
        res.status(500).json({ error: 'Erro ao obter análise do período' });
    }
});

module.exports = router;
