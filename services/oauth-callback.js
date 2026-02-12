/**
 * Handler para Callback OAuth do Open Finance
 * Processa o retorno da autenticação dos bancos
 */
class OAuthCallbackHandler {
    constructor() {
        this.processCallback();
    }

    /**
     * Processa o callback OAuth
     */
    processCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');
        const state = urlParams.get('state');
        
        if (error) {
            this.handleError(error);
            return;
        }
        
        if (code && state) {
            this.handleSuccess(code, state);
        } else {
            this.handleInvalidCallback();
        }
    }

    /**
     * Lida com sucesso na autenticação
     */
    handleSuccess(code, state) {
        try {
            // Extrair bankId do state
            const [bankId] = state.split('_');
            
            // Enviar mensagem para janela principal
            window.opener.postMessage({
                type: 'oauth_success',
                code: code,
                state: state,
                bankId: bankId
            }, window.location.origin);
            
            // Fechar popup
            window.close();
            
        } catch (error) {
            console.error('❌ Erro ao processar sucesso:', error);
            this.handleError('internal_error');
        }
    }

    /**
     * Lida com erros na autenticação
     */
    handleError(error) {
        console.error('❌ Erro na autenticação:', error);
        
        // Enviar mensagem de erro para janela principal
        window.opener.postMessage({
            type: 'oauth_error',
            error: error
        }, window.location.origin);
        
        // Fechar popup
        window.close();
    }

    /**
     * Lida com callback inválido
     */
    handleInvalidCallback() {
        console.error('❌ Callback OAuth inválido');
        
        window.opener.postMessage({
            type: 'oauth_error',
            error: 'invalid_callback'
        }, window.location.origin);
        
        window.close();
    }
}

// Inicializar handler se estiver na página de callback
if (window.location.pathname.includes('/oauth/callback')) {
    new OAuthCallbackHandler();
}
