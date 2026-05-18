const express = require('express');
const router = express.Router();
const { validateToken } = require('../middleware/auth');

// Simulação de dados de análise (em produção, viria do banco de dados)
router.get('/summary', validateToken, (req, res) => {
    try {
        // Dados simulados de análise
        const summary = {
            totalIncome: 5000,
            totalExpenses: 2150,
            balance: 2850,
            categories: [
                { name: 'Alimentação', value: 650, percentage: 30 },
                { name: 'Transporte', value: 400, percentage: 19 },
                { name: 'Moradia', value: 800, percentage: 37 },
                { name: 'Lazer', value: 150, percentage: 7 },
                { name: 'Saúde', value: 150, percentage: 7 }
            ],
            monthlyTrend: [
                { month: 'Jan', income: 5000, expenses: 2000 },
                { month: 'Fev', income: 5000, expenses: 2100 },
                { month: 'Mar', income: 5000, expenses: 2150 }
            ],
            topTransactions: [
                { description: 'Aluguel', value: 800, date: '2026-05-01', category: 'Moradia' },
                { description: 'Supermercado', value: 350, date: '2026-05-15', category: 'Alimentação' },
                { description: 'Combustível', value: 200, date: '2026-05-10', category: 'Transporte' }
            ]
        };
        
        res.json({
            success: true,
            data: summary
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
