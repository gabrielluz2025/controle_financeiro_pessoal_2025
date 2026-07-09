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
        infinitepay: {
            // Sandbox para desenvolvimento
            auth: 'https://auth.sandbox.banking.infinitepay.io/oauth2/authorize',
            token: 'https://auth.sandbox.banking.infinitepay.io/oauth2/token',
            api: 'https://api.sandbox.banking.infinitepay.io/open-banking/v1',
            openbanking: 'https://api.sandbox.banking.infinitepay.io/open-banking/v1',
            // Produção
            // auth: 'https://auth.banking.infinitepay.io/oauth2/authorize',
            // token: 'https://auth.banking.infinitepay.io/oauth2/token',
            // api: 'https://api.banking.infinitepay.io/open-banking/v1',
            // openbanking: 'https://api.banking.infinitepay.io/open-banking/v1'
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
        enableSandbox: true // Usar endpoints de sandbox por padrão
    },
    
    // URL do backend
    apiBaseUrl: (() => {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return 'http://localhost:3000/api';
        }
        if (host.includes('financasmais.com')) {
            return 'https://api.financasmais.com/api';
        }
        return `${window.location.origin}/api`;
    })()
};

// Exportar configuração
window.OpenFinanceConfig = OpenFinanceConfig;
