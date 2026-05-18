/**
 * Middleware de Autenticação
 * 
 * Valida tokens JWT e protege rotas
 */

const jwt = require('jsonwebtoken');

/**
 * Valida token JWT no header Authorization
 */
const validateToken = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Token não fornecido',
                code: 'NO_TOKEN'
            });
        }
        
        const token = authHeader.split(' ')[1];
        
        try {
            // Suporte a sessão temporária para Open Finance
            if (token === 'temporary_session_token') {
                req.userId = 'temp_user_id';
                req.userEmail = 'temp@example.com';
                req.userName = 'Usuário Temporário';
                return next();
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Adicionar dados do usuário à requisição
            req.userId = decoded.userId;
            req.userEmail = decoded.email;
            req.userName = decoded.name;
            
            next();
            
        } catch (jwtError) {
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    error: 'Token expirado',
                    code: 'TOKEN_EXPIRED'
                });
            }
            
            return res.status(401).json({ 
                error: 'Token inválido',
                code: 'INVALID_TOKEN'
            });
        }
        
    } catch (error) {
        console.error('Erro no middleware de auth:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
};

/**
 * Middleware opcional - não bloqueia se não tiver token
 */
const optionalAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                req.userId = decoded.userId;
                req.userEmail = decoded.email;
                req.userName = decoded.name;
            } catch (e) {
                // Token inválido, mas não bloqueia
            }
        }
        
        next();
        
    } catch (error) {
        next();
    }
};

module.exports = { validateToken, optionalAuth };
