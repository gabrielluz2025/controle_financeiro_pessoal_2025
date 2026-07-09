/**
 * CSV Multi-Banco Importer — Finanças+
 * Detecta automaticamente o banco pelo formato do arquivo CSV
 * Suporte: Nubank, Inter, Itaú, Bradesco, Santander, Banco do Brasil, Caixa, C6 Bank
 */

const CSVImporter = {

    // ── Definição dos parsers por banco ──────────────────────────────────────
    banks: {
        nubank: {
            name: 'Nubank',
            color: '#8b5cf6',
            detect: (header) => header.includes('Data') && header.includes('Valor') && header.includes('Identificador') && header.includes('Descrição'),
            parse: (rows, header) => {
                const iDate = header.indexOf('Data');
                const iDesc = header.indexOf('Descrição');
                const iVal  = header.indexOf('Valor');
                return rows.map(r => {
                    const value = parseFloat((r[iVal] || '0').replace(',', '.'));
                    return {
                        date:        CSVImporter.parseDate(r[iDate]),
                        description: r[iDesc] || '',
                        value:       Math.abs(value),
                        fundamentalType: value < 0 ? 'despesa' : 'receita',
                    };
                });
            },
        },

        // Nubank cartão de crédito (fatura)
        nubank_cc: {
            name: 'Nubank (Cartão)',
            color: '#8b5cf6',
            detect: (header) => header.includes('date') && header.includes('title') && header.includes('amount') && header.includes('category'),
            parse: (rows, header) => {
                const iDate = header.indexOf('date');
                const iDesc = header.indexOf('title');
                const iVal  = header.indexOf('amount');
                const iCat  = header.indexOf('category');
                return rows.map(r => {
                    const value = Math.abs(parseFloat((r[iVal] || '0').replace(',', '.')));
                    return {
                        date:        CSVImporter.parseDate(r[iDate]),
                        description: r[iDesc] || '',
                        value,
                        category:    CSVImporter.nubank_category_map[r[iCat]] || r[iCat] || 'Outros',
                        fundamentalType: 'despesa',
                    };
                });
            },
        },

        inter: {
            name: 'Banco Inter',
            color: '#ff7a00',
            detect: (header) => header.some(h => h.toLowerCase().includes('histórico') || h.toLowerCase().includes('historico')) &&
                                 header.some(h => h.toLowerCase().includes('data lançamento') || h.toLowerCase().includes('data')),
            parse: (rows, header) => {
                const iDate = header.findIndex(h => h.toLowerCase().includes('data'));
                const iDesc = header.findIndex(h => h.toLowerCase().includes('hist') || h.toLowerCase().includes('descri'));
                const iVal  = header.findIndex(h => h.toLowerCase().includes('valor'));
                const iTipo = header.findIndex(h => h.toLowerCase().includes('tipo') || h.toLowerCase().includes('natureza'));
                return rows.map(r => {
                    const value = Math.abs(parseFloat((r[iVal] || '0').replace('.', '').replace(',', '.')));
                    const tipoStr = (r[iTipo] || '').toLowerCase();
                    const isCredit = tipoStr.includes('crédito') || tipoStr.includes('credito') || tipoStr.includes('recebimento');
                    return {
                        date:        CSVImporter.parseDate(r[iDate]),
                        description: r[iDesc] || '',
                        value,
                        fundamentalType: isCredit ? 'receita' : 'despesa',
                    };
                });
            },
        },

        itau: {
            name: 'Itaú',
            color: '#ff8c00',
            detect: (header) => header.some(h => h.includes('Lançamento')) && header.some(h => h.includes('Histórico')),
            parse: (rows, header) => {
                const iDate = header.findIndex(h => h.includes('Lançamento') || h.includes('Data'));
                const iDesc = header.findIndex(h => h.includes('Histórico') || h.includes('Descrição'));
                const iVal  = header.findIndex(h => h.includes('Valor'));
                return rows.map(r => {
                    const raw = (r[iVal] || '').replace('.', '').replace(',', '.');
                    const value = parseFloat(raw) || 0;
                    return {
                        date:        CSVImporter.parseDate(r[iDate]),
                        description: r[iDesc] || '',
                        value:       Math.abs(value),
                        fundamentalType: value >= 0 ? 'receita' : 'despesa',
                    };
                });
            },
        },

        bradesco: {
            name: 'Bradesco',
            color: '#cc0000',
            detect: (header) => header.some(h => h.includes('Dt. Transação') || h.includes('Data')) &&
                                 header.some(h => h.includes('Descrição')),
            parse: (rows, header) => {
                const iDate = header.findIndex(h => h.includes('Data') || h.includes('Dt.'));
                const iDesc = header.findIndex(h => h.includes('Descrição'));
                const iVal  = header.findIndex(h => h.includes('Valor'));
                return rows.map(r => {
                    const raw = (r[iVal] || '').replace('.', '').replace(',', '.');
                    const value = parseFloat(raw) || 0;
                    return {
                        date:        CSVImporter.parseDate(r[iDate]),
                        description: r[iDesc] || '',
                        value:       Math.abs(value),
                        fundamentalType: value >= 0 ? 'receita' : 'despesa',
                    };
                });
            },
        },

        santander: {
            name: 'Santander',
            color: '#ec0000',
            detect: (header) => header.some(h => h.includes('Data') || h.includes('Fecha')) &&
                                 header.some(h => h.includes('Movimiento') || h.includes('Descrição') || h.includes('Lançamento')),
            parse: (rows, header) => {
                const iDate = header.findIndex(h => h.includes('Data') || h.includes('Fecha'));
                const iDesc = header.findIndex(h => h.includes('Movimiento') || h.includes('Descrição') || h.includes('Lançamento'));
                const iVal  = header.findIndex(h => h.includes('Valor') || h.includes('Importe'));
                return rows.map(r => {
                    const raw = (r[iVal] || '').replace('.', '').replace(',', '.');
                    const value = parseFloat(raw) || 0;
                    return {
                        date:        CSVImporter.parseDate(r[iDate]),
                        description: r[iDesc] || '',
                        value:       Math.abs(value),
                        fundamentalType: value >= 0 ? 'receita' : 'despesa',
                    };
                });
            },
        },

        bb: {
            name: 'Banco do Brasil',
            color: '#f5c518',
            detect: (header) => header.some(h => h.includes('Data') && !h.includes('Dt.')) &&
                                 header.some(h => h.includes('Histórico') || h.includes('Dependência Origem')),
            parse: (rows, header) => {
                const iDate = header.findIndex(h => h.includes('Data'));
                const iDesc = header.findIndex(h => h.includes('Histórico') || h.includes('Descrição'));
                const iVal  = header.findIndex(h => h.includes('Valor'));
                return rows.map(r => {
                    const raw = (r[iVal] || '').replace('.', '').replace(',', '.');
                    const value = parseFloat(raw) || 0;
                    return {
                        date:        CSVImporter.parseDate(r[iDate]),
                        description: r[iDesc] || '',
                        value:       Math.abs(value),
                        fundamentalType: value >= 0 ? 'receita' : 'despesa',
                    };
                });
            },
        },

        caixa: {
            name: 'Caixa Econômica',
            color: '#005ca9',
            detect: (header) => header.some(h => h.includes('Data')) && header.some(h => h.includes('Descrição') || h.includes('Histórico')) &&
                                 header.some(h => h.includes('Valor') || h.includes('Saldo')),
            parse: (rows, header) => {
                const iDate = header.findIndex(h => h.includes('Data'));
                const iDesc = header.findIndex(h => h.includes('Descrição') || h.includes('Histórico'));
                const iVal  = header.findIndex(h => h.includes('Valor') && !h.includes('Saldo'));
                return rows.map(r => {
                    const raw = (r[iVal] || '').replace('.', '').replace(',', '.');
                    const value = parseFloat(raw) || 0;
                    return {
                        date:        CSVImporter.parseDate(r[iDate]),
                        description: r[iDesc] || '',
                        value:       Math.abs(value),
                        fundamentalType: value >= 0 ? 'receita' : 'despesa',
                    };
                });
            },
        },

        c6: {
            name: 'C6 Bank',
            color: '#212121',
            detect: (header) => header.some(h => h.toLowerCase().includes('data') || h.toLowerCase().includes('date')) &&
                                 header.some(h => h.toLowerCase().includes('estabelecimento') || h.toLowerCase().includes('descricao') || h.toLowerCase().includes('descrição')),
            parse: (rows, header) => {
                const iDate = header.findIndex(h => h.toLowerCase().includes('data') || h.toLowerCase().includes('date'));
                const iDesc = header.findIndex(h => h.toLowerCase().includes('estabelecimento') || h.toLowerCase().includes('descri'));
                const iVal  = header.findIndex(h => h.toLowerCase().includes('valor'));
                return rows.map(r => {
                    const raw = (r[iVal] || '').replace('.', '').replace(',', '.');
                    const value = parseFloat(raw) || 0;
                    return {
                        date:        CSVImporter.parseDate(r[iDate]),
                        description: r[iDesc] || '',
                        value:       Math.abs(value),
                        fundamentalType: value >= 0 ? 'receita' : 'despesa',
                    };
                });
            },
        },
    },

    nubank_category_map: {
        'Alimentação': 'Alimentação', 'Casa': 'Moradia', 'Educação': 'Educação',
        'Eletrônicos': 'Compras', 'Lazer': 'Lazer', 'Outros': 'Outros',
        'Restaurante': 'Alimentação', 'Saúde': 'Saúde', 'Serviços': 'Serviços',
        'Supermercado': 'Alimentação', 'Transporte': 'Transporte', 'Vestuário': 'Compras',
        'Viagem': 'Viagem',
    },

    // ── Converter CSV em linhas/colunas ──────────────────────────────────────
    parseCSV(content) {
        // Remover BOM UTF-8 se existir
        const clean = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = clean.split('\n').filter(l => l.trim());

        // Detectar delimitador (vírgula ou ponto-e-vírgula)
        const firstLine = lines[0] || '';
        const delimiter = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

        const parseRow = (line) => {
            const result = [];
            let inQuote = false, current = '';
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') { inQuote = !inQuote; continue; }
                if (ch === delimiter && !inQuote) { result.push(current.trim()); current = ''; continue; }
                current += ch;
            }
            result.push(current.trim());
            return result;
        };

        return lines.map(parseRow);
    },

    // ── Detectar banco automaticamente ──────────────────────────────────────
    detectBank(header) {
        for (const [key, bank] of Object.entries(this.banks)) {
            if (bank.detect(header)) return key;
        }
        return null;
    },

    // ── Converter data para YYYY-MM-DD ──────────────────────────────────────
    parseDate(dateStr) {
        if (!dateStr) return null;
        const s = dateStr.trim();

        // DD/MM/YYYY ou DD/MM/YY
        let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (m) {
            let y = m[3]; if (y.length === 2) y = '20' + y;
            return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
        }
        // YYYY-MM-DD
        m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return s;
        // DD-MM-YYYY
        m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
        if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;

        return null;
    },

    // ── Auto-categorizar por descrição ───────────────────────────────────────
    detectCategory(description, fundamentalType) {
        if (typeof OFXImporter !== 'undefined') {
            return OFXImporter.detectCategory(description, fundamentalType === 'receita' ? 'CREDIT' : 'DEBIT');
        }
        if (!description) return 'Outros';
        const lower = description.toLowerCase();
        const rules = [
            { words: ['supermercado','mercado','extra','carrefour'], cat: 'Alimentação' },
            { words: ['ifood','rappi','restaurante','padaria','pizza'], cat: 'Alimentação' },
            { words: ['uber','99','taxi','ônibus','metro','gasolina','posto'], cat: 'Transporte' },
            { words: ['netflix','spotify','amazon','disney','prime'], cat: 'Lazer' },
            { words: ['farmácia','drogasil','hospital','médico','saúde'], cat: 'Saúde' },
            { words: ['escola','faculdade','curso','mensalidade'], cat: 'Educação' },
            { words: ['luz','água','energia','cpfl','enel','sabesp','gás'], cat: 'Contas e Assinaturas' },
            { words: ['aluguel','condomínio','iptu'], cat: 'Moradia' },
            { words: ['salário','pagamento','vencimento'], cat: 'Salário' },
        ];
        for (const { words, cat } of rules) {
            if (words.some(w => lower.includes(w))) return cat;
        }
        return fundamentalType === 'receita' ? 'Receitas' : 'Outros';
    },

    // ── Parse principal ──────────────────────────────────────────────────────
    parse(content) {
        const rows = this.parseCSV(content);
        if (rows.length < 2) throw new Error('Arquivo CSV vazio ou inválido');

        // Encontrar linha de cabeçalho (primeiras 5 linhas)
        let headerIdx = 0;
        let bankKey = null;
        for (let i = 0; i < Math.min(5, rows.length); i++) {
            bankKey = this.detectBank(rows[i]);
            if (bankKey) { headerIdx = i; break; }
        }

        if (!bankKey) {
            // Tentar com cabeçalho genérico
            bankKey = 'generic';
        }

        const header  = rows[headerIdx];
        const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => c.trim()));

        let transactions;
        if (bankKey !== 'generic' && this.banks[bankKey]) {
            transactions = this.banks[bankKey].parse(dataRows, header);
        } else {
            transactions = this.parseGeneric(dataRows, header);
        }

        // Filtrar linhas inválidas e enriquecer
        const valid = transactions
            .filter(t => t && t.date && t.value > 0)
            .map((t, i) => ({
                id:              'csv-' + Date.now() + '-' + i,
                description:     (t.description || 'Transação').substring(0, 80).trim(),
                value:           t.value,
                type:            t.fundamentalType,
                fundamentalType: t.fundamentalType,
                category:        t.category || this.detectCategory(t.description, t.fundamentalType),
                date:            t.date,
                isPaid:          true,
                bankSource:      bankKey,
            }));

        return {
            transactions: valid,
            bankKey,
            bankName: this.banks[bankKey]?.name || 'Banco Desconhecido',
            count: valid.length,
        };
    },

    // ── Parser genérico (coluna Data + Descrição + Valor) ────────────────────
    parseGeneric(rows, header) {
        const lower = header.map(h => h.toLowerCase());
        const iDate = lower.findIndex(h => h.includes('data') || h.includes('date') || h.includes('dt'));
        const iDesc = lower.findIndex(h => h.includes('desc') || h.includes('hist') || h.includes('memo') || h.includes('título') || h.includes('title'));
        const iVal  = lower.findIndex(h => h.includes('valor') || h.includes('value') || h.includes('amount') || h.includes('montante'));

        if (iDate < 0 || iVal < 0) return [];

        return rows.map(r => {
            const raw = (r[iVal] || '').replace(/[^\d,.-]/g, '').replace(',', '.');
            const value = parseFloat(raw) || 0;
            return {
                date:        this.parseDate(r[iDate]),
                description: iDesc >= 0 ? r[iDesc] : 'Transação',
                value:       Math.abs(value),
                fundamentalType: value >= 0 ? 'receita' : 'despesa',
            };
        });
    },

    // ── Ler arquivo ──────────────────────────────────────────────────────────
    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const result = this.parse(e.target.result);
                    resolve(result);
                } catch (err) {
                    reject(new Error('CSV inválido: ' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
            reader.readAsText(file, 'UTF-8');
        });
    },
};
