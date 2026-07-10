/**
 * ReceiptStore — armazena fotos de comprovantes no IndexedDB (fora do localStorage/sync).
 * Retenção máxima: 1 ano. Após expirar, remove só a imagem — o lançamento permanece.
 */
const ReceiptStore = {
  DB_NAME: 'financas_receipts_v1',
  STORE: 'images',
  MAX_AGE_MS: 365 * 24 * 60 * 60 * 1000,
  WARN_DAYS: [30, 7, 1],
  MAX_DIM: 1400,
  JPEG_QUALITY: 0.82,
  _db: null,

  async open() {
    if (this._db) return this._db;
    if (!('indexedDB' in window)) throw new Error('IndexedDB indisponível neste navegador.');
    this._db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STORE)) {
          db.createObjectStore(this.STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Falha ao abrir armazenamento de comprovantes.'));
    });
    return this._db;
  },

  _tx() {
    return this.open().then(db => db.transaction(this.STORE, 'readonly').objectStore(this.STORE));
  },

  async get(id) {
    if (!id) return null;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(this.STORE, 'readonly').objectStore(this.STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async getObjectUrl(id) {
    const rec = await this.get(id);
    if (!rec?.blob) return null;
    const blob = rec.blob instanceof Blob ? rec.blob : new Blob([rec.blob], { type: rec.mime || 'image/jpeg' });
    return URL.createObjectURL(blob);
  },

  async compress(file) {
    const f = file instanceof Blob ? file : null;
    if (!f) throw new Error('Arquivo inválido.');
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, this.MAX_DIM / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise((res, rej) => {
      canvas.toBlob(b => (b ? res(b) : rej(new Error('Falha ao comprimir imagem.'))), 'image/jpeg', this.JPEG_QUALITY);
    });
    return blob;
  },

  async save(file, meta = {}) {
    const blob = await this.compress(file);
    const id = 'rec_' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random().toString(16).slice(2));
    const savedAt = Date.now();
    const db = await this.open();
    await new Promise((resolve, reject) => {
      const req = db.transaction(this.STORE, 'readwrite').objectStore(this.STORE).put({
        id,
        blob,
        mime: 'image/jpeg',
        savedAt,
        description: meta.description || '',
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    return { id, savedAt: new Date(savedAt).toISOString() };
  },

  async delete(id) {
    if (!id) return;
    const db = await this.open();
    await new Promise((resolve, reject) => {
      const req = db.transaction(this.STORE, 'readwrite').objectStore(this.STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async replace(oldId, file, meta = {}) {
    if (oldId) await this.delete(oldId).catch(() => {});
    return this.save(file, meta);
  },

  daysUntilExpiry(savedAtIso) {
    if (!savedAtIso) return null;
    const saved = new Date(savedAtIso).getTime();
    if (isNaN(saved)) return null;
    const expires = saved + this.MAX_AGE_MS;
    return Math.ceil((expires - Date.now()) / 86400000);
  },

  expiryLabel(savedAtIso) {
    const d = this.daysUntilExpiry(savedAtIso);
    if (d == null) return '';
    if (d <= 0) return 'Expirado';
    if (d === 1) return 'Expira amanhã';
    if (d <= 30) return `Expira em ${d} dias`;
    return `Guardado até ${new Date(new Date(savedAtIso).getTime() + this.MAX_AGE_MS).toLocaleDateString('pt-BR')}`;
  },

  _clearImageFromTxs(S, imageId) {
    let changed = false;
    (S.txs || []).forEach(t => {
      if (t.receipt?.imageId === imageId) {
        delete t.receipt.imageId;
        delete t.receipt.imageSavedAt;
        t.receipt.imageExpired = true;
        changed = true;
      }
    });
    return changed;
  },

  async purgeExpired(S) {
    const db = await this.open();
    const all = await new Promise((resolve, reject) => {
      const req = db.transaction(this.STORE, 'readonly').objectStore(this.STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    const now = Date.now();
    let count = 0;
    for (const rec of all) {
      if (now - rec.savedAt >= this.MAX_AGE_MS) {
        await this.delete(rec.id);
        if (this._clearImageFromTxs(S, rec.id)) count++;
        localStorage.removeItem('receipt_warn_' + rec.id);
      }
    }
    return { count };
  },

  _warnKey(imageId, daysLeft) {
    return 'receipt_warn_' + imageId + '_' + daysLeft;
  },

  getExpiryWarnings(S) {
    const out = [];
    const seen = new Set();
    (S.txs || []).forEach(t => {
      const id = t.receipt?.imageId;
      const savedAt = t.receipt?.imageSavedAt;
      if (!id || !savedAt || seen.has(id)) return;
      seen.add(id);
      const daysLeft = this.daysUntilExpiry(savedAt);
      if (daysLeft == null || daysLeft <= 0) return;
      const threshold = this.WARN_DAYS.find(d => daysLeft <= d);
      if (!threshold) return;
      const key = this._warnKey(id, threshold);
      if (localStorage.getItem(key)) return;
      out.push({
        imageId: id,
        desc: (t.description || 'Comprovante').slice(0, 40),
        daysLeft,
        threshold,
        warnKey: key,
      });
    });
    return out;
  },

  markWarningShown(warnKey) {
    localStorage.setItem(warnKey, '1');
  },

  async maintenance(S, toastFn) {
    try {
      const purged = await this.purgeExpired(S);
      if (purged.count > 0 && typeof toastFn === 'function') {
        toastFn(
          purged.count === 1
            ? 'Foto de 1 comprovante expirou e foi removida. O lançamento foi mantido.'
            : `Fotos de ${purged.count} comprovantes expiraram e foram removidas. Os lançamentos foram mantidos.`,
          'warn',
          5500
        );
      }
      const warnings = this.getExpiryWarnings(S);
      warnings.forEach((w, i) => {
        setTimeout(() => {
          if (typeof toastFn === 'function') {
            toastFn(
              w.daysLeft === 1
                ? `Comprovante "${w.desc}" será apagado amanhã. Abra o lançamento para salvar uma cópia se precisar.`
                : `Comprovante "${w.desc}" será apagado em ${w.daysLeft} dias (retenção máxima de 1 ano).`,
              'warn',
              6500
            );
          }
          this.markWarningShown(w.warnKey);
        }, 800 + i * 1200);
      });
      return purged.count;
    } catch (e) {
      console.warn('[ReceiptStore] maintenance', e);
      return 0;
    }
  },
};

window.ReceiptStore = ReceiptStore;
