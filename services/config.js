/**
 * Configuração Open Finance - Credenciais OAuth
 * ATENÇÃO: Configure suas credenciais reais aqui
 */
const OpenFinanceConfig = {
    // Configurações OAuth 2.0
    oauth: {
        // ATENÇÃO: Substitua com suas credenciais reais
        clientId: 'your_real_client_id', // Substitua com seu Client ID real
        clientSecret: 'your_real_client_secret', // Substitua com seu Client Secret real
        redirectUri: window.location.origin + '/oauth/callback',
        scopes: [
            'accounts.read',
            'transactions.read',
            'cards.read',
            'balances.read',
            'investments.read'
        ]
    },
    
    // Endpoints dos bancos (produção e sandbox)
    endpoints: {
        nubank: {
            // Sandbox para desenvolvimento
            auth: 'https://sandbox.auth.nubank.com.br/oauth2/auth',
            token: 'https://sandbox.auth.nubank.com.br/oauth2/token',
            api: 'https://sandbox.api.nubank.com.br/mex',
            openbanking: 'https://sandbox.openbanking.nubank.com.br/v1',
            // Produção (comentado para desenvolvimento)
            // auth: 'https://auth.nubank.com.br/oauth2/auth',
            // token: 'https://auth.nubank.com.br/oauth2/token',
            // api: 'https://api.nubank.com.br/mex',
            // openbanking: 'https://openbanking.nubank.com.br/v1'
        },
        itau: {
            // Sandbox para desenvolvimento
            auth: 'https://openbanking.sandbox.itau.com.br/auth',
            token: 'https://openbanking.sandbox.itau.com.br/oauth/token',
            api: 'https://api.sandbox.itau.com.br/openbanking/v1',
            // Produção
            // auth: 'https://openbanking.itau.com.br/auth',
            // token: 'https://openbanking.itau.com.br/oauth/token',
            // api: 'https://openbanking.itau.com.br/v1'
        },
        bradesco: {
            // Sandbox para desenvolvimento
            auth: 'https://openbanking.sandbox.bradescobank.com.br/auth',
            token: 'https://openbanking.sandbox.bradescobank.com.br/oauth/token',
            api: 'https://api.sandbox.bradescobank.com.br/openbanking/v2',
            // Produção
            // auth: 'https://openbanking.bradescobank.com.br/auth',
            // token: 'https://openbanking.bradescobank.com.br/oauth/token',
            // api: 'https://openbanking.bradescobank.com.br/v2'
        },
        santander: {
            // Sandbox para desenvolvimento
            auth: 'https://openbanking.sandbox.santander.com.br/auth',
            token: 'https://openbanking.sandbox.santander.com.br/oauth/token',
            api: 'https://api.sandbox.santander.com.br/openbanking/v1',
            // Produção
            // auth: 'https://openbanking.santander.com.br/auth',
            // token: 'https://openbanking.santander.com.br/oauth/token',
            // api: 'https://openbanking.santander.com.br/v1'
        }
    },
    
    // Configurações de ambiente
    environment: 'development', // Sempre development no browser
    
    // Timeout para requisições (ms)
    timeout: 30000,
    
    // Retry settings
    retry: {
        attempts: 3,
        delay: 1000
    },
    
    // Rate limiting
    rateLimit: {
        requestsPerMinute: 60,
        requestsPerSecond: 1
    },
    
    // Validação de certificados
    validateCertificates: false, // Desabilitado para sandbox
    
    // Logging
    logging: {
        enabled: true,
        level: 'info' // debug, info, warn, error
    },
    
    // Modo de desenvolvimento
    development: {
        useMockData: false, // TEMPO REAL - Usar APIs reais
        mockDelay: 0,
        enableSandbox: false // Usar endpoints de produção
    },
    
    // URL do backend
    apiBaseUrl: 'http://localhost:3000/api'
};

// Exportar configuração
window.OpenFinanceConfig = OpenFinanceConfig;
