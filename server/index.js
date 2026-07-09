/**
 * Servidor Principal - Sistema Financeiro Open Finance
 * 
 * Este servidor gerencia:
 * - Autenticação OAuth 2.0 com bancos
 * - APIs seguras para o frontend
 * - Criptografia de dados sensíveis
 * - Rate limiting e proteção contra ataques
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { connectDB } = require('./config/database');

// Importar rotas
const openFinanceRoutes = require('./routes/openfinance');
const authRoutes = require('./routes/auth');
const accountsRoutes = require('./routes/accounts');
const analyticsRoutes = require('./routes/analytics');

// Importar middleware
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/logger');
const { validateToken } = require('./middleware/auth');

// Conectar ao banco de dados
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

// ================================================
// CONFIGURAÇÕES DE SEGURANÇA
// ================================================

// Helmet - Headers de segurança
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://*.infinitepay.io", "https://*.cloudwalk.io"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// CORS - Configuração segura
const productionOrigins = [
    'https://financasmais.com',
    'https://www.financasmais.com'
];
const corsOrigin = process.env.FRONTEND_URL
    || (process.env.NODE_ENV === 'production' ? productionOrigins : 'http://localhost:8001');
app.use(cors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    credentials: true
}));

// Rate Limiting - Proteção contra DDoS
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // máximo 100 requisições por IP
    message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter);

// Rate limiting específico para Open Finance (mais restritivo)
const openFinanceLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 10, // máximo 10 requisições por minuto
    message: { error: 'Limite de requisições Open Finance atingido.' }
});
app.use('/api/openfinance/', openFinanceLimiter);

// ================================================
// MIDDLEWARE
// ================================================

app.use(express.json({ limit: '10kb' })); // Limitar tamanho do body
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Adicionar Request ID para rastreamento
app.use((req, res, next) => {
    req.requestId = uuidv4();
    res.setHeader('X-Request-ID', req.requestId);
    next();
});

// Logger de requisições
app.use(requestLogger);

// Servir arquivos estáticos do frontend
app.use(express.static('.'));

// ================================================
// ROTAS
// ================================================

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/openfinance', openFinanceRoutes);
app.use('/api/accounts', validateToken, accountsRoutes);
app.use('/api/analytics', validateToken, analyticsRoutes);

// Rotas para Conexão Direta InfinitePay
const InfinitePayDirectController = require('./controllers/InfinitePayDirectController');
app.post('/api/infinitepay-direct/sync', InfinitePayDirectController.sync);

// ================================================
// ERROR HANDLING
// ================================================

// SPA fallback: rotas não-API servem o frontend
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            error: 'Rota não encontrada',
            path: req.path
        });
    }
    res.sendFile('index.html', { root: '.' }, (err) => {
        if (err) next(err);
    });
});

// Error handler global
app.use(errorHandler);

// ================================================
// INICIALIZAÇÃO
// ================================================

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║     Sistema Financeiro - Open Finance Brasil          ║
╠═══════════════════════════════════════════════════════╣
║  🚀 Servidor rodando na porta ${PORT}                    ║
║  🔒 Segurança: Helmet, CORS, Rate Limiting ativados   ║
║  📊 Open Finance: Pronto para integração              ║
║  💾 Banco de Dados: MongoDB conectado                 ║
║  📊 Analytics: Ativado                                ║
║  🌐 Frontend: ${process.env.FRONTEND_URL || 'http://localhost:8001'}              ║
╚═══════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
