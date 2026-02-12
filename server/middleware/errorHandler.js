/**
 * Middleware de Tratamento de Erros
 * 
 * Captura e formata erros de forma consistente
 */

const errorHandler = (err, req, res, next) => {
    console.error('❌ Erro:', {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        requestId: req.requestId,
        path: req.path,
        method: req.method
    });
    
    // Erro de validação do express-validator
    if (err.array && typeof err.array === 'function') {
        return res.status(400).json({
            error: 'Erro de validação',
            details: err.array()
        });
    }
    
    // Erro de JSON malformado
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            error: 'JSON inválido no corpo da requisição'
        });
    }
    
    // Erro de autenticação JWT
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            error: 'Token inválido'
        });
    }
    
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            error: 'Token expirado'
        });
    }
    
    // Erro de rate limit
    if (err.status === 429) {
        return res.status(429).json({
            error: 'Muitas requisições. Tente novamente mais tarde.'
        });
    }
    
    // Erro genérico
    const statusCode = err.statusCode || err.status || 500;
    const message = process.env.NODE_ENV === 'production' 
        ? 'Erro interno do servidor'
        : err.message;
    
    res.status(statusCode).json({
        error: message,
        requestId: req.requestId,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = { errorHandler };
