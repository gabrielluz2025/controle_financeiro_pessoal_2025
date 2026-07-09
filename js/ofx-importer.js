/**
 * OFX/QFX Importer — Finanças+
 * Suporte a OFX 1.x (SGML) e OFX 2.x (XML)
 * Compatível com: Nubank, Itaú, Bradesco, Santander, BB, Caixa, Inter, C6, BTG, XP...
 */

const OFXImporter = {

    // ── Mapeamento de tipos de transação OFX → categoria ────────────────────
    typeMap: {
        CREDIT:   { type: 'receita', category: 'Receitas' },
        DEBIT:    { type: 'despesa', category: 'Outros' },
        DEP:      { type: 'receita', category: 'Receitas' },
        INT:      { type: 'receita', category: 'Receitas' },
        DIV:      { type: 'receita', category: 'Receitas' },
        XFER:     { type: 'despesa', category: 'Transferência' },
        CHECK:    { type: 'despesa', category: 'Outros' },
        PAYMENT:  { type: 'despesa', category: 'Contas e Assinaturas' },
        CASH:     { type: 'despesa', category: 'Outros' },
        DIRECTDEBIT: { type: 'despesa', category: 'Contas e Assinaturas' },
        DIRECTDEP:   { type: 'receita', category: 'Salário' },
        REPEATPMT:   { type: 'despesa', category: 'Contas e Assinaturas' },
        ATM:      { type: 'despesa', category: 'Outros' },
        POS:      { type: 'despesa', category: 'Compras' },
        SRVCHG:   { type: 'despesa', category: 'Tarifas Bancárias' },
        FEE:      { type: 'despesa', category: 'Tarifas Bancárias' },
        OTHER:    { type: 'despesa', category: 'Outros' },
    },

    // ── Mapeamento de palavras-chave para categorias ─────────────────────────
    keywordCategories: [
        { keywords: ['supermercado','mercado','extra','carrefour','pão de açúcar','atacadão','cia','compra'], category: 'Alimentação' },
        { keywords: ['ifood','rappi','uber eats','delivery','pizza','restaurante','lanchonete','padaria','café'], category: 'Alimentação' },
        { keywords: ['posto','gasolina','combustivel','petrobras','shell','ipiranga'], category: 'Transporte' },
        { keywords: ['uber','99','cabify','táxi','ônibus','metro','bilhete','passagem'], category: 'Transporte' },
        { keywords: ['netflix','spotify','amazon prime','disney','hbo','youtube','prime video','globoplay'], category: 'Lazer' },
        { keywords: ['farmácia','drogasil','ultrafarma','droga','remedios','saúde','hospital','clínica','médico','dentista'], category: 'Saúde' },
        { keywords: ['escola','faculdade','universidade','curso','mensalidade','educação'], category: 'Educação' },
        { keywords: ['luz','água','gás','energia','cpfl','enel','sabesp','cedae','comgas'], category: 'Contas e Assinaturas' },
        { keywords: ['aluguel','condomínio','iptu','financiamento','habitação'], category: 'Moradia' },
        { keywords: ['salário','pagamento','salario','vencimento','remuneração'], category: 'Salário' },
        { keywords: ['pix recebido','transferência recebida','ted recebido','doc recebido'], category: 'Receitas' },
        { keywords: ['roupa','vestuário','calçado','zara','renner','c&a','riachuelo'], category: 'Compras' },
        { keywords: ['hotel','airbnb','booking','viagem','passagem aérea','latam','gol','azul'], category: 'Viagem' },
        { keywords: ['academia','palestra','smartfit','bio ritmo'], category: 'Saúde' },
    ],

    // ── Detectar categoria por descrição ────────────────────────────────────
    detectCategory(description, ofxType) {
        if (!description) return this.typeMap[ofxType]?.category || 'Outros';
        const lower = description.toLowerCase();
        for (const { keywords, category } of this.keywordCategories) {
            if (keywords.some(k => lower.includes(k))) return category;
        }
        return this.typeMap[ofxType]?.category || 'Outros';
    },

    // ── Parser principal ─────────────────────────────────────────────────────
    parse(content) {
        const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        // Detectar formato: OFX 2.x (XML) ou OFX 1.x (SGML)
        if (normalized.trim().startsWith('<?xml') || normalized.includes('<OFX>')) {
            return this.parseXML(normalized);
        }
        return this.parseSGML(normalized);
    },

    // ── Parser OFX 1.x (SGML) ───────────────────────────────────────────────
    parseSGML(content) {
        // Extrair bloco de dados (após cabeçalho)
        const ofxStart = content.indexOf('<OFX>');
        const body = ofxStart >= 0 ? '<OFX>' + content.slice(ofxStart + 5) : content;

        const get = (tag, text) => {
            const re = new RegExp(`<${tag}>([^<]*)`, 'i');
            const m = re.exec(text);
            return m ? m[1].trim() : '';
        };

        const getAll = (tag, text) => {
            const results = [];
            const re = new RegExp(`<${tag}>([^<]*)`, 'gi');
            let m;
            while ((m = re.exec(text)) !== null) results.push(m[1].trim());
            return results;
        };

        // Extrair todas as transações STMTTRN
        const txBlocks = [];
        const txRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
        let txMatch;
        while ((txMatch = txRe.exec(body)) !== null) {
            txBlocks.push(txMatch[1]);
        }

        // Se não encontrar blocos fechados, tentar formato sem fechamento
        if (txBlocks.length === 0) {
            const parts = body.split('<STMTTRN>');
            for (let i = 1; i < parts.length; i++) {
                txBlocks.push(parts[i].split('<STMTTRN>')[0]);
            }
        }

        // Info da conta
        const bankId   = get('BANKID', body) || get('BROKERID', body) || '';
        const acctId   = get('ACCTID', body) || '';
        const acctType = get('ACCTTYPE', body) || 'CHECKING';
        const currency = get('CURSYM', body) || get('CURDEF', body) || 'BRL';

        const transactions = txBlocks.map(block => this.parseTxBlock(block, get)).filter(Boolean);
        return { transactions, bankId, acctId, acctType, currency, count: transactions.length };
    },

    // ── Parser OFX 2.x (XML) ────────────────────────────────────────────────
    parseXML(content) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/xml');
        const getText = (el, tag) => el?.querySelector(tag)?.textContent?.trim() || '';

        const bankId  = getText(doc, 'BANKID') || getText(doc, 'BROKERID') || '';
        const acctId  = getText(doc, 'ACCTID') || '';
        const acctType = getText(doc, 'ACCTTYPE') || 'CHECKING';
        const currency = getText(doc, 'CURSYM') || getText(doc, 'CURDEF') || 'BRL';

        const txEls = doc.querySelectorAll('STMTTRN');
        const transactions = Array.from(txEls).map(el => {
            const get = (tag) => el.querySelector(tag)?.textContent?.trim() || '';
            return this.parseTxFromGetFn(get);
        }).filter(Boolean);

        return { transactions, bankId, acctId, acctType, currency, count: transactions.length };
    },

    // ── Parsear um bloco de transação ────────────────────────────────────────
    parseTxBlock(block, getFn) {
        const get = (tag) => getFn(tag, block);
        return this.parseTxFromGetFn(get);
    },

    parseTxFromGetFn(get) {
        const trntype = (get('TRNTYPE') || 'OTHER').toUpperCase();
        const dtposted = get('DTPOSTED') || get('DTUSER') || '';
        const amtRaw = get('TRNAMT') || get('TRNAMT') || '0';
        const memo = get('MEMO') || get('NAME') || get('PAYEE') || 'Transação';
        const fitid = get('FITID') || '';

        const amount = parseFloat(amtRaw.replace(',', '.'));
        if (isNaN(amount)) return null;

        // Converter data OFX (YYYYMMDD ou YYYYMMDDHHMMSS) para ISO
        const date = this.parseOFXDate(dtposted);
        if (!date) return null;

        // Determinar tipo pela combinação de trntype e sinal do valor
        let fundamentalType = amount >= 0 ? 'receita' : 'despesa';
        if (trntype === 'DEBIT' || trntype === 'CHECK' || trntype === 'ATM' || trntype === 'POS' || trntype === 'PAYMENT') {
            fundamentalType = 'despesa';
        } else if (trntype === 'CREDIT' || trntype === 'DEP' || trntype === 'DIRECTDEP') {
            fundamentalType = 'receita';
        }

        const category = this.detectCategory(memo, trntype);

        return {
            id: 'ofx-' + fitid + '-' + date,
            description: this.cleanMemo(memo),
            value: Math.abs(amount),
            fundamentalType,
            category,
            date,
            isPaid: true,
            isCreditCard: false,
            ofxId: fitid,
        };
    },

    // ── Converter data OFX para YYYY-MM-DD ──────────────────────────────────
    parseOFXDate(dateStr) {
        if (!dateStr) return null;
        const clean = dateStr.replace(/[^0-9]/g, '').substring(0, 8);
        if (clean.length < 8) return null;
        const y = clean.substring(0, 4);
        const m = clean.substring(4, 6);
        const d = clean.substring(6, 8);
        if (parseInt(m) < 1 || parseInt(m) > 12) return null;
        if (parseInt(d) < 1 || parseInt(d) > 31) return null;
        return `${y}-${m}-${d}`;
    },

    // ── Limpar descrição ─────────────────────────────────────────────────────
    cleanMemo(memo) {
        return memo
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '')
            .substring(0, 80)
            || 'Transação';
    },

    // ── Ler arquivo e retornar resultado ────────────────────────────────────
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    const result = this.parse(content);
                    resolve(result);
                } catch (err) {
                    reject(new Error('Arquivo OFX inválido: ' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
            // Tentar UTF-8 primeiro, depois latin-1 (alguns bancos usam)
            reader.readAsText(file, 'UTF-8');
        });
    },
};
