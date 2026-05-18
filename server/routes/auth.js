/**
 * Rotas de Autenticação
 * 
 * Sistema de autenticação de usuários para o Sistema Financeiro
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const User = require('../models/User');

// Armazenamento temporário para tokens de atualização
const refreshTokens = new Map();

// Validações
const registerValidation = [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres'),
    body('name').trim().notEmpty()
];

const loginValidation = [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
];

/**
 * POST /api/auth/register
 * Registrar novo usuário
 */
router.post('/register', registerValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { email, password, name } = req.body;
        
        // Verificar se usuário já existe
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ error: 'E-mail já cadastrado' });
        }
        
        // Hash da senha
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Criar usuário no MongoDB
        const user = new User({
            email,
            name,
            password: hashedPassword,
            preferences: {
                currency: 'BRL',
                language: 'pt-BR'
            }
        });
        
        await user.save();
        const userId = user._id.toString();
        
        // Gerar tokens
        const accessToken = jwt.sign(
            { userId, email, name },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
        
        const refreshToken = crypto.randomBytes(64).toString('hex');
        refreshTokens.set(refreshToken, { userId, createdAt: Date.now() });
        
        res.status(201).json({
            success: true,
            message: 'Usuário registrado com sucesso',
            user: { id: userId, email, name },
            accessToken,
            refreshToken
        });
        
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * POST /api/auth/login
 * Login de usuário
 */
router.post('/login', loginValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { email, password } = req.body;
        
        // Buscar usuário no MongoDB
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'E-mail ou senha inválidos' });
        }
        
        // Verificar senha
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'E-mail ou senha inválidos' });
        }
        
        const userId = user._id.toString();
        
        // Gerar tokens
        const accessToken = jwt.sign(
            { userId, email: user.email, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
        
        const refreshToken = crypto.randomBytes(64).toString('hex');
        refreshTokens.set(refreshToken, { userId, createdAt: Date.now() });
        
        res.json({
            success: true,
            user: { id: userId, email: user.email, name: user.name },
            accessToken,
            refreshToken
        });
        
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * POST /api/auth/refresh
 * Renovar access token
 */
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(401).json({ error: 'Refresh token não fornecido' });
        }
        
        const tokenData = refreshTokens.get(refreshToken);
        if (!tokenData) {
            return res.status(401).json({ error: 'Refresh token inválido' });
        }
        
        // Verificar expiração (30 dias)
        if (Date.now() - tokenData.createdAt > 30 * 24 * 60 * 60 * 1000) {
            refreshTokens.delete(refreshToken);
            return res.status(401).json({ error: 'Refresh token expirado' });
        }
        
        // Buscar usuário no MongoDB
        const user = await User.findById(tokenData.userId);
        
        if (!user) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }
        
        // Gerar novo access token
        const accessToken = jwt.sign(
            { userId: user.id, email: user.email, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );
        
        res.json({ success: true, accessToken });
        
    } catch (error) {
        console.error('Erro ao renovar token:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

/**
 * POST /api/auth/logout
 * Logout - revogar refresh token
 */
router.post('/logout', (req, res) => {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
        refreshTokens.delete(refreshToken);
    }
    
    res.json({ success: true, message: 'Logout realizado com sucesso' });
});

/**
 * GET /api/auth/me
 * Dados do usuário atual
 */
router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Buscar dados atualizados do usuário no MongoDB
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                preferences: user.preferences,
                createdAt: user.createdAt
            }
        });
        
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
});

/**
 * PUT /api/auth/password
 * Alterar senha
 */
router.put('/password', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'Não autorizado' });
        }
        
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Senhas são obrigatórias' });
        }
        
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Nova senha deve ter no mínimo 8 caracteres' });
        }
        
        // Buscar usuário no MongoDB
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        
        // Verificar senha atual
        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Senha atual incorreta' });
        }
        
        // Atualizar senha
        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();
        
        res.json({ success: true, message: 'Senha alterada com sucesso' });
        
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;
