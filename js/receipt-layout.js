/**
 * ReceiptLayout — OCR com posição + templates por banco
 * Complementa ReceiptScanner com leitura label→valor (layout Nubank Pix etc.)
 */
(function () {
    if (typeof ReceiptScanner === 'undefined') return;

    const RS = ReceiptScanner;

    RS._normKey = function (s) {
        return String(s || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    };

    RS._labelMatch = function (label, patterns) {
        const l = RS._normKey(label);
        return patterns.some(p => {
            if (typeof p === 'string') return l.includes(p) || l.startsWith(p);
            return p.test(l);
        });
    };

    RS._flattenWords = function (data) {
        const words = [];
        const push = (w) => {
            if (!w?.text?.trim()) return;
            const b = w.bbox || w;
            words.push({
                text: w.text.trim(),
                x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1,
                conf: w.confidence ?? 0.5,
            });
        };
        (data.words || []).forEach(push);
        if (!words.length && data.lines) {
            data.lines.forEach(ln => (ln.words || []).forEach(push));
        }
        if (!words.length && data.blocks) {
            data.blocks.forEach(bl => (bl.paragraphs || []).forEach(p =>
                (p.lines || []).forEach(ln => (ln.words || []).forEach(push))));
        }
        return words;
    };

    RS._estimateMidX = function (words, imgW) {
        if (!words.length) return imgW * 0.38;
        const xs = words.map(w => (w.x0 + w.x1) / 2).sort((a, b) => a - b);
        const gaps = [];
        for (let i = 1; i < xs.length; i++) {
            const g = xs[i] - xs[i - 1];
            if (g > imgW * 0.06 && g < imgW * 0.45) gaps.push({ g, x: (xs[i] + xs[i - 1]) / 2 });
        }
        if (gaps.length) {
            gaps.sort((a, b) => b.g - a.g);
            return gaps[0].x;
        }
        return imgW * 0.38;
    };

    RS._groupWordsIntoLines = function (words, imgW) {
        if (!words.length) return [];
        const mid = RS._estimateMidX(words, imgW);
        const sorted = [...words].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0);
        const lines = [];
        const yTol = Math.max(14, imgW * 0.016);

        sorted.forEach(w => {
            const cy = (w.y0 + w.y1) / 2;
            let line = lines.find(l => Math.abs(l.y - cy) <= yTol);
            if (!line) {
                line = { y: cy, words: [] };
                lines.push(line);
            }
            line.words.push(w);
        });

        lines.sort((a, b) => a.y - b.y);
        lines.forEach(line => {
            line.words.sort((a, b) => a.x0 - b.x0);
            line.text = line.words.map(w => w.text).join(' ');
            line.leftWords = line.words.filter(w => (w.x0 + w.x1) / 2 < mid);
            line.rightWords = line.words.filter(w => (w.x0 + w.x1) / 2 >= mid);
            line.leftText = line.leftWords.map(w => w.text).join(' ').trim();
            line.rightText = line.rightWords.map(w => w.text).join(' ').trim();
            line.height = Math.max(...line.words.map(w => w.y1 - w.y0), 0);
        });
        return lines;
    };

    RS._moneyFromStr = function (s, ctx) {
        if (!s) return null;
        const str = String(s);
        const ctxStr = ctx || str;
        if (/cnpj|cpf|\d{2}[.\s]\d{3}[.\s]\d{3}/i.test(ctxStr) && !/R\s*\$/i.test(str)) return null;
        const m = str.match(/R\s*\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i) || str.match(/^(\d{1,3}(?:\.\d{3})*,\d{2})$/);
        if (!m) return null;
        const v = RS._parseMoney(m[1]);
        return !isNaN(v) && v >= 1 ? v : null;
    };

    RS._lineLabel = function (line) {
        return RS._normKey(line.leftText || line.text.split(/\s{2,}/)[0] || '');
    };

    RS._lineValue = function (line) {
        if (line.rightText) return line.rightText.trim();
        const parts = line.text.split(/\s{2,}|\t/);
        return parts.length > 1 ? parts.slice(1).join(' ').trim() : '';
    };

    RS._findProminentValue = function (lines, imgH) {
        const topLimit = imgH > 0 ? imgH * 0.42 : 99999;
        let best = null;
        lines.forEach(line => {
            if (line.y > topLimit) return;
            const v = RS._moneyFromStr(line.text, line.text)
                || RS._moneyFromStr(line.rightText, line.text)
                || RS._moneyFromStr(line.leftText, line.text);
            if (!v) return;
            const score = v + (line.height || 0) * 2 + (line.text.length < 20 ? 50 : 0);
            if (!best || score > best.score) best = { v, score };
        });
        return best?.v ?? null;
    };

    RS._detectBankTemplate = function (lines, text) {
        const t = RS._normKey(text);
        const compact = text.replace(/\s/g, '');
        if (/nu pagamentos|nubank|\bnu\b/.test(t) || /E18236120/i.test(compact)) return 'nubank_pix';
        if (/comprovante/.test(t) && /transfer/.test(t) && (/destino/.test(t) || /origem/.test(t))) return 'nubank_pix';
        if (/destino/.test(t) && /origem/.test(t) && /pix/.test(t)) return 'nubank_pix';
        if (lines.some(l => RS._labelMatch(l.leftText, ['destino', 'origem', 'valor'])) && /transfer/.test(t)) return 'nubank_pix';
        return null;
    };

    RS._templateNubankPix = function (lines, text, imgH) {
        const out = {
            docType: 'pix',
            paymentMethod: 'Pix',
            template: 'nubank_pix',
            confidence: { docType: 0.95, template: 0.9 },
        };
        let section = null;

        const prominent = RS._findProminentValue(lines, imgH);
        if (prominent) {
            out.value = prominent;
            out.confidence.value = 0.93;
        }

        lines.forEach((line, idx) => {
            const label = RS._lineLabel(line);
            const val = RS._lineValue(line);
            const full = RS._normKey(line.text);

            if (RS._labelMatch(label, ['destino']) || full === 'destino') { section = 'destino'; return; }
            if (RS._labelMatch(label, ['origem']) || full === 'origem') { section = 'origem'; return; }

            if (RS._labelMatch(label, ['valor']) || full.startsWith('valor')) {
                const v = RS._moneyFromStr(val || line.text, line.text);
                if (v) { out.value = v; out.confidence.value = 0.92; }
            }
            if (RS._labelMatch(label, ['tipo']) && RS._labelMatch(label, ['transfer'])) {
                if (/pix/i.test(val || line.text)) out.confidence.docType = 0.98;
            }
            if (RS._labelMatch(label, ['id']) && RS._labelMatch(label, ['transa'])) {
                const chunk = (val + ' ' + (lines[idx + 1]?.rightText || lines[idx + 1]?.text || '')).replace(/\s/g, '');
                const m = chunk.match(/E[0-9A-Za-z]{28,35}/i);
                if (m) {
                    out.transactionId = m[0].toUpperCase().slice(0, 32);
                    out.confidence.transactionId = 0.94;
                }
            }
            if (section === 'destino' && RS._labelMatch(label, ['nome'])) {
                const name = val || lines[idx + 1]?.rightText || lines[idx + 1]?.text || '';
                if (RS._looksLikePersonName(name)) {
                    out.beneficiary = name.trim().slice(0, 120);
                    out.description = out.beneficiary;
                    out.confidence.beneficiary = 0.9;
                    out.confidence.merchant = 0.9;
                }
            }
            if (section === 'origem' && RS._labelMatch(label, ['nome'])) {
                const name = val || lines[idx + 1]?.rightText || lines[idx + 1]?.text || '';
                if (RS._looksLikePersonName(name)) {
                    out.payer = name.trim().slice(0, 120);
                    out.confidence.payer = 0.88;
                }
            }
            if (/^r\$/.test(RS._normKey(val)) && !out.value) {
                const v = RS._moneyFromStr(val, line.text);
                if (v) { out.value = v; out.confidence.value = 0.85; }
            }
        });

        const dateM = text.match(/(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})/i);
        if (dateM) {
            out.date = RS._extractDate(text);
            out.time = RS._extractTime(text);
            out.confidence.date = 0.9;
        }

        if (!out.transactionId) out.transactionId = RS._extractPixTransactionId(text);
        if (!out.beneficiary) {
            const b = RS._extractPixBeneficiary(text);
            if (RS._looksLikePersonName(b)) out.beneficiary = b;
        }
        if (!out.payer) {
            const p = RS._extractPixPayer(text);
            if (RS._looksLikePersonName(p)) out.payer = p;
        }
        if (!out.value) out.value = RS._extractPixValue(text);

        if (out.beneficiary && RS._looksLikePersonName(out.beneficiary)) {
            out.description = out.beneficiary;
            out.merchant = out.beneficiary;
        } else {
            out.beneficiary = '';
            out.description = '';
            out.merchant = '';
            out.confidence.beneficiary = 0;
            out.confidence.merchant = 0;
        }
        if (out.payer && !RS._looksLikePersonName(out.payer)) {
            out.payer = '';
            out.confidence.payer = 0;
        }
        if (out.payer) {
            out.notes = [out.transactionId ? `ID Pix: ${out.transactionId}` : '', `Pagador: ${out.payer}`, 'Nubank'].filter(Boolean).join(' · ');
        }
        out.category = 'Outros';
        return out;
    };

    RS._parseFromLayout = function (words, imgW, text, imgH) {
        if (!words?.length) return null;
        const lines = RS._groupWordsIntoLines(words, imgW);
        const bank = RS._detectBankTemplate(lines, text);
        if (bank === 'nubank_pix') {
            const r = RS._templateNubankPix(lines, text, imgH);
            if (r.value || r.beneficiary || r.transactionId) return r;
        }

        const generic = { docType: 'outro', confidence: { layout: 0.5 }, template: 'generic_layout' };
        lines.forEach(line => {
            const label = RS._lineLabel(line);
            const val = RS._lineValue(line);
            if (RS._labelMatch(label, ['valor'])) {
                const v = RS._moneyFromStr(val || line.text, line.text);
                if (v) { generic.value = v; generic.confidence.value = 0.8; }
            }
            if (RS._labelMatch(label, ['nome']) && !generic.beneficiary && RS._looksLikePersonName(val)) {
                generic.beneficiary = val.slice(0, 120);
                generic.description = generic.beneficiary;
            }
        });
        if (generic.value || generic.beneficiary) return generic;
        return null;
    };

    RS._mergeParseResults = function (layout, textParsed, rawText) {
        const base = { ...textParsed, rawText, fromScan: true, fundamentalType: 'despesa' };
        if (!layout) return base;

        const conf = { ...(textParsed.confidence || {}), ...(layout.confidence || {}) };
        const pick = (key) => {
            const lc = RS._sanitizeScanField(key, layout[key]);
            const tc = RS._sanitizeScanField(key, textParsed[key]);
            const lConf = layout.confidence?.[key] ?? 0;
            const tConf = textParsed.confidence?.[key] ?? 0;
            if (lc != null && lc !== '' && lConf >= tConf) return lc;
            return tc != null && tc !== '' ? tc : lc;
        };

        const merged = {
            ...base,
            docType: layout.docType || textParsed.docType,
            value: pick('value'),
            beneficiary: pick('beneficiary'),
            payer: pick('payer'),
            transactionId: pick('transactionId'),
            date: pick('date') || (textParsed.date !== new Date().toISOString().slice(0, 10) ? textParsed.date : ''),
            time: pick('time') || textParsed.time,
            description: pick('description') || pick('beneficiary') || RS._sanitizeScanField('description', textParsed.description),
            merchant: pick('merchant') || pick('beneficiary') || RS._sanitizeScanField('merchant', textParsed.merchant),
            paymentMethod: layout.paymentMethod || textParsed.paymentMethod,
            notes: layout.notes || textParsed.notes,
            template: layout.template,
            confidence: conf,
        };

        if (merged.docType === 'pix' || merged.template === 'nubank_pix') {
            merged.docType = 'pix';
            merged.paymentMethod = 'Pix';
        }
        ['beneficiary', 'payer', 'description', 'merchant'].forEach(k => {
            merged[k] = RS._sanitizeScanField(k, merged[k]) || '';
        });
        if (merged.beneficiary && RS._looksLikePersonName(merged.beneficiary)) {
            merged.description = merged.beneficiary;
        }
        if (!merged.date) merged.confidence = { ...merged.confidence, date: 0 };
        return merged;
    };

    RS.parseWithLayout = function (ocr) {
        const text = ocr.text || '';
        const layout = RS._parseFromLayout(ocr.words, ocr.width, text, ocr.height);
        const textParsed = RS.parse(text);
        return RS._mergeParseResults(layout, textParsed, text);
    };

    RS._recognizeDetailed = async function (image, onProgress, psm = '4') {
        const img = RS._asFile(image);
        const worker = await Tesseract.createWorker('por', 1, {
            ...RS.TESSERACT_OPTS,
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
            const words = RS._flattenWords(data);
            return {
                text: data.text || '',
                words,
                width: data.imageWidth || data.width || 0,
                height: data.imageHeight || data.height || 0,
            };
        } catch (e) {
            await worker.terminate().catch(() => {});
            throw e;
        }
    };
})();
