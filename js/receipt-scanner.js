/**
 * ReceiptScanner — OCR para cupom fiscal, Pix, boleto e comprovante bancário (Brasil)
 * Detecta o tipo de documento e extrai campos específicos de cada modelo.
 */
const ReceiptScanner = {

    _tesseractLoaded: false,

    DOC_TYPES: {
        cupom_fiscal: 'Cupom / Nota Fiscal',
        pix: 'Comprovante Pix',
        boleto: 'Boleto',
        comprovante_bancario: 'Comprovante bancário',
        outro: 'Comprovante',
    },

    TESSERACT_OPTS: {
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.3/dist/worker.min.js',
        langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/por/4.0.0_best',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0/tesseract-core-simd.wasm.js',
    },

    TESSERACT_OPTS_FALLBACK: {
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.3/dist/worker.min.js',
        langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/por/4.0.0_best',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0/tesseract-core.wasm.js',
    },

    TESSERACT_SCRIPT_URLS: [
        'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.3/dist/tesseract.min.js',
        'https://unpkg.com/tesseract.js@5.0.3/dist/tesseract.min.js',
    ],

    PAYMENT_METHODS: ['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Vale', 'Outro'],

    /** Meses abreviados em comprovantes bancários (Nubank, Inter, etc.) */
    PT_MONTHS: {
        jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
        jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
        janeiro: '01', fevereiro: '02', marco: '03', março: '03', abril: '04',
        maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
        outubro: '10', novembro: '11', dezembro: '12',
    },

    /** Rótulos comuns em comprovantes Pix por banco */
    PIX_LABELS: {
        value: ['valor', 'valor transferido', 'valor pago', 'valor da transferencia', 'valor da transacao'],
        beneficiary: ['nome', 'favorecido', 'recebedor', 'destinatario', 'beneficiario', 'para'],
        payer: ['nome', 'pagador', 'remetente', 'de'],
        transactionId: ['id da transacao', 'id transacao', 'identificador', 'e2e', 'end to end', 'codigo da transacao'],
    },

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
        for (const url of this.TESSERACT_SCRIPT_URLS) {
            const ok = await new Promise((resolve) => {
                const existing = document.querySelector(`script[data-tesseract="${url}"]`);
                if (existing) {
                    existing.addEventListener('load', () => resolve(!!window.Tesseract));
                    existing.addEventListener('error', () => resolve(false));
                    if (window.Tesseract) resolve(true);
                    return;
                }
                const script = document.createElement('script');
                script.src = url;
                script.dataset.tesseract = url;
                script.onload = () => resolve(!!window.Tesseract);
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
            });
            if (ok) { this._tesseractLoaded = true; return true; }
        }
        return false;
    },

    _isHeic(file) {
        const n = (file.name || '').toLowerCase();
        const t = (file.type || '').toLowerCase();
        return t.includes('heic') || t.includes('heif') || n.endsWith('.heic') || n.endsWith('.heif');
    },

    _asFile(input, name = 'scan.jpg') {
        if (input instanceof File) return input;
        if (input instanceof Blob) return new File([input], name, { type: input.type || 'image/jpeg' });
        return input;
    },

    /** Pré-processa imagem: escala, contraste, inversão (app escuro) e binarização */
    async _preprocessImage(file, mode = 'standard') {
        const f = this._asFile(file);
        if (this._isHeic(f)) {
            throw new Error('Foto HEIC não suportada neste aparelho. Use “Enviar imagem” e escolha JPG/PNG, ou tire print da tela do comprovante.');
        }
        const mime = (f.type || '').toLowerCase();
        if (mime && !mime.startsWith('image/')) return f;

        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(f);
            const timeout = setTimeout(() => {
                URL.revokeObjectURL(url);
                resolve(f);
            }, 12000);

            img.onload = () => {
                clearTimeout(timeout);
                try {
                    const minW = 1800;
                    const maxDim = 3200;
                    let scale = Math.max(minW / Math.max(img.width, 1), 1);
                    scale = Math.min(scale, maxDim / Math.max(img.width, img.height, 1));
                    const w = Math.round(img.width * scale);
                    const h = Math.round(img.height * scale);
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    const imgData = ctx.getImageData(0, 0, w, h);
                    const d = imgData.data;
                    let sum = 0;
                    for (let i = 0; i < d.length; i += 4) {
                        sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                    }
                    const avg = sum / (d.length / 4);
                    const invert = mode === 'invert' || (mode === 'standard' && avg < 115);
                    for (let i = 0; i < d.length; i += 4) {
                        let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                        if (invert) g = 255 - g;
                        if (mode === 'binary' || mode === 'invert') {
                            g = g > 155 ? 255 : g < 95 ? 0 : g > 128 ? 255 : 0;
                        } else {
                            g = g < 140 ? Math.max(0, g - 25) : Math.min(255, g + 18);
                        }
                        d[i] = d[i + 1] = d[i + 2] = g;
                    }
                    ctx.putImageData(imgData, 0, 0);
                    canvas.toBlob((blob) => {
                        URL.revokeObjectURL(url);
                        resolve(blob ? this._asFile(blob, `scan-${mode}.jpg`) : f);
                    }, 'image/jpeg', 0.92);
                } catch (err) {
                    URL.revokeObjectURL(url);
                    resolve(f);
                }
            };
            img.onerror = () => {
                clearTimeout(timeout);
                URL.revokeObjectURL(url);
                reject(new Error('Não foi possível abrir a imagem. Tente JPG/PNG ou um print da tela do comprovante Pix.'));
            };
            img.src = url;
        });
    },

    async _recognizeImage(image, onProgress, psm = '4') {
        const img = this._asFile(image);
        const configs = [this.TESSERACT_OPTS, this.TESSERACT_OPTS_FALLBACK, {}];
        let lastErr = null;

        for (const opts of configs) {
            try {
                const worker = await Tesseract.createWorker('por', 1, {
                    ...opts,
                    logger: (m) => {
                        if (m.status === 'recognizing text' && m.progress != null) {
                            onProgress && onProgress(Math.round(m.progress * 85) + 10, 'Lendo comprovante...');
                        }
                    },
                });
                try {
                    await worker.setParameters({
                        tessedit_pageseg_mode: String(psm),
                        preserve_interword_spaces: '1',
                    });
                    const { data } = await worker.recognize(img);
                    await worker.terminate();
                    if (data?.text?.trim()) return data.text;
                } catch (inner) {
                    await worker.terminate().catch(() => {});
                    throw inner;
                }
            } catch (err) {
                lastErr = err;
            }

            try {
                const result = await Tesseract.recognize(img, 'por', {
                    ...opts,
                    logger: (m) => {
                        if (m.status === 'recognizing text' && m.progress != null) {
                            onProgress && onProgress(Math.round(m.progress * 85) + 10, 'Lendo comprovante...');
                        }
                    },
                });
                if (result?.data?.text?.trim()) return result.data.text;
            } catch (err) {
                lastErr = err;
            }
        }

        throw lastErr || new Error('Falha ao ler a imagem.');
    },

    _parseScore(parsed) {
        if (!parsed) return -1;
        let s = 0;
        if (parsed.docType === 'pix') s += 12;
        else if (parsed.docType === 'boleto') s += 8;
        else if (parsed.docType === 'cupom_fiscal') s += 6;
        if (parsed.transactionId) s += 14;
        if (parsed.beneficiary && parsed.beneficiary.length >= 6) s += 12;
        if (parsed.value && parsed.value >= 1) s += Math.min(8, parsed.value > 50 ? 8 : 4);
        if (parsed.payer) s += 4;
        if (parsed.date && parsed.date !== new Date().toISOString().slice(0, 10)) s += 3;
        const desc = String(parsed.description || parsed.merchant || '').toLowerCase();
        if (/^comprovante\s+de\s*$|^comprovante de transfer/.test(desc) && desc.length < 28) s -= 8;
        if (parsed.beneficiary && this._isLabelNoise(parsed.beneficiary)) s -= 15;
        if (parsed.payer && (this._isLabelNoise(parsed.payer) || !this._looksLikePersonName(parsed.payer))) s -= 10;
        if (parsed.docType === 'outro' && parsed.transactionId) s += 6;
        if (parsed.template === 'nubank_pix') s += 10;
        if (parsed.beneficiary && parsed.value && parsed.transactionId) s += 8;
        return s;
    },

    _inferPixFromText(text) {
        const t = String(text || '');
        const compact = t.replace(/\s/g, '');
        if (/E18236120[0-9A-Za-z]{10,}/i.test(compact)) return true;
        if (/E[0-9]{8}20[0-9]{6}[0-9A-Za-z]{4,}/i.test(compact)) return true;
        if (/comprovante.{0,30}transfer/i.test(t)) return true;
        if (/tipo.{0,20}transfer/i.test(t) && /pix/i.test(t)) return true;
        if (/destino/i.test(t) && /origem/i.test(t)) return true;
        if (/nu pagamentos|nubank/i.test(t) && /transfer/i.test(t)) return true;
        return false;
    },

    _normAlpha(s) {
        return String(s || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    },

    _isLabelNoise(s) {
        const t = this._normAlpha(s);
        if (!t || t.length < 3) return true;
        const noise = [
            'tipo', 'transfer', 'ransfer', 'institu', 'insuti', 'comprovante', 'pagamento',
            'agencia', 'conta', 'destino', 'origem', 'valor', 'pix', 'nu pagamentos', 'nubank',
            'nome', 'cpf', 'cnpj', 'id da transacao', 'id transacao', 'realizado', 'documento',
            'favorecido', 'pagador', 'remetente', 'recebedor', 'chave', 'e2e',
        ];
        if (noise.some(n => t.includes(n))) return true;
        if (/[a-z][A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(String(s || ''))) return true;
        if (/\d{2}[.\s]?\d{3}/.test(t)) return true;
        return false;
    },

    _looksLikePersonName(s) {
        const t = String(s || '').trim();
        if (t.length < 8 || t.length > 90) return false;
        if (this._isLabelNoise(t)) return false;
        if (!/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç]/.test(t)) return false;
        if (/^\d/.test(t) || /cnpj|cpf|r\$/i.test(t)) return false;
        const stop = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'o', 'a']);
        const words = t.split(/\s+/).filter(Boolean);
        const nameWords = words.filter(w => !stop.has(w.toLowerCase()));
        if (nameWords.length < 2) return false;
        return nameWords.every(w => w.length >= 3 && /^[A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç]/.test(w));
    },

    _extractRMoneyValues(text) {
        const vals = [];
        const pat = /R\s*\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/gi;
        let m;
        while ((m = pat.exec(text)) !== null) {
            const ctx = text.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24);
            if (/cnpj|cpf|\d{2}[.\s]\d{3}[.\s]\d{3}/i.test(ctx)) continue;
            const v = this._parseMoney(m[1]);
            if (!isNaN(v) && v >= 1 && v < 500000) vals.push({ v, index: m.index });
        }
        return vals;
    },

    _sanitizeScanField(key, val) {
        if (val == null || val === '') return val;
        const s = String(val).trim();
        if (key === 'beneficiary' || key === 'payer' || key === 'description' || key === 'merchant') {
            if (this._isLabelNoise(s) || !this._looksLikePersonName(s)) return '';
        }
        if (key === 'payer' && s.length < 8) return '';
        return val;
    },

    _safeParse(text) {
        try {
            return this.parse(text || '');
        } catch (err) {
            console.error('[ReceiptScanner] parse error', err);
            return {
                description: 'Comprovante',
                merchant: 'Comprovante',
                value: null,
                date: new Date().toISOString().slice(0, 10),
                category: 'Outros',
                fundamentalType: 'despesa',
                docType: 'outro',
                rawText: text || '',
                confidence: {},
                fromScan: true,
            };
        }
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
        const monthPat = Object.keys(this.PT_MONTHS).join('|');
        const mBank = text.match(new RegExp(
            `(\\d{1,2})\\s+(${monthPat})\\s+(\\d{4})(?:\\s*[-–—]\\s*(\\d{2}:\\d{2}(?::\\d{2})?))?`,
            'i'
        ));
        if (mBank) {
            const dd = String(mBank[1]).padStart(2, '0');
            const mm = this.PT_MONTHS[mBank[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3)]
                || this.PT_MONTHS[mBank[2].toLowerCase()] || '01';
            return `${mBank[3]}-${mm}-${dd}`;
        }
        const patterns = [
            /(?:data|emiss[aã]o|realizado|pagamento|transfer[eê]ncia)[:\s]*(\d{2}\/\d{2}\/\d{4})/i,
            /(\d{2}\/\d{2}\/\d{4})/,
            /(\d{2}-\d{2}-\d{4})/,
            /(\d{2}\/\d{2}\/\d{2})\b/,
            /(\d{4}-\d{2}-\d{2})/,
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
        const mBank = text.match(/\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s*[-–—]\s*(\d{2}:\d{2}(?::\d{2})?)/i);
        if (mBank) return mBank[1].slice(0, 5);
        const m = text.match(/(?:\b)(\d{2}:\d{2}(?::\d{2})?)(?:\b)/);
        return m ? m[1].slice(0, 5) : '';
    },

    _lines(text) {
        return String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    },

    _normLine(s) {
        return String(s || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[:\s]+$/, '').trim();
    },

    /** Valor na linha seguinte ao rótulo (layout Nubank / apps mobile) */
    _valueAfterLabel(lines, labels) {
        const labs = (Array.isArray(labels) ? labels : [labels]).map(l => this._normLine(l));
        for (let i = 0; i < lines.length - 1; i++) {
            const cur = this._normLine(lines[i]);
            const hit = labs.some(lab => cur === lab || cur.startsWith(lab + ' '));
            if (!hit) continue;
            const same = lines[i].match(/[:\s]+(.+)/);
            if (same && /r?\$?\s*\d/.test(same[1])) {
                const v = this._parseMoney(same[1]);
                if (!isNaN(v) && v > 0) return v;
            }
            for (let j = 1; j <= 2 && i + j < lines.length; j++) {
                const next = lines[i + j];
                if (/^r?\$?\s*\d/.test(next) || /\d+[,.]\d{2}/.test(next)) {
                    const v = this._parseMoney(next);
                    if (!isNaN(v) && v > 0) return v;
                }
            }
        }
        return null;
    },

    /** Campo de texto após rótulo, dentro de uma seção (Destino / Origem) */
    _fieldInSection(lines, sectionName, fieldLabels) {
        const section = this._normLine(sectionName);
        const fields = (Array.isArray(fieldLabels) ? fieldLabels : [fieldLabels]).map(f => this._normLine(f));
        let inSection = false;
        let sectionDepth = 0;
        for (let i = 0; i < lines.length; i++) {
            const cur = this._normLine(lines[i]);
            if (cur === section || cur.startsWith(section + ' ') || (section === 'destino' && /^dest\w*/.test(cur) && cur.length < 12) || (section === 'origem' && /^orig\w*/.test(cur) && cur.length < 12)) {
                inSection = true;
                sectionDepth = 0;
                continue;
            }
            if (inSection) {
                if (/^(origem|destino|valor|tipo de transferencia|id da transacao|nu pagamentos)/.test(cur) && cur !== section) {
                    if (cur === 'origem' && section === 'destino') break;
                    if (cur === 'destino' && section === 'origem') break;
                }
                if (fields.includes(cur)) {
                    for (let j = 1; j <= 2 && i + j < lines.length; j++) {
                        const val = lines[i + j].trim();
                        if (!val || val.length < 3) continue;
                        if (/^(nome|instituicao|agencia|conta|tipo|cpf|cnpj|valor|pix|destino|origem)$/i.test(this._normLine(val))) continue;
                        if (/^r?\$/.test(val) || /^\d{4,}$/.test(val.replace(/\D/g, ''))) continue;
                        if (/^[A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç]/.test(val)) return val.slice(0, 120);
                    }
                    const inline = lines[i].match(/(?:nome|favorecido)[:\s]+(.+)/i);
                    if (inline && inline[1].trim().length > 2) return inline[1].trim().slice(0, 120);
                }
                sectionDepth++;
                if (sectionDepth > 18) break;
            }
        }
        return '';
    },

    _textAfterLabel(lines, labels) {
        const labs = (Array.isArray(labels) ? labels : [labels]).map(l => this._normLine(l));
        for (let i = 0; i < lines.length - 1; i++) {
            const cur = this._normLine(lines[i]);
            if (!labs.some(lab => cur === lab || cur.startsWith(lab + ' '))) continue;
            const inline = lines[i].match(/[:\s]+(.+)/);
            if (inline && inline[1].length > 3 && !/^(pix|ted|doc)$/i.test(inline[1].trim())) {
                return inline[1].trim().slice(0, 120);
            }
            for (let j = 1; j <= 2 && i + j < lines.length; j++) {
                const val = lines[i + j].trim();
                if (val.length > 2 && !labs.includes(this._normLine(val))) return val.slice(0, 120);
            }
        }
        return '';
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
        const lines = this._lines(text);
        const garbage = /^(nos|nas|nfe|nfce|via|pix|cpf|cnpj|valor|total|data|nome|r\$|comprovante|sat|danfe|ecf|obrigado|volte|qtd|un|kg|cod|desc|item|itens|subtotal|troco)$/i;
        const skip = /^(cnpj|cpf|nf|nfe|nfc|nota|cupom|documento|sat|danfe|tel|fone|www|http|https|data|emiss|serie|série|chave|consumidor|valor|total|subtotal|troco|tributos|protocolo|ie[\s:])/i;
        for (let i = 0; i < lines.length; i++) {
            if (/cnpj/i.test(lines[i]) && i > 0) {
                const prev = lines[i - 1].trim();
                if (prev.length >= 4 && !garbage.test(prev) && !skip.test(prev) && !/^\d+$/.test(prev)) {
                    return prev.slice(0, 80);
                }
            }
        }
        const candidates = lines.filter(l =>
            l.length >= 4 && l.length < 70 &&
            !/^\d+$/.test(l) &&
            !skip.test(l) &&
            !garbage.test(l.trim()) &&
            !/^\d{2}[\/\-]\d{2}/.test(l) &&
            !/^r?\$/i.test(l)
        );
        for (const line of candidates.slice(0, 10)) {
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

    _detectDocType(text) {
        if (this._inferPixFromText(text)) return 'pix';
        const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const score = { pix: 0, boleto: 0, comprovante_bancario: 0, cupom_fiscal: 0 };
        if (/pix|transferencia instantanea|transacao pix|qr code pix|chave pix|e2e|end to end|id da transacao/i.test(t)) score.pix += 3;
        if (/comprovante.*pix|pix enviado|pix recebido|pagamento via pix|tipo de transferencia.*pix/i.test(t)) score.pix += 4;
        if (/comprovante de transferencia|nu pagamentos|nubank|\bnu\b/.test(t)) score.pix += 2;
        if (/\bdestino\b/.test(t) && /\borigem\b/.test(t) && /pix/i.test(t)) score.pix += 5;
        if (/boleto|linha digitavel|codigo de barras|cod\. de barras|cedente|sacado|nosso numero|valor do documento|valor cobrado/i.test(t)) score.boleto += 3;
        if (/vencimento/i.test(t) && /beneficiario|cedente|sacador/i.test(t)) score.boleto += 2;
        if (/comprovante de (transferencia|pagamento|ted|doc)|internet banking|autenticacao|agencia|conta corrente|conta poupanca|comprovante bancario/i.test(t)) score.comprovante_bancario += 3;
        if (/ted\b|doc\b|transferencia eletronica/i.test(t)) score.comprovante_bancario += 2;
        if (/nfce|nfe|cupom fiscal|nota fiscal|danfe|\bsat\b|\becf\b|doc\. fiscal|consumidor/i.test(t)) score.cupom_fiscal += 3;
        if (/chave de acesso|\d{44}/.test(text.replace(/\s/g, '')) && score.cupom_fiscal === 0 && score.pix < 2) score.cupom_fiscal += 2;
        const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
        return best[1] >= 2 ? best[0] : 'outro';
    },

    _extractByPatterns(text, patterns) {
        for (const pat of patterns) {
            const m = text.match(pat);
            if (m && m[1]?.trim()) return m[1].trim().slice(0, 120);
        }
        return '';
    },

    _extractPixBeneficiary(text) {
        const lines = this._lines(text);
        const fromDestino = this._fieldInSection(lines, 'destino', ['nome', 'favorecido', 'recebedor']);
        if (fromDestino && this._looksLikePersonName(fromDestino)) return fromDestino;

        const fuzzyDestino = text.match(/dest\w*[\s\S]{0,160}?(?:nome[\s\S]{0,40}?)?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-záéíóúâêôãõç]+(?:\s+[A-Za-záéíóúâêôãõç]+){1,6})/i);
        if (fuzzyDestino && this._looksLikePersonName(fuzzyDestino[1])) return fuzzyDestino[1].trim().slice(0, 120);

        const beforeNu = text.match(/([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-záéíóúâêôãõç]+(?:\s+[A-Za-záéíóúâêôãõç]+){2,6})\s*(?:\n|\r|.){0,3}NU PAGAMENTOS/i);
        if (beforeNu && this._looksLikePersonName(beforeNu[1])) return beforeNu[1].trim().slice(0, 120);

        const afterNome = this._textAfterLabel(lines, ['nome do recebedor', 'nome recebedor', 'para', 'nome']);
        if (afterNome && this._looksLikePersonName(afterNome) && !/^(instituicao|agencia|conta|nu pagamentos)/i.test(afterNome)) return afterNome;

        return this._extractByPatterns(text, [
            /(?:para|favorecido|recebedor|destinat[aá]rio|nome do recebedor|benefici[aá]rio|destino)[:\s]*\n?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç0-9 .&\-]{2,70})/i,
            /(?:para|favorecido)[:\s]+([^\n\dR$]{3,70})/i,
        ]);
    },

    _extractPixPayer(text) {
        const lines = this._lines(text);
        const fromOrigem = this._fieldInSection(lines, 'origem', ['nome', 'pagador', 'remetente']);
        if (fromOrigem && this._looksLikePersonName(fromOrigem)) return fromOrigem;
        const hit = this._extractByPatterns(text, [
            /(?:de|pagador|remetente|origem|nome do pagador)[:\s]*\n?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\n]{2,70})/i,
        ]);
        return hit && this._looksLikePersonName(hit) ? hit : '';
    },

    _extractPixTransactionId(text) {
        const compact = text.replace(/\s/g, '');
        const nubank = compact.match(/E18236120[0-9A-Za-z]{10,22}/i);
        if (nubank) return nubank[0].toUpperCase().slice(0, 32);

        const labeled = this._extractByPatterns(text, [
            /(?:id\s*(?:da\s*)?transa[cç][aã]o|identificador|e2e|end\s*to\s*end|codigo da transacao)[:\s]*\n?\s*([Ee][A-Za-z0-9\s]{28,45})/i,
        ]);
        if (labeled) {
            const id = labeled.replace(/\s/g, '').toUpperCase();
            if (id.length >= 28) return id.slice(0, 32);
        }
        const lines = this._lines(text);
        for (let i = 0; i < lines.length; i++) {
            if (/id\s*(?:da\s*)?transa/i.test(lines[i])) {
                let chunk = lines.slice(i, i + 4).join('');
                chunk = chunk.replace(/\s/g, '');
                const cand = chunk.match(/(E[0-9A-Za-z]{28,35})/i);
                if (cand) return cand[1].toUpperCase().slice(0, 32);
            }
        }
        const patterns = [
            /E[0-9]{8}20[0-9]{6}[0-9A-Za-z]{4,11}(?=[^0-9A-Za-z]|$)/i,
            /E[0-9A-Za-z]{31}(?=[^0-9A-Za-z]|$)/i,
        ];
        for (const pat of patterns) {
            const m = compact.match(pat);
            if (m) return m[0].toUpperCase().slice(0, 32);
        }
        return '';
    },

    _extractPixValue(text) {
        const nearValor = text.match(/valor[\s\S]{0,100}?R\s*\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
        if (nearValor) {
            const v = this._parseMoney(nearValor[1]);
            if (!isNaN(v) && v > 0) return v;
        }
        const rValues = this._extractRMoneyValues(text);
        if (rValues.length === 1) return rValues[0].v;
        if (rValues.length > 1) return Math.max(...rValues.map(x => x.v));

        const lines = this._lines(text);
        const fromLabel = this._valueAfterLabel(lines, this.PIX_LABELS.value);
        if (fromLabel != null && fromLabel >= 1) return fromLabel;

        const patterns = [
            /valor\s*(?:do\s*)?(?:pix|transferido|pago|da\s*transa[cç][aã]o|da\s*transfer[eê]ncia)?\s*[:\s]*\n?\s*r?\$?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/i,
            /(?:transferido|enviado|recebido)\s*[:\s]*r?\$?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/i,
        ];
        for (const pat of patterns) {
            const m = text.match(pat);
            if (m) {
                const v = this._parseMoney(m[1]);
                if (!isNaN(v) && v > 0) return v;
            }
        }
        return null;
    },

    _extractBoletoBeneficiary(text) {
        return this._extractByPatterns(text, [
            /(?:benefici[aá]rio(?:\s*final)?|cedente|sacador(?:\s*vendedor)?)[:\s]*\n?\s*([^\n]{3,80})/i,
        ]);
    },

    _extractDueDate(text) {
        const m = text.match(/(?:vencimento|data\s*de\s*vencimento|venc\.?)[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})/i);
        if (!m) return '';
        let d = m[1];
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
            const [dd, mm, yyyy] = d.split('/');
            return `${yyyy}-${mm}-${dd}`;
        }
        if (/^\d{2}-\d{2}-\d{4}$/.test(d)) {
            const [dd, mm, yyyy] = d.split('-');
            return `${yyyy}-${mm}-${dd}`;
        }
        return d;
    },

    _extractLinhaDigitavel(text) {
        const compact = text.replace(/[^\d\s.]/g, ' ').replace(/\s+/g, ' ').trim();
        const groups = compact.match(/(?:\d{5}[.\s]?\d{5}[.\s]?\d{5}[.\s]?\d{6}[.\s]?\d{5}[.\s]?\d{6}[.\s]?\d{1}[.\s]?\d{14}|\d{47,48})/);
        if (groups) return groups[0].replace(/\s/g, '').replace(/\./g, '');
        const digits = text.replace(/\D/g, '');
        const m47 = digits.match(/(\d{47,48})/);
        return m47 ? m47[1] : '';
    },

    _extractBankBeneficiary(text) {
        return this._extractByPatterns(text, [
            /(?:favorecido|benefici[aá]rio|nome do favorecido|credito em favor de)[:\s]*\n?\s*([^\n]{3,80})/i,
            /(?:para|destino)[:\s]*\n?\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\n]{3,70})/i,
        ]);
    },

    _extractBankAuth(text) {
        return this._extractByPatterns(text, [
            /(?:autentica[cç][aã]o|autenticacao|cod\.?\s*autentica[cç][aã]o|nsu|protocolo)[:\s]*([A-Za-z0-9\.\-\s]{6,50})/i,
        ]);
    },

    _extractBankValue(text) {
        const patterns = [
            /valor\s*(?:transferido|pago|creditado|da\s*operacao|l[ií]quido)?\s*[:\s]*r?\$?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/i,
            /(?:ted|doc|transferencia)\s*[:\s]*r?\$?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/i,
        ];
        for (const pat of patterns) {
            const m = text.match(pat);
            if (m) {
                const v = this._parseMoney(m[1]);
                if (!isNaN(v) && v > 0) return v;
            }
        }
        return null;
    },

    _extractBoletoValue(text) {
        const patterns = [
            /valor\s*(?:do\s*)?(?:documento|cobrado|boleto|titulo)\s*[:\s]*r?\$?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/i,
            /(?:\(\=\)\s*)?valor\s*[:\s]*r?\$?\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/i,
        ];
        for (const pat of patterns) {
            const m = text.match(pat);
            if (m) {
                const v = this._parseMoney(m[1]);
                if (!isNaN(v) && v > 0) return v;
            }
        }
        return null;
    },

    _parsePix(text) {
        let beneficiary = this._extractPixBeneficiary(text);
        if (!this._looksLikePersonName(beneficiary)) beneficiary = '';
        let payer = this._extractPixPayer(text);
        if (!this._looksLikePersonName(payer)) payer = '';
        const value = this._extractPixValue(text);
        const transactionId = this._extractPixTransactionId(text);
        const dateRaw = this._extractDate(text);
        const today = new Date().toISOString().slice(0, 10);
        const date = dateRaw === today && !/\d{1,2}\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)|\d{2}\/\d{2}\/\d{4}/i.test(text) ? '' : dateRaw;
        const time = this._extractTime(text);
        const merchant = beneficiary || 'Pix';
        const isNubank = /nu pagamentos|nubank|comprovante de transferencia/i.test(text);
        return {
            description: beneficiary || merchant,
            merchant: beneficiary || merchant,
            beneficiary,
            payer,
            value,
            date,
            time,
            paymentMethod: 'Pix',
            transactionId,
            category: beneficiary ? 'Outros' : this.guessCategory(merchant, text),
            notes: [
                transactionId ? `ID Pix: ${transactionId}` : '',
                payer ? `Pagador: ${payer}` : '',
                isNubank ? 'Nubank' : '',
            ].filter(Boolean).join(' · '),
            confidence: {
                merchant: beneficiary ? 0.92 : 0.5,
                value: value ? 0.9 : 0,
                date: /\d{4}-\d{2}-\d{2}|JUL|JAN|FEV|MAR|ABR|MAI|JUN|AGO|SET|OUT|NOV|DEZ/i.test(text) ? 0.88 : 0.5,
                transactionId: transactionId ? 0.95 : 0,
                docType: 0.92,
            },
        };
    },

    _parseBoleto(text) {
        const beneficiary = this._extractBoletoBeneficiary(text);
        const value = this._extractBoletoValue(text) ?? this._extractTotal(text);
        const dueDate = this._extractDueDate(text);
        const barcode = this._extractLinhaDigitavel(text);
        const date = this._extractDate(text);
        const cnpj = this._extractCnpj(text);
        const merchant = beneficiary || 'Boleto';
        return {
            description: merchant,
            merchant,
            beneficiary,
            value,
            date,
            dueDate,
            barcode,
            cnpj,
            paymentMethod: 'Outro',
            category: 'Contas Fixas',
            notes: barcode ? `Linha digitável: ${barcode}` : '',
        };
    },

    _parseBank(text) {
        const beneficiary = this._extractBankBeneficiary(text);
        const value = this._extractBankValue(text) ?? this._extractTotal(text);
        const bankAuth = this._extractBankAuth(text);
        const date = this._extractDate(text);
        const time = this._extractTime(text);
        const paymentMethod = this._extractPaymentMethod(text) || 'Outro';
        const merchant = beneficiary || this._extractMerchant(text);
        return {
            description: merchant === 'Compra' ? (beneficiary || 'Transferência bancária') : merchant,
            merchant: beneficiary || merchant,
            beneficiary,
            value,
            date,
            time,
            paymentMethod,
            bankAuth,
            category: 'Contas Fixas',
            notes: bankAuth ? `Autenticação: ${bankAuth}` : '',
        };
    },

    _parseFiscal(text) {
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

    parse(text) {
        let docType = this._detectDocType(text);
        if (docType === 'outro' && this._inferPixFromText(text)) docType = 'pix';
        const baseMeta = { rawText: text, fromScan: true, fundamentalType: 'despesa' };

        if (docType === 'pix') {
            const pix = this._parsePix(text);
            return {
                ...pix,
                ...baseMeta,
                docType: 'pix',
                paymentMethod: 'Pix',
                confidence: { ...(pix.confidence || {}), docType: 0.92, transactionId: pix.transactionId ? 0.95 : 0 },
            };
        }
        if (docType === 'boleto') {
            const boleto = this._parseBoleto(text);
            return {
                ...boleto,
                ...baseMeta,
                docType: 'boleto',
                confidence: { docType: 0.88, dueDate: boleto.dueDate ? 0.85 : 0, barcode: boleto.barcode ? 0.9 : 0, value: boleto.value ? 0.85 : 0 },
            };
        }
        if (docType === 'comprovante_bancario') {
            const bank = this._parseBank(text);
            return {
                ...bank,
                ...baseMeta,
                docType: 'comprovante_bancario',
                confidence: { docType: 0.85, bankAuth: bank.bankAuth ? 0.8 : 0, value: bank.value ? 0.85 : 0 },
            };
        }

        let result = this._parseFiscal(text);
        result.docType = docType === 'cupom_fiscal' ? 'cupom_fiscal' : 'outro';
        if (result.docType === 'cupom_fiscal') {
            result.confidence = { ...result.confidence, docType: 0.85 };
        }
        return result;
    },

    async scanFile(file, onProgress) {
        if (!file) throw new Error('Nenhuma imagem selecionada.');
        const ok = await this._ensureTesseract();
        if (!ok) throw new Error('Não foi possível carregar o leitor OCR. Verifique sua conexão com a internet e tente novamente.');

        onProgress && onProgress(3, 'Preparando imagem...');
        let processed;
        try {
            processed = await this._preprocessImage(file, 'standard');
        } catch (err) {
            throw err;
        }
        let inverted;
        let binary;
        try {
            inverted = await this._preprocessImage(file, 'invert');
            binary = await this._preprocessImage(file, 'binary');
        } catch { /* optional variants */ }

        onProgress && onProgress(8, 'Iniciando leitura OCR...');
        let best = null;
        let bestScore = -1;
        const psms = ['4', '6', '11', '3'];
        const sources = [processed, inverted, binary, this._asFile(file)].filter(Boolean);

        for (const src of sources) {
            for (const psm of psms) {
                try {
                    onProgress && onProgress(12, `Leitura OCR (modo ${psm})...`);
                    let parsed;
                    if (typeof this._recognizeDetailed === 'function' && typeof this.parseWithLayout === 'function') {
                        const ocr = await this._recognizeDetailed(src, onProgress, psm);
                        parsed = this.parseWithLayout(ocr);
                        parsed.rawText = ocr.text;
                    } else {
                        const text = await this._recognizeImage(src, onProgress, psm);
                        parsed = this._safeParse(text);
                        parsed.rawText = text;
                    }
                    const score = this._parseScore(parsed);
                    if (score > bestScore) {
                        best = parsed;
                        bestScore = score;
                    }
                    if (score >= 22) break;
                } catch { /* tenta próximo modo */ }
            }
            if (bestScore >= 22) break;
        }

        if (!best) {
            throw new Error('Falha ao ler a imagem. Tente outra foto, mais luz ou um print da tela do comprovante Pix.');
        }

        onProgress && onProgress(100, 'Concluído!');
        return best;
    },

    /** Preenche campos do formulário de transação com dados do scan */
    fillTransactionForm(parsed) {
        try {
            if (typeof TransactionFormFill !== 'undefined') {
                TransactionFormFill.apply(parsed, { fromScan: true });
            }
            this._showScanSummary(parsed);
        } catch (err) {
            console.error('[ReceiptScanner] fillTransactionForm', err);
            throw new Error('Leitura OK, mas houve erro ao preencher o formulário. Complete os campos manualmente.');
        }
    },

    _showScanSummary(parsed) {
        const el = document.getElementById('receipt-scan-summary');
        if (!el) return;
        const conf = parsed.confidence || {};
        const pct = (v) => v ? `${Math.round(v * 100)}%` : '—';
        const docLabel = this.DOC_TYPES[parsed.docType] || this.DOC_TYPES.outro;
        const fields = [
            ['Tipo', docLabel, conf.docType || 0.8],
            ['Descrição', parsed.merchant || parsed.description, conf.merchant],
            ['Valor', parsed.value ? `R$ ${Number(parsed.value).toFixed(2)}` : '', conf.value],
        ];
        if (parsed.docType === 'pix') {
            fields.push(['Favorecido', parsed.beneficiary, conf.merchant]);
            if (parsed.transactionId) fields.push(['ID Pix', parsed.transactionId, conf.transactionId]);
        } else if (parsed.docType === 'boleto') {
            fields.push(['Beneficiário', parsed.beneficiary, conf.merchant]);
            if (parsed.dueDate) fields.push(['Vencimento', parsed.dueDate, conf.dueDate]);
            if (parsed.barcode) fields.push(['Linha digitável', '✓ Detectada', conf.barcode]);
        } else if (parsed.docType === 'comprovante_bancario') {
            fields.push(['Favorecido', parsed.beneficiary, conf.merchant]);
            if (parsed.bankAuth) fields.push(['Autenticação', parsed.bankAuth.slice(0, 20) + (parsed.bankAuth.length > 20 ? '…' : ''), conf.bankAuth]);
        } else {
            if (parsed.cnpj) fields.push(['CNPJ', parsed.cnpj, conf.cnpj]);
            if (parsed.nfNumber) fields.push(['Nº NF', parsed.nfNumber, conf.nfNumber]);
            if (parsed.accessKey) fields.push(['Chave', '✓ Detectada', conf.accessKey]);
        }
        const visible = fields.filter(([, val]) => val);

        el.innerHTML = visible.length ? `
            <p class="receipt-scan-title">Leitura automática — confira os campos abaixo</p>
            <div class="receipt-scan-tags">
                ${visible.map(([label, val, c]) =>
                    `<span class="receipt-scan-tag" title="Confiança ${pct(c)}">${label}: <b>${val}</b></span>`
                ).join('')}
            </div>` : '';
        el.classList.remove('hidden');
    },

    collectReceiptFromForm(form) {
        const q = (sel) => form.querySelector(sel)?.value?.trim() || '';
        const receipt = {
            docType: q('#receipt-doc-type'),
            merchant: q('#trans-description'),
            beneficiary: q('#receipt-beneficiary'),
            cnpj: q('#receipt-cnpj'),
            cpf: q('#receipt-cpf'),
            nfNumber: q('#receipt-nf-number'),
            series: q('#receipt-series'),
            accessKey: q('#receipt-access-key'),
            transactionId: q('#receipt-pix-id'),
            dueDate: q('#receipt-due-date'),
            barcode: q('#receipt-barcode'),
            bankAuth: q('#receipt-bank-auth'),
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

// Garante API pública mesmo com cache parcial de versões antigas
if (typeof window !== 'undefined') {
    window.ReceiptScanner = ReceiptScanner;
    if (typeof ReceiptScanner.fillTransactionForm !== 'function') {
        ReceiptScanner.fillTransactionForm = function (parsed) {
            if (typeof TransactionFormFill !== 'undefined') {
                TransactionFormFill.apply(parsed, { fromScan: true });
            }
            ReceiptScanner._showScanSummary && ReceiptScanner._showScanSummary(parsed);
        };
    }
}
