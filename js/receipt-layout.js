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

    RS._groupWordsIntoLines = function (words, imgW) {
        if (!words.length) return [];
        const sorted = [...words].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0);
        const mid = imgW > 0 ? imgW * 0.42 : 9999;
        const lines = [];
        const yTol = Math.max(12, imgW * 0.018);

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
        });
        return lines;
    };

    RS._moneyFromStr = function (s) {
        if (!s) return null;
        const m = String(s).match(/R\s*\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i) || String(s).match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
        if (!m) return null;
        const v = RS._parseMoney(m[1]);
        return !isNaN(v) && v > 0 ? v : null;
    };

    RS._lineLabel = function (line) {
        return RS._normKey(line.leftText || line.text.split(/\s{2,}/)[0] || '');
    };

    RS._lineValue = function (line) {
        if (line.rightText) return line.rightText.trim();
        const parts = line.text.split(/\s{2,}|\t/);
        return parts.length > 1 ? parts.slice(1).join(' ').trim() : '';
    };

    RS._detectBankTemplate = function (lines, text) {
        const t = RS._normKey(text);
        const compact = text.replace(/\s/g, '');
        if (/nu pagamentos|nubank|\bnu\b/.test(t) || /E18236120/i.test(compact)) return 'nubank_pix';
        if (/comprovante/.test(t) && /transfer/.test(t) && (/destino/.test(t) || /origem/.test(t))) return 'nubank_pix';
        if (/destino/.test(t) && /origem/.test(t) && /pix/.test(t)) return 'nubank_pix';
        return null;
    };

    RS._templateNubankPix = function (lines, text) {
        const out = {
            docType: 'pix',
            paymentMethod: 'Pix',
            template: 'nubank_pix',
            confidence: { docType: 0.95, template: 0.9 },
        };
        let section = null;

        lines.forEach((line, idx) => {
            const label = RS._lineLabel(line);
            const val = RS._lineValue(line);
            const full = RS._normKey(line.text);

            if (/^destino/.test(label) || full === 'destino') { section = 'destino'; return; }
            if (/^origem/.test(label) || full === 'origem') { section = 'origem'; return; }

            if (/^valor/.test(label) || full.startsWith('valor')) {
                const v = RS._moneyFromStr(val || line.text);
                if (v) { out.value = v; out.confidence.value = 0.92; }
            }
            if (/tipo/.test(label) && /transfer/.test(label) && /pix/i.test(val)) {
                out.confidence.docType = 0.98;
            }
            if (/id/.test(label) && /transa/.test(label)) {
                const chunk = (val + ' ' + (lines[idx + 1]?.rightText || lines[idx + 1]?.text || '')).replace(/\s/g, '');
                const m = chunk.match(/E[0-9A-Za-z]{28,35}/i);
                if (m) {
                    out.transactionId = m[0].toUpperCase().slice(0, 32);
                    out.confidence.transactionId = 0.94;
                }
            }
            if (section === 'destino' && /^nome/.test(label)) {
                const name = val || lines[idx + 1]?.rightText || lines[idx + 1]?.text || '';
                if (RS._looksLikePersonName(name)) {
                    out.beneficiary = name.trim().slice(0, 120);
                    out.description = out.beneficiary;
                    out.confidence.beneficiary = 0.9;
                    out.confidence.merchant = 0.9;
                }
            }
            if (section === 'origem' && /^nome/.test(label)) {
                const name = val || lines[idx + 1]?.rightText || lines[idx + 1]?.text || '';
                if (RS._looksLikePersonName(name)) {
                    out.payer = name.trim().slice(0, 120);
                    out.confidence.payer = 0.88;
                }
            }
            if (/^r\$/.test(val) && !out.value) {
                const v = RS._moneyFromStr(val);
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
        if (!out.beneficiary) out.beneficiary = RS._extractPixBeneficiary(text);
        if (!out.payer) out.payer = RS._extractPixPayer(text);
        if (!out.value) out.value = RS._extractPixValue(text);

        if (out.beneficiary) {
            out.description = out.beneficiary;
            out.merchant = out.beneficiary;
        }
        if (out.payer) {
            out.notes = [out.transactionId ? `ID Pix: ${out.transactionId}` : '', `Pagador: ${out.payer}`, 'Nubank'].filter(Boolean).join(' · ');
        }
        out.category = 'Outros';
        return out;
    };

    RS._parseFromLayout = function (words, imgW, text) {
        if (!words?.length) return null;
        const lines = RS._groupWordsIntoLines(words, imgW);
        const bank = RS._detectBankTemplate(lines, text);
        if (bank === 'nubank_pix') {
            const r = RS._templateNubankPix(lines, text);
            if (r.value || r.beneficiary || r.transactionId) return r;
        }

        const generic = { docType: 'outro', confidence: { layout: 0.5 }, template: 'generic_layout' };
        lines.forEach(line => {
            const label = RS._lineLabel(line);
            const val = RS._lineValue(line);
            if (/^valor/.test(label)) {
                const v = RS._moneyFromStr(val || line.text);
                if (v) { generic.value = v; generic.confidence.value = 0.8; }
            }
            if (/^nome/.test(label) && !generic.beneficiary && RS._looksLikePersonName(val)) {
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
            const lc = layout[key];
            const tc = textParsed[key];
            const lConf = layout.confidence?.[key] ?? 0;
            const tConf = textParsed.confidence?.[key] ?? 0;
            if (lc != null && lc !== '' && lConf >= tConf) return lc;
            return tc != null && tc !== '' ? tc : lc;
        };

        const merged = {
            ...base,
            ...layout,
            docType: layout.docType || textParsed.docType,
            value: pick('value'),
            beneficiary: pick('beneficiary'),
            payer: pick('payer'),
            transactionId: pick('transactionId'),
            date: pick('date') || textParsed.date,
            time: pick('time') || textParsed.time,
            description: pick('description') || pick('beneficiary') || textParsed.description,
            merchant: pick('merchant') || pick('beneficiary') || textParsed.merchant,
            paymentMethod: layout.paymentMethod || textParsed.paymentMethod,
            notes: layout.notes || textParsed.notes,
            template: layout.template,
            confidence: conf,
        };

        if (merged.docType === 'pix' || merged.template === 'nubank_pix') {
            merged.docType = 'pix';
            merged.paymentMethod = 'Pix';
        }
        if (merged.beneficiary && RS._looksLikePersonName(merged.beneficiary)) {
            merged.description = merged.beneficiary;
        }
        return merged;
    };

    RS.parseWithLayout = function (ocr) {
        const text = ocr.text || '';
        const layout = RS._parseFromLayout(ocr.words, ocr.width, text);
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
