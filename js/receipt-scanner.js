/**
 * ReceiptScanner — OCR de comprovantes via Tesseract.js
 * Extrai: valor total, descrição/estabelecimento, data
 */
const ReceiptScanner = {

    _tesseractLoaded: false,

    async _ensureTesseract() {
        if (window.Tesseract) { this._tesseractLoaded = true; return true; }
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/tesseract.js@5.0.3/dist/tesseract.min.js';
            script.onload = () => { this._tesseractLoaded = true; resolve(true); };
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
    },

    // Padrões de valores monetários brasileiros
    _valuePatterns: [
        /total\s*a?\s*(?:pagar|receber|cobrado)?\s*[:\s]*r?\$?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/i,
        /(?:valor\s*total|total\s*geral)\s*[:\s]*r?\$?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/i,
        /(?:total|subtotal)\s*[:\s]*r?\$?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/i,
        /r\$\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*$/im,
        /(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(?:reais?|r\$)?/i,
    ],

    _parseMoney(str) {
        // Suporte a formatos: 1.234,56 ou 1,234.56 ou 1234,56 ou 1234.56
        const clean = str.replace(/[^\d.,]/g, '');
        if (/\.\d{3}[.,]/.test(clean) || clean.includes(',')) {
            return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
        }
        return parseFloat(clean);
    },

    _extractValue(text) {
        const lines = text.split('\n');
        // Procura de baixo para cima (total fica no final)
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            for (const pat of this._valuePatterns) {
                const m = line.match(pat);
                if (m) {
                    const v = this._parseMoney(m[1]);
                    if (!isNaN(v) && v > 0 && v < 100000) return v;
                }
            }
        }
        // Fallback: pega o maior valor encontrado no texto
        const allValues = [];
        const globalPat = /r?\$?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/gi;
        let m;
        while ((m = globalPat.exec(text)) !== null) {
            const v = this._parseMoney(m[1]);
            if (!isNaN(v) && v > 0 && v < 100000) allValues.push(v);
        }
        return allValues.length ? Math.max(...allValues) : null;
    },

    _extractDate(text) {
        const patterns = [
            /(\d{2}\/\d{2}\/\d{4})/,
            /(\d{2}-\d{2}-\d{4})/,
            /(\d{2}\/\d{2}\/\d{2})\b/,
            /(\d{4}-\d{2}-\d{2})/,
        ];
        for (const pat of patterns) {
            const m = text.match(pat);
            if (m) {
                let d = m[1];
                // Normaliza para YYYY-MM-DD
                if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
                    const [dd, mm, yyyy] = d.split('/');
                    return `${yyyy}-${mm}-${dd}`;
                }
                if (/^\d{2}-\d{2}-\d{4}$/.test(d)) {
                    const [dd, mm, yyyy] = d.split('-');
                    return `${yyyy}-${mm}-${dd}`;
                }
                if (/^\d{2}\/\d{2}\/\d{2}$/.test(d)) {
                    const [dd, mm, yy] = d.split('/');
                    return `20${yy}-${mm}-${dd}`;
                }
                return d;
            }
        }
        return new Date().toISOString().slice(0, 10);
    },

    _extractMerchant(text) {
        const lines = text.split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 2 && l.length < 60)
            .filter(l => !/^\d+$/.test(l))
            .filter(l => !/^(cnpj|cpf|nf|nfe|nota|tel|fone|end|rua|av\.|www|http)/i.test(l));

        // Tenta pegar o nome do estabelecimento nas primeiras linhas relevantes
        for (const line of lines.slice(0, 5)) {
            if (/[a-záéíóúâêôãõç]{3,}/i.test(line)) return line;
        }
        return lines[0] || 'Compra';
    },

    parse(text) {
        return {
            value:       this._extractValue(text),
            date:        this._extractDate(text),
            description: this._extractMerchant(text),
            rawText:     text,
        };
    },

    async scanFile(file, onProgress) {
        const ok = await this._ensureTesseract();
        if (!ok) throw new Error('Não foi possível carregar o leitor de texto (Tesseract.js).');

        onProgress && onProgress(5, 'Iniciando leitura...');

        const result = await Tesseract.recognize(file, 'por+eng', {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    onProgress && onProgress(Math.round(m.progress * 90) + 5, 'Lendo texto...');
                }
            },
        });

        onProgress && onProgress(100, 'Concluído!');
        return this.parse(result.data.text);
    },
};
