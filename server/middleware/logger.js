/**
 * Middleware de Logging
 * 
 * Registra requisições HTTP para monitoramento
 */

const requestLogger = (req, res, next) => {
    const start = Date.now();
    
    // Log ao finalizar resposta
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = {
            timestamp: new Date().toISOString(),
            requestId: req.requestId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('User-Agent'),
            ip: req.ip || req.connection.remoteAddress
        };
        
        // Colorir baseado no status
        const statusColor = res.statusCode >= 500 ? '\x1b[31m' : // Vermelho
                           res.statusCode >= 400 ? '\x1b[33m' : // Amarelo
                           res.statusCode >= 300 ? '\x1b[36m' : // Ciano
                           '\x1b[32m'; // Verde
        
        console.log(
            `${statusColor}[${logData.timestamp}]\x1b[0m ${logData.method} ${logData.path} - ${logData.statusCode} (${logData.duration})`
        );
        
        // Log detalhado em desenvolvimento
        if (process.env.NODE_ENV === 'development' && process.env.LOG_LEVEL === 'debug') {
            console.log('  └─', JSON.stringify(logData));
        }
    });
    
    next();
};

module.exports = { requestLogger };
