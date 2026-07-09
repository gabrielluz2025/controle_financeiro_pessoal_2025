/**
 * VoiceInput — Entrada por voz em português (Web Speech API)
 * Suporta frases como:
 *   "gastei 50 reais no mercado"
 *   "recebi 1500 reais de salário"
 *   "paguei 200 reais de conta de luz categoria contas fixas"
 */
const VoiceInput = {

    recognition: null,
    isListening: false,

    isSupported() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    },

    init() {
        if (!this.isSupported()) return false;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SR();
        this.recognition.lang = 'pt-BR';
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 3;
        return true;
    },

    // Palavras-chave para tipo
    _typeKeywords: {
        despesa: ['gastei','paguei','comprei','saiu','despesa','gastar','pagar','custar','custou','foi'],
        receita: ['recebi','ganhei','entrou','salário','receita','dividendo','rendimento','vendi','venda'],
    },

    // Palavras-chave para categoria
    _categoryKeywords: {
        'Alimentação':    ['mercado','supermercado','restaurante','lanche','comida','alimento','padaria','açougue','pizza','ifood','delivery','burger'],
        'Transporte':     ['gasolina','combustível','uber','99','táxi','ônibus','metrô','pedágio','estacionamento','passagem','transporte'],
        'Moradia':        ['aluguel','condomínio','iptu','água','luz','energia','gás','internet','telefone','moradia','casa'],
        'Saúde':          ['farmácia','remédio','médico','consulta','exame','hospital','plano de saúde','academia','saúde'],
        'Lazer':          ['cinema','streaming','netflix','spotify','jogo','viagem','passeio','lazer','bar','festa','show'],
        'Educação':       ['escola','faculdade','curso','livro','mensalidade','educação'],
        'Compras':        ['roupa','sapato','eletrônico','celular','compra','loja','magazine','amazon'],
        'Contas Fixas':   ['conta','fatura','boleto','parcela','financiamento','empréstimo'],
        'Salário':        ['salário','pagamento','contracheque','holerite'],
        'Investimentos':  ['investimento','ação','cdb','tesouro','fundo','dividendo','rendimento'],
    },

    parse(transcript) {
        const text = transcript.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove acentos para match

        const result = {
            fundamentalType: 'despesa',
            value: null,
            description: transcript,
            category: 'Outros',
            date: new Date().toISOString().slice(0, 10),
        };

        // Tipo
        for (const [type, words] of Object.entries(this._typeKeywords)) {
            if (words.some(w => text.includes(w))) {
                result.fundamentalType = type;
                break;
            }
        }

        // Valor — aceita "50 reais", "50,00", "R$ 50", "cinquenta reais"
        const valuePatterns = [
            /r\$\s*(\d+(?:[.,]\d+)?)/,
            /(\d+(?:[.,]\d+)?)\s*reais?/,
            /(\d+(?:[.,]\d+)?)/,
        ];
        for (const pat of valuePatterns) {
            const m = text.match(pat);
            if (m) {
                result.value = parseFloat(m[1].replace(',', '.'));
                break;
            }
        }

        // Categoria — detecta por palavras-chave
        for (const [cat, words] of Object.entries(this._categoryKeywords)) {
            if (words.some(w => text.includes(w))) {
                result.category = cat;
                break;
            }
        }

        // Categoria explícita: "categoria alimentação"
        const catMatch = transcript.toLowerCase().match(/categoria\s+([a-záéíóúâêôãõç\s]+?)(?:\s*$|\s+(?:conta|cartao))/i);
        if (catMatch) {
            const spoken = catMatch[1].trim();
            const found = AppState.categories.find(c =>
                c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(
                    spoken.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                )
            );
            if (found) result.category = found;
        }

        // Descrição — extrai após "em", "no", "na", "de", "com", "para"
        const descMatch = transcript.match(
            /(?:gastei|paguei|comprei|recebi|ganhei|entrou)\s+(?:r\$\s*)?\d+(?:[.,]\d+)?\s*(?:reais?)?\s+(?:no|na|em|de|com|para|num|numa)\s+(.+?)(?:\s+categoria\s+|$)/i
        );
        if (descMatch) {
            result.description = descMatch[1].trim();
            // Capitalizar primeira letra
            result.description = result.description.charAt(0).toUpperCase() + result.description.slice(1);
        }

        return result;
    },

    start(onResult, onError, onEnd) {
        if (!this.recognition && !this.init()) {
            onError && onError('Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.');
            return;
        }
        if (this.isListening) { this.stop(); return; }

        this.isListening = true;
        let handled = false;

        this.recognition.onresult = (e) => {
            let transcript = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) {
                    transcript = e.results[i][0].transcript;
                }
            }
            if (!transcript) {
                transcript = e.results[e.results.length - 1][0].transcript;
            }
            if (!transcript || handled) return;
            handled = true;
            const parsed = this.parse(transcript);
            onResult && onResult(transcript, parsed);
        };

        this.recognition.onerror = (e) => {
            this.isListening = false;
            const msgs = {
                'not-allowed':  'Permissão de microfone negada. Permita o acesso nas configurações do navegador.',
                'no-speech':    'Nenhuma fala detectada. Tente novamente.',
                'network':      'Erro de rede ao processar o áudio.',
                'aborted':      '',
            };
            const msg = msgs[e.error] || `Erro: ${e.error}`;
            if (msg) onError && onError(msg);
        };

        this.recognition.onend = () => {
            this.isListening = false;
            onEnd && onEnd();
        };

        this.recognition.start();
    },

    stop() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
        this.isListening = false;
    },
};
