/**
 * Rotas de Contas e Transações
 * 
 * Gerenciamento de contas, cartões e transações do usuário
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const Card = require('../models/Card');
const { validateToken } = require('../middleware/auth');

// Middleware de autenticação obrigatório para todas as rotas
router.use(validateToken);

// ================================================
// CONTAS
// ================================================

/**
 * GET /api/accounts
 * Lista todas as contas do usuário
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.userId;
        const accounts = await Account.find({ userId });
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
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const userId = req.userId;
        const { name, type, initialBalance, bankName, bankLogo, color } = req.body;
        
        const account = new Account({
            userId,
            name,
            type,
            balance: parseFloat(initialBalance),
            initialBalance: parseFloat(initialBalance),
            bankName,
            bankLogo,
            color
        });
        
        await account.save();
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
router.put('/:id', async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const updates = req.body;
        
        const account = await Account.findOneAndUpdate(
            { _id: id, userId },
            { ...updates },
            { new: true }
        );
        
        if (!account) {
            return res.status(404).json({ error: 'Conta não encontrada' });
        }
        
        res.json({ success: true, account });
    } catch (error) {
        console.error('Erro ao atualizar conta:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * DELETE /api/accounts/:id
 * Excluir conta
 */
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        
        const result = await Account.deleteOne({ _id: id, userId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Conta não encontrada' });
        }
        
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
router.get('/transactions', async (req, res) => {
    try {
        const userId = req.userId;
        const { startDate, endDate, type, category, accountId } = req.query;
        
        const query = { userId };
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        if (type) query.type = type;
        if (category) query.category = category;
        if (accountId) query.accountId = accountId;
        
        const transactions = await Transaction.find(query).sort({ date: -1 });
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
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const userId = req.userId;
        const { description, value, type, date, category, accountId, isPaid, notes } = req.body;
        
        const transaction = new Transaction({
            userId,
            accountId,
            description,
            value: parseFloat(value),
            type,
            date,
            category,
            isPaid: isPaid !== false,
            notes
        });
        
        await transaction.save();
        
        // Atualizar saldo da conta
        if (transaction.isPaid) {
            const account = await Account.findById(accountId);
            if (account) {
                if (type === 'receita') {
                    account.balance += transaction.value;
                } else if (type === 'despesa') {
                    account.balance -= transaction.value;
                }
                await account.save();
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
router.delete('/transactions/:id', async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        
        const transaction = await Transaction.findOne({ _id: id, userId });
        if (!transaction) {
            return res.status(404).json({ error: 'Transação não encontrada' });
        }
        
        // Reverter saldo se necessário
        if (transaction.isPaid) {
            const account = await Account.findById(transaction.accountId);
            if (account) {
                if (transaction.type === 'receita') {
                    account.balance -= transaction.value;
                } else if (transaction.type === 'despesa') {
                    account.balance += transaction.value;
                }
                await account.save();
            }
        }
        
        await Transaction.deleteOne({ _id: id, userId });
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
router.get('/cards', async (req, res) => {
    try {
        const userId = req.userId;
        const cards = await Card.find({ userId });
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
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const userId = req.userId;
        const { name, limit, dueDay, closingDay, brand, color, linkedAccountId } = req.body;
        
        const card = new Card({
            userId,
            name,
            limit: parseFloat(limit),
            availableLimit: parseFloat(limit),
            dueDay: parseInt(dueDay),
            closingDay,
            brand,
            color,
            linkedAccountId
        });
        
        await card.save();
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
router.delete('/cards/:id', async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        
        const result = await Card.deleteOne({ _id: id, userId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Cartão não encontrado' });
        }
        
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
router.get('/summary', async (req, res) => {
    try {
        const userId = req.userId;
        const { month, year } = req.query;
        
        const currentDate = new Date();
        const targetMonth = parseInt(month) || currentDate.getMonth() + 1;
        const targetYear = parseInt(year) || currentDate.getFullYear();
        
        const [accounts, cards, monthTransactions] = await Promise.all([
            Account.find({ userId }),
            Card.find({ userId }),
            Transaction.find({
                userId,
                date: { 
                    $gte: new Date(targetYear, targetMonth - 1, 1), 
                    $lte: new Date(targetYear, targetMonth, 0, 23, 59, 59) 
                }
            })
        ]);
        
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
