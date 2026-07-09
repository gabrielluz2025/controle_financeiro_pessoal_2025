/**
 * TransactionFormFill — preenche o modal de nova transação (voz, foto, FAB)
 */
const TransactionFormFill = {

    esc(v) {
        if (v == null) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    _set(id, val) {
        const el = document.getElementById(id);
        if (!el || val == null || val === '') return;
        el.value = val;
    },

    _setSelect(id, val) {
        const sel = document.getElementById(id);
        if (!sel || !val) return;
        if ([...sel.options].some(o => o.value === val)) sel.value = val;
    },

    apply(data = {}, opts = {}) {
        if (!data || typeof data !== 'object') return;

        const desc = data.merchant || data.description;
        if (desc) this._set('trans-description', desc);

        if (data.value != null && data.value !== '' && !isNaN(Number(data.value))) {
            this._set('trans-value', Number(data.value).toFixed(2));
        }

        if (data.date) this._set('trans-date', data.date);
        this._setSelect('trans-type', data.fundamentalType);
        this._setSelect('trans-category', data.category);

        this._set('receipt-cnpj', data.cnpj);
        this._set('receipt-cpf', data.cpf);
        this._set('receipt-nf-number', data.nfNumber);
        this._set('receipt-series', data.series);
        this._set('receipt-access-key', data.accessKey);
        this._set('receipt-time', data.time);

        if (data.subtotal != null && data.subtotal !== '' && !isNaN(Number(data.subtotal))) {
            this._set('receipt-subtotal', Number(data.subtotal).toFixed(2));
        }
        if (data.discount != null && data.discount !== '' && !isNaN(Number(data.discount))) {
            this._set('receipt-discount', Number(data.discount).toFixed(2));
        }

        this._setSelect('receipt-payment-method', data.paymentMethod);
        this._set('receipt-address', data.address);
        this._set('receipt-items', data.items);

        const notes = data.rawText ? String(data.rawText).slice(0, 500) : (data.receipt?.notes || '');
        if (notes) this._set('receipt-notes', notes);

        const fromScan = opts.fromScan || data.fromScan;
        if (fromScan) {
            const scannedAt = document.getElementById('receipt-scanned-at');
            if (scannedAt && !scannedAt.value) scannedAt.value = new Date().toISOString();
            document.getElementById('receipt-fields-body')?.classList.remove('hidden');
            document.getElementById('receipt-fields-section')?.classList.add('receipt-expanded');
        }
    },
};
