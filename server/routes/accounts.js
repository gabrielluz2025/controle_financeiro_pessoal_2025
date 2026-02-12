/**
 * Rotas de Contas e Transações
 * 
 * Gerenciamento de contas, cartões e transações do usuário
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');

// Armazenamento temporário (em produção, usar MongoDB)
const accountsStore = new Map();
const transactionsStore = new Map();
const cardsStore = new Map();

// ================================================
// CONTAS
// ================================================

/**
 * GET /api/accounts
 * Lista todas as contas do usuário
 */
router.get('/', (req, res) => {
    try {
        const userId = req.userId;
        const accounts = accountsStore.get(userId) || [];
        
        res.json({ success: true, accounts, total: accounts.length });
    } catch (error) {
        console.error('Erro ao listar contas:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * POST /api/accounts
 * Criar nova conta
 */
router.post('/', [
    body('name').trim().notEmpty(),
    body('type').isIn(['corrente', 'poupanca', 'investimento', 'carteira', 'digital']),
    body('initialBalance').isNumeric()
], (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const userId = req.userId;
        const { name, type, initialBalance, bankName, bankLogo, color } = req.body;
        
        const account = {
            id: crypto.randomBytes(8).toString('hex'),
            name,
            type,
            balance: parseFloat(initialBalance),
            initialBalance: parseFloat(initialBalance),
            bankName: bankName || null,
            bankLogo: bankLogo || null,
            color: color || '#6366f1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const accounts = accountsStore.get(userId) || [];
        accounts.push(account);
        accountsStore.set(userId, accounts);
        
        res.status(201).json({ success: true, account });
    } catch (error) {
        console.error('Erro ao criar conta:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * PUT /api/accounts/:id
 * Atualizar conta
 */
router.put('/:id', (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const updates = req.body;
        
        const accounts = accountsStore.get(userId) || [];
        const index = accounts.findIndex(a => a.id === id);
        
        if (index === -1) {
            return res.status(404).json({ error: 'Conta não encontrada' });
        }
        
        accounts[index] = {
            ...accounts[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        accountsStore.set(userId, accounts);
        
        res.json({ success: true, account: accounts[index] });
    } catch (error) {
        console.error('Erro ao atualizar conta:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * DELETE /api/accounts/:id
 * Excluir conta
 */
router.delete('/:id', (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        
        const accounts = accountsStore.get(userId) || [];
        const filtered = accounts.filter(a => a.id !== id);
        
        if (filtered.length === accounts.length) {
            return res.status(404).json({ error: 'Conta não encontrada' });
        }
        
        accountsStore.set(userId, filtered);
        
        res.json({ success: true, message: 'Conta excluída' });
    } catch (error) {
        console.error('Erro ao excluir conta:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ================================================
// TRANSAÇÕES
// ================================================

/**
 * GET /api/accounts/transactions
 * Lista todas as transações
 */
router.get('/transactions', (req, res) => {
    try {
        const userId = req.userId;
        const { startDate, endDate, type, category, accountId } = req.query;
        
        let transactions = transactionsStore.get(userId) || [];
        
        // Filtros
        if (startDate) {
            transactions = transactions.filter(t => t.date >= startDate);
        }
        if (endDate) {
            transactions = transactions.filter(t => t.date <= endDate);
        }
        if (type) {
            transactions = transactions.filter(t => t.type === type);
        }
        if (category) {
            transactions = transactions.filter(t => t.category === category);
        }
        if (accountId) {
            transactions = transactions.filter(t => t.accountId === accountId);
        }
        
        // Ordenar por data (mais recente primeiro)
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        res.json({ success: true, transactions, total: transactions.length });
    } catch (error) {
        console.error('Erro ao listar transações:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * POST /api/accounts/transactions
 * Criar nova transação
 */
router.post('/transactions', [
    body('description').trim().notEmpty(),
    body('value').isNumeric(),
    body('type').isIn(['receita', 'despesa', 'transferencia']),
    body('date').isISO8601(),
    body('accountId').notEmpty()
], (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const userId = req.userId;
        const { description, value, type, date, category, accountId, isPaid, notes } = req.body;
        
        const transaction = {
            id: crypto.randomBytes(8).toString('hex'),
            description,
            value: parseFloat(value),
            type,
            date,
            category: category || 'Outros',
            accountId,
            isPaid: isPaid !== false,
            notes: notes || '',
            createdAt: new Date().toISOString()
        };
        
        const transactions = transactionsStore.get(userId) || [];
        transactions.push(transaction);
        transactionsStore.set(userId, transactions);
        
        // Atualizar saldo da conta
        if (transaction.isPaid) {
            const accounts = accountsStore.get(userId) || [];
            const account = accounts.find(a => a.id === accountId);
            if (account) {
                if (type === 'receita') {
                    account.balance += transaction.value;
                } else if (type === 'despesa') {
                    account.balance -= transaction.value;
                }
                account.updatedAt = new Date().toISOString();
                accountsStore.set(userId, accounts);
            }
        }
        
        res.status(201).json({ success: true, transaction });
    } catch (error) {
        console.error('Erro ao criar transação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * DELETE /api/accounts/transactions/:id
 * Excluir transação
 */
router.delete('/transactions/:id', (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        
        const transactions = transactionsStore.get(userId) || [];
        const transaction = transactions.find(t => t.id === id);
        
        if (!transaction) {
            return res.status(404).json({ error: 'Transação não encontrada' });
        }
        
        // Reverter saldo se necessário
        if (transaction.isPaid) {
            const accounts = accountsStore.get(userId) || [];
            const account = accounts.find(a => a.id === transaction.accountId);
            if (account) {
                if (transaction.type === 'receita') {
                    account.balance -= transaction.value;
                } else if (transaction.type === 'despesa') {
                    account.balance += transaction.value;
                }
                accountsStore.set(userId, accounts);
            }
        }
        
        const filtered = transactions.filter(t => t.id !== id);
        transactionsStore.set(userId, filtered);
        
        res.json({ success: true, message: 'Transação excluída' });
    } catch (error) {
        console.error('Erro ao excluir transação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ================================================
// CARTÕES
// ================================================

/**
 * GET /api/accounts/cards
 * Lista cartões de crédito
 */
router.get('/cards', (req, res) => {
    try {
        const userId = req.userId;
        const cards = cardsStore.get(userId) || [];
        
        res.json({ success: true, cards, total: cards.length });
    } catch (error) {
        console.error('Erro ao listar cartões:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * POST /api/accounts/cards
 * Criar cartão de crédito
 */
router.post('/cards', [
    body('name').trim().notEmpty(),
    body('limit').isNumeric(),
    body('dueDay').isInt({ min: 1, max: 31 })
], (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const userId = req.userId;
        const { name, limit, dueDay, closingDay, brand, color, linkedAccountId } = req.body;
        
        const card = {
            id: crypto.randomBytes(8).toString('hex'),
            name,
            limit: parseFloat(limit),
            availableLimit: parseFloat(limit),
            dueDay: parseInt(dueDay),
            closingDay: closingDay || dueDay - 7,
            brand: brand || 'Visa',
            color: color || '#1a1a2e',
            linkedAccountId: linkedAccountId || null,
            createdAt: new Date().toISOString()
        };
        
        const cards = cardsStore.get(userId) || [];
        cards.push(card);
        cardsStore.set(userId, cards);
        
        res.status(201).json({ success: true, card });
    } catch (error) {
        console.error('Erro ao criar cartão:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * DELETE /api/accounts/cards/:id
 * Excluir cartão
 */
router.delete('/cards/:id', (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        
        const cards = cardsStore.get(userId) || [];
        const filtered = cards.filter(c => c.id !== id);
        
        if (filtered.length === cards.length) {
            return res.status(404).json({ error: 'Cartão não encontrado' });
        }
        
        cardsStore.set(userId, filtered);
        
        res.json({ success: true, message: 'Cartão excluído' });
    } catch (error) {
        console.error('Erro ao excluir cartão:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ================================================
// RESUMO FINANCEIRO
// ================================================

/**
 * GET /api/accounts/summary
 * Resumo financeiro do usuário
 */
router.get('/summary', (req, res) => {
    try {
        const userId = req.userId;
        const { month, year } = req.query;
        
        const currentDate = new Date();
        const targetMonth = parseInt(month) || currentDate.getMonth() + 1;
        const targetYear = parseInt(year) || currentDate.getFullYear();
        
        const accounts = accountsStore.get(userId) || [];
        const transactions = transactionsStore.get(userId) || [];
        const cards = cardsStore.get(userId) || [];
        
        // Filtrar transações do mês
        const monthTransactions = transactions.filter(t => {
            const tDate = new Date(t.date);
            return tDate.getMonth() + 1 === targetMonth && tDate.getFullYear() === targetYear;
        });
        
        // Calcular totais
        const income = monthTransactions
            .filter(t => t.type === 'receita' && t.isPaid)
            .reduce((sum, t) => sum + t.value, 0);
            
        const expenses = monthTransactions
            .filter(t => t.type === 'despesa' && t.isPaid)
            .reduce((sum, t) => sum + t.value, 0);
            
        const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
        
        const totalCreditLimit = cards.reduce((sum, c) => sum + c.limit, 0);
        const totalCreditUsed = cards.reduce((sum, c) => sum + (c.limit - c.availableLimit), 0);
        
        // Gastos por categoria
        const expensesByCategory = {};
        monthTransactions
            .filter(t => t.type === 'despesa')
            .forEach(t => {
                expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.value;
            });
        
        res.json({
            success: true,
            summary: {
                month: targetMonth,
                year: targetYear,
                income,
                expenses,
                balance: income - expenses,
                totalBalance,
                totalCreditLimit,
                totalCreditUsed,
                totalCreditAvailable: totalCreditLimit - totalCreditUsed,
                expensesByCategory,
                accountsCount: accounts.length,
                cardsCount: cards.length,
                transactionsCount: monthTransactions.length
            }
        });
    } catch (error) {
        console.error('Erro ao calcular resumo:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;
