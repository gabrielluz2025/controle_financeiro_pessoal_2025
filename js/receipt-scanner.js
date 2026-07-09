/**
 * ReceiptScanner — OCR robusto para cupom fiscal / NFC-e / NF-e (Brasil)
 * Extrai campos obrigatórios e complementares do comprovante.
 */
const ReceiptScanner = {

    _tesseractLoaded: false,

    TESSERACT_OPTS: {
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.3/dist/worker.min.js',
        langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0/tesseract-core-simd.wasm.js',
    },

    PAYMENT_METHODS: ['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Vale', 'Outro'],

    CATEGORY_KEYWORDS: {
        'Alimentação': ['mercado', 'supermercado', 'padaria', 'açougue', 'acougue', 'restaurante', 'lanchonete', 'pizzaria', 'ifood', 'food', 'hortifruti', 'atacadao', 'carrefour', 'extra', 'pao de acucar'],
        'Transporte': ['posto', 'combustivel', 'gasolina', 'uber', '99', 'estacionamento', 'pedagio', 'shell', 'ipiranga', 'br distribuidora'],
        'Lazer': ['cinema', 'netflix', 'spotify', 'steam', 'ingresso', 'bar ', 'pub ', 'cafe'],
        'Saúde': ['farmacia', 'drogaria', 'drogasil', 'pacheco', 'hospital', 'clinica', 'laboratorio'],
        'Moradia': ['leroy', 'telhanorte', 'casas bahia', 'magazine', 'construcao', 'material'],
        'Compras': ['loja', 'shopping', 'renner', 'c&a', 'americanas', 'amazon', 'mercado livre', 'shopee'],
        'Educação': ['livraria', 'escola', 'faculdade', 'curso', 'udemy'],
        'Contas Fixas': ['vivo', 'claro', 'tim', 'oi ', 'net ', 'enel', 'cpfl', 'sabesp', 'copasa'],
    },

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

    /** Pré-processa imagem: escala, contraste e escala de cinza para melhorar OCR */
    async _preprocessImage(file) {
        if (!file.type.startsWith('image/')) return file;
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const maxW = 2200;
                const scale = Math.min(1, maxW / Math.max(img.width, 1));
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, w, h);
                ctx.filter = 'contrast(1.35) brightness(1.08)';
                ctx.drawImage(img, 0, 0, w, h);
                // Segunda passada em grayscale
                const imgData = ctx.getImageData(0, 0, w, h);
                const d = imgData.data;
                for (let i = 0; i < d.length; i += 4) {
                    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                    const v = g < 140 ? Math.max(0, g - 20) : Math.min(255, g + 15);
                    d[i] = d[i + 1] = d[i + 2] = v;
                }
                ctx.putImageData(imgData, 0, 0);
                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(url);
                    resolve(blob || file);
                }, 'image/jpeg', 0.92);
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
            img.src = url;
        });
    },

    _parseMoney(str) {
        if (!str) return NaN;
        const clean = String(str).replace(/[^\d.,]/g, '');
        if (!clean) return NaN;
        if (/\d{1,3}(\.\d{3})+,\d{2}/.test(clean) || (clean.includes(',') && clean.lastIndexOf(',') > clean.lastIndexOf('.'))) {
            return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
        }
        if (/\d{1,3}(,\d{3})+\.\d{2}/.test(clean)) {
            return parseFloat(clean.replace(/,/g, ''));
        }
        if (clean.includes(',')) return parseFloat(clean.replace(',', '.'));
        return parseFloat(clean);
    },

    _normalizeCnpj(raw) {
        const d = (raw || '').replace(/\D/g, '');
        if (d.length !== 14) return raw?.trim() || '';
        return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    },

    _normalizeCpf(raw) {
        const d = (raw || '').replace(/\D/g, '');
        if (d.length !== 11) return '';
        return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    },

    _extractAccessKey(text) {
        const compact = text.replace(/\s/g, '');
        const m44 = compact.match(/\b(\d{44})\b/);
        if (m44) return m44[1];
        const grouped = text.match(/(\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4}\s+\d{4})/);
        if (grouped) return grouped[1].replace(/\s/g, '');
        return '';
    },

    _extractCnpj(text) {
        const m = text.match(/CNPJ[:\s]*(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2})/i)
            || text.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/);
        return m ? this._normalizeCnpj(m[1]) : '';
    },

    _extractCpf(text) {
        const m = text.match(/CPF[:\s]*(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\s]?\d{2})/i);
        return m ? this._normalizeCpf(m[1]) : '';
    },

    _extractNfNumber(text) {
        const patterns = [
            /(?:NFC[\-\s]?e|NF[\-\s]?e|CUPOM|NOTA\s+FISCAL|DOC\.?\s*FISCAL)[^\d]{0,20}(?:n[º°o\.]*\s*)?(\d{1,9})/i,
            /(?:n[º°o\.]\s*(?:doc|nf|nfc|cupom))[:\s]*(\d{1,9})/i,
            /serie\s*\d+[^\d]{0,10}(\d{6,9})/i,
        ];
        for (const pat of patterns) {
            const m = text.match(pat);
            if (m) return m[1];
        }
        return '';
    },

    _extractSeries(text) {
        const m = text.match(/(?:serie|série)[:\s]*(\d{1,4})/i);
        return m ? m[1] : '';
    },

    _extractDate(text) {
        const patterns = [
            /(\d{2}\/\d{2}\/\d{4})/,
            /(\d{2}-\d{2}-\d{4})/,
            /(\d{2}\/\d{2}\/\d{2})\b/,
            /(\d{4}-\d{2}-\d{2})/,
            /(?:emiss[aã]o|data)[:\s]*(\d{2}\/\d{2}\/\d{4})/i,
        ];
        for (const pat of patterns) {
            const m = text.match(pat);
            if (!m) continue;
            let d = m[1];
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
        return new Date().toISOString().slice(0, 10);
    },

    _extractTime(text) {
        const m = text.match(/(?:\b)(\d{2}:\d{2}(?::\d{2})?)(?:\b)/);
        return m ? m[1].slice(0, 5) : '';
    },

    _extractPaymentMethod(text) {
        const t = text.toLowerCase();
        if (/pix\b/i.test(t)) return 'Pix';
        if (/cart[aã]o\s*de\s*cr[eé]dito|credito\s*à\s*vista|cr[eé]dito/i.test(t)) return 'Cartão de Crédito';
        if (/cart[aã]o\s*de\s*d[eé]bito|d[eé]bito/i.test(t)) return 'Cartão de Débito';
        if (/dinheiro|esp[eé]cie/i.test(t)) return 'Dinheiro';
        if (/vale\s*refei|vale\s*ali|ticket/i.test(t)) return 'Vale';
        return '';
    },

    _valuePatterns() {
        return [
            /total\s*(?:a\s*)?(?:pagar|geral|da\s*nota|nf|nfc)?\s*[:\s]*r?\$?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/i,
            /valor\s*(?:total|a\s*pagar)\s*[:\s]*r?\$?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/i,
            /(?:vl\.?\s*total|v\.?\s*total)\s*[:\s]*r?\$?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/i,
            /(?:total|subtotal)\s*[:\s]*r?\$?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/i,
            /r\$\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})\s*$/im,
        ];
    },

    _extractValueFromLine(line, patterns) {
        for (const pat of patterns) {
            const m = line.match(pat);
            if (m) {
                const v = this._parseMoney(m[1]);
                if (!isNaN(v) && v > 0 && v < 500000) return v;
            }
        }
        return null;
    },

    _extractTotal(text) {
        const lines = text.split('\n');
        const patterns = this._valuePatterns();
        for (let i = lines.length - 1; i >= 0; i--) {
            const v = this._extractValueFromLine(lines[i], patterns);
            if (v !== null && /total|pagar|geral|valor/i.test(lines[i])) return v;
        }
        for (let i = lines.length - 1; i >= 0; i--) {
            const v = this._extractValueFromLine(lines[i], patterns);
            if (v !== null) return v;
        }
        return this._extractLargestMoney(text);
    },

    _extractLargestMoney(text) {
        const all = [];
        const pat = /r?\$?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/gi;
        let m;
        while ((m = pat.exec(text)) !== null) {
            const v = this._parseMoney(m[1]);
            if (!isNaN(v) && v > 0 && v < 500000) all.push(v);
        }
        return all.length ? Math.max(...all) : null;
    },

    _extractSubtotal(text) {
        const m = text.match(/(?:sub\s*total|subtotal|valor\s*dos?\s*produtos?)\s*[:\s]*r?\$?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/i);
        return m ? this._parseMoney(m[1]) : null;
    },

    _extractDiscount(text) {
        const m = text.match(/(?:desconto|desc\.?)\s*[:\s]*r?\$?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/i);
        return m ? this._parseMoney(m[1]) : null;
    },

    _extractMerchant(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const skip = /^(cnpj|cpf|nf|nfe|nfc|nota|cupom|documento|sat|danfe|tel|fone|www|http|https|data|emiss|serie|série|chave|consumidor|valor|total|subtotal|troco|tributos|protocolo|ie[\s:])/i;
        const candidates = lines.filter(l =>
            l.length > 2 && l.length < 70 &&
            !/^\d+$/.test(l) &&
            !skip.test(l) &&
            !/^\d{2}[\/\-]\d{2}/.test(l) &&
            !/^r?\$/i.test(l)
        );
        for (const line of candidates.slice(0, 8)) {
            if (/[a-záéíóúâêôãõç]{3,}/i.test(line) && !/^\W+$/.test(line)) return line.slice(0, 80);
        }
        return candidates[0]?.slice(0, 80) || 'Compra';
    },

    _extractAddress(text) {
        const m = text.match(/(?:rua|av\.|avenida|rod\.|estrada|logradouro)[^\n]{5,80}/i);
        return m ? m[0].trim().slice(0, 120) : '';
    },

    _extractItems(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const items = [];
        const itemPat = /^(.{3,40}?)\s+(\d{1,3}(?:[.,]\d{3})*[,.]\d{2})\s*$/;
        for (const line of lines) {
            if (itemPat.test(line) && !/total|subtotal|desconto|troco/i.test(line)) {
                items.push(line);
            }
            if (items.length >= 8) break;
        }
        return items.join('\n');
    },

    guessCategory(merchant, text) {
        const hay = `${merchant} ${text}`.toLowerCase();
        for (const [cat, words] of Object.entries(this.CATEGORY_KEYWORDS)) {
            if (words.some(w => hay.includes(w))) return cat;
        }
        return 'Compras';
    },

    parse(text) {
        const merchant = this._extractMerchant(text);
        const total = this._extractTotal(text);
        const subtotal = this._extractSubtotal(text);
        const discount = this._extractDiscount(text);
        const cnpj = this._extractCnpj(text);
        const cpf = this._extractCpf(text);
        const nfNumber = this._extractNfNumber(text);
        const series = this._extractSeries(text);
        const accessKey = this._extractAccessKey(text);
        const paymentMethod = this._extractPaymentMethod(text);
        const address = this._extractAddress(text);
        const items = this._extractItems(text);
        const date = this._extractDate(text);
        const time = this._extractTime(text);
        const category = this.guessCategory(merchant, text);

        const confidence = {
            merchant: merchant && merchant !== 'Compra' ? 0.75 : 0.3,
            value: total ? (total < 100000 ? 0.85 : 0.5) : 0,
            date: /\d{2}\/\d{2}\/\d{4}/.test(text) ? 0.9 : 0.5,
            cnpj: cnpj ? 0.95 : 0,
            nfNumber: nfNumber ? 0.8 : 0,
            accessKey: accessKey ? 0.98 : 0,
            paymentMethod: paymentMethod ? 0.7 : 0,
        };

        return {
            description: merchant,
            merchant,
            value: total,
            subtotal: subtotal && !isNaN(subtotal) ? subtotal : '',
            discount: discount && !isNaN(discount) ? discount : '',
            date,
            time,
            cnpj,
            cpf,
            nfNumber,
            series,
            accessKey,
            paymentMethod,
            address,
            items,
            category,
            fundamentalType: 'despesa',
            rawText: text,
            confidence,
            fromScan: true,
        };
    },

    async scanFile(file, onProgress) {
        const ok = await this._ensureTesseract();
        if (!ok) throw new Error('Não foi possível carregar o leitor OCR. Verifique sua conexão.');

        onProgress && onProgress(3, 'Preparando imagem...');
        const processed = await this._preprocessImage(file);

        onProgress && onProgress(8, 'Iniciando leitura OCR...');

        let text = '';
        try {
            const worker = await Tesseract.createWorker('por', 1, {
                ...this.TESSERACT_OPTS,
                logger: (m) => {
                    if (m.status === 'recognizing text' && m.progress != null) {
                        onProgress && onProgress(Math.round(m.progress * 85) + 10, 'Lendo cupom fiscal...');
                    }
                },
            });
            await worker.setParameters({
                tessedit_pageseg_mode: '6',
                preserve_interword_spaces: '1',
            });
            const { data } = await worker.recognize(processed);
            text = data.text || '';
            await worker.terminate();
        } catch (err1) {
            try {
                const result = await Tesseract.recognize(processed, 'por', {
                    ...this.TESSERACT_OPTS,
                    logger: (m) => {
                        if (m.status === 'recognizing text' && m.progress != null) {
                            onProgress && onProgress(Math.round(m.progress * 85) + 10, 'Lendo cupom fiscal...');
                        }
                    },
                });
                text = result.data.text || '';
            } catch (err2) {
                throw new Error('Falha ao ler a imagem. Verifique a conexão e tente outra foto.');
            }
        }

        onProgress && onProgress(98, 'Extraindo dados...');
        const parsed = this.parse(text);

        // Segunda passagem se poucos dados
        if (!parsed.value && !parsed.cnpj && file !== processed) {
            onProgress && onProgress(99, 'Tentando leitura alternativa...');
            try {
                const r2 = await Tesseract.recognize(file, 'por');
                const p2 = this.parse(r2.data.text || '');
                if ((p2.value && !parsed.value) || (p2.cnpj && !parsed.cnpj)) {
                    Object.assign(parsed, {
                        ...p2,
                        rawText: `${parsed.rawText}\n---\n${p2.rawText}`,
                    });
                }
            } catch { /* ignore */ }
        }

        onProgress && onProgress(100, 'Concluído!');
        return parsed;
    },

    /** Preenche campos do formulário de transação com dados do scan */
    fillTransactionForm(parsed) {
        if (typeof TransactionFormFill !== 'undefined') {
            TransactionFormFill.apply(parsed, { fromScan: true });
        }
        this._showScanSummary(parsed);
    },

    _showScanSummary(parsed) {
        const el = document.getElementById('receipt-scan-summary');
        if (!el) return;
        const conf = parsed.confidence || {};
        const pct = (v) => v ? `${Math.round(v * 100)}%` : '—';
        const fields = [
            ['Estabelecimento', parsed.merchant, conf.merchant],
            ['Valor total', parsed.value ? `R$ ${Number(parsed.value).toFixed(2)}` : '', conf.value],
            ['CNPJ', parsed.cnpj, conf.cnpj],
            ['Nº NF', parsed.nfNumber, conf.nfNumber],
            ['Chave', parsed.accessKey ? '✓ Detectada' : '', conf.accessKey],
        ].filter(([, val]) => val);

        el.innerHTML = fields.length ? `
            <p class="receipt-scan-title">Leitura automática — confira os campos abaixo</p>
            <div class="receipt-scan-tags">
                ${fields.map(([label, val, c]) =>
                    `<span class="receipt-scan-tag" title="Confiança ${pct(c)}">${label}: <b>${val}</b></span>`
                ).join('')}
            </div>` : '';
        el.classList.remove('hidden');
    },

    collectReceiptFromForm(form) {
        const q = (sel) => form.querySelector(sel)?.value?.trim() || '';
        const receipt = {
            merchant: q('#trans-description'),
            cnpj: q('#receipt-cnpj'),
            cpf: q('#receipt-cpf'),
            nfNumber: q('#receipt-nf-number'),
            series: q('#receipt-series'),
            accessKey: q('#receipt-access-key'),
            time: q('#receipt-time'),
            subtotal: parseFloat(q('#receipt-subtotal')) || null,
            discount: parseFloat(q('#receipt-discount')) || null,
            paymentMethod: q('#receipt-payment-method'),
            address: q('#receipt-address'),
            items: q('#receipt-items'),
            notes: q('#receipt-notes'),
            scannedAt: q('#receipt-scanned-at') || null,
        };
        const hasAny = Object.entries(receipt).some(([k, v]) => k !== 'scannedAt' && v != null && v !== '');
        return hasAny ? receipt : null;
    },
};
