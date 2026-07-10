/**
 * Finanças+ — Finance Suite
 * Calendário, recorrentes, sync nuvem, import, assinaturas, simulador, tema, onboarding
 */
const FinanceSuite = {
  K_REC: 'app_recurring_v1',
  K_THEME: 'app_theme_v1',
  K_ONBOARD: 'app_onboard_v1',
  _syncTimer: null,

  initState(S) {
    S.recurring = this.loadRecurring();
    S.theme = localStorage.getItem(this.K_THEME) || 'light';
    S.calendarMonth = S.calendarMonth ?? 0;
    this.applyTheme(S.theme);
    return S;
  },

  loadRecurring() {
    try { return JSON.parse(localStorage.getItem(this.K_REC)) || []; } catch (e) { return []; }
  },
  _writeRecurring(list) {
    localStorage.setItem(this.K_REC, JSON.stringify(list));
  },

  applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
  },
  toggleTheme(S) {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(this.K_THEME, S.theme);
    this.applyTheme(S.theme);
  },

  isProd() { return window.location.hostname.includes('financasmais.com'); },
  authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem('auth_token');
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  },

  async cloudLoad(S) {
    if (!this.isProd() || !localStorage.getItem('auth_token')) return false;
    try {
      const r = await fetch('/api/sync.php', { cache: 'no-store', headers: this.authHeaders() });
      if (r.status === 401) return false;
      if (!r.ok) return false;
      const data = await r.json();
      if (!data || !Array.isArray(data.accounts)) return false;
      S.accounts = data.accounts || [];
      S.cards = data.creditCards || [];
      S.txs = data.transactions || [];
      S.budgets = data.budgets || [];
      if (data.categories?.length) S.cats = data.categories;
      if (typeof persist === 'function') {
        save('app_accounts_v3', S.accounts);
        save('app_creditCards_v3', S.cards);
        save('app_transactions_v3', S.txs);
        save('app_budgets_v3', S.budgets);
        save('app_categories_v3', S.cats);
      }
      return true;
    } catch (e) { return false; }
  },

  cloudPush(S) {
    if (!this.isProd() || !localStorage.getItem('auth_token')) return;
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(async () => {
      try {
        await fetch('/api/sync.php', {
          method: 'POST',
          headers: this.authHeaders(),
          body: JSON.stringify({
            accounts: S.accounts,
            creditCards: S.cards,
            transactions: S.txs,
            categories: S.cats,
            budgets: S.budgets,
          }),
        });
      } catch (e) { /* offline */ }
    }, 1500);
  },

  onPersist(S) {
    this._writeRecurring(S.recurring || []);
    this.cloudPush(S);
  },

  /* ── Recorrentes ── */
  processRecurring(S) {
    const today = startDay(new Date());
    const ym = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    let added = 0;
    (S.recurring || []).filter(r => r.active !== false).forEach(r => {
      const day = Math.min(r.day || 1, 28);
      const d = new Date(today.getFullYear(), today.getMonth(), day);
      const dk = iso(d);
      const exists = S.txs.some(t => t.recurringId === r.id && String(t.date).slice(0, 7) === ym);
      if (exists) return;
      const isPast = d <= today;
      S.txs.push({
        id: uid(),
        description: r.description,
        value: r.value,
        date: dk,
        fundamentalType: r.type || 'despesa',
        category: r.category || 'Outros',
        accountId: r.accountId || null,
        isCreditCard: !!r.isCreditCard,
        isPaid: r.autoPaid !== false && isPast,
        paidByAccountId: r.autoPaid !== false && !r.isCreditCard ? r.accountId : null,
        paidByIsCreditCard: false,
        installments: null,
        groupId: null,
        isRecurring: true,
        recurringId: r.id,
      });
      added++;
    });
    if (added && typeof persist === 'function') persist();
    return added;
  },

  detectSubscriptions(S) {
    const byDesc = {};
    S.txs.filter(t => t.fundamentalType === 'despesa').forEach(t => {
      const key = String(t.description || '').toLowerCase().trim().slice(0, 35);
      if (key.length < 4) return;
      if (!byDesc[key]) byDesc[key] = { desc: t.description, total: 0, count: 0, avg: 0, cat: t.category, last: t.date };
      byDesc[key].total += t.value;
      byDesc[key].count++;
      if (t.date > byDesc[key].last) byDesc[key].last = t.date;
    });
    return Object.values(byDesc)
      .filter(x => x.count >= 2)
      .map(x => ({ ...x, avg: x.total / x.count, monthly: x.total / Math.max(1, x.count) }))
      .sort((a, b) => b.total - a.total);
  },

  dailySpendAllowance(S) {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = Math.max(1, daysInMonth - now.getDate() + 1);
    const monthExp = S.txs.filter(t => {
      const d = parseD(t.date);
      return t.fundamentalType === 'despesa' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((s, t) => s + t.value, 0);
    const totalBudget = S.budgets.reduce((s, b) => s + (b.amount || 0), 0);
    const spentBudget = S.budgets.reduce((s, b) => s + spentInCategory(b.category), 0);
    const left = totalBudget > 0 ? Math.max(0, totalBudget - spentBudget) : null;
    const daily = left != null ? left / daysLeft : null;
    return { daysLeft, monthExp, totalBudget, spentBudget, left, daily };
  },

  emergencyTarget(S) {
    const avgExp = [1, 2, 3].reduce((s, i) => s + (monthAgg(i).expense || 0), 0) / 3;
    const target = Math.ceil((avgExp * 6) / 100) * 100;
    const existing = S.goals.find(g => (g.type || g.name || '').toLowerCase().includes('emerg'));
    return { target, avgExp, existing };
  },

  netWorthHistory(S, months = 12) {
    const out = [];
    let nw = netWorth();
    out.unshift({ label: 'Hoje', nw, m: 0 });
    for (let i = 1; i < months; i++) {
      const a = monthAgg(i);
      nw -= (a.income - a.expense);
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      out.unshift({ label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), nw, m: i });
    }
    return out;
  },

  rule503020(S) {
    const cur = monthAgg(0);
    const inc = cur.income || 0;
    if (!inc) return null;
    return {
      needs: inc * 0.5,
      wants: inc * 0.3,
      save: inc * 0.2,
      actualSave: cur.income - cur.expense,
    };
  },

  weeklyReport(S) {
    const today = startDay(new Date());
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const txs = S.txs.filter(t => {
      const d = parseD(t.date);
      return d >= weekAgo && d <= today;
    });
    const inc = txs.filter(t => t.fundamentalType === 'receita').reduce((s, t) => s + t.value, 0);
    const exp = txs.filter(t => t.fundamentalType === 'despesa').reduce((s, t) => s + t.value, 0);
    return { inc, exp, bal: inc - exp, count: txs.length, txs: txs.slice(0, 10) };
  },

  calendarEvents(S, monthOffset = 0) {
    const now = new Date();
    const ref = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const m = ref.getMonth(), y = ref.getFullYear();
    const events = {};
    const add = (date, ev) => {
      const k = iso(parseD(date));
      (events[k] = events[k] || []).push(ev);
    };
    S.txs.forEach(t => {
      const d = parseD(t.date);
      if (d.getMonth() !== m || d.getFullYear() !== y) return;
      add(t.date, { type: t.fundamentalType, title: t.description || t.category, val: t.value, txId: t.id, paid: t.isPaid });
    });
    S.cards.forEach(c => {
      if (!c.dueDay) return;
      const due = new Date(y, m, c.dueDay);
      if (due.getMonth() === m) {
        const used = Math.max(0, (c.limit || 0) - (c.availableLimit || 0));
        if (used > 0) add(due, { type: 'fatura', title: 'Fatura ' + c.name, val: used, cardId: c.id });
      }
    });
    (S.recurring || []).filter(r => r.active !== false).forEach(r => {
      const day = Math.min(r.day || 1, 28);
      const due = new Date(y, m, day);
      add(due, { type: r.type || 'despesa', title: '↻ ' + r.description, val: r.value, recurring: true });
    });
    S.goals.filter(g => g.deadline).forEach(g => {
      const d = parseD(g.deadline);
      if (d.getMonth() === m && d.getFullYear() === y) {
        add(g.deadline, { type: 'meta', title: 'Meta: ' + g.name, val: g.target - (g.saved || 0) });
      }
    });
    return { ref, events, daysInMonth: new Date(y, m + 1, 0).getDate(), firstDow: new Date(y, m, 1).getDay() };
  },

  /* ── Views ── */
  viewCalendar(S) {
    const hv = v => S.hide ? '•••••' : BRL(v);
    const off = S.calendarMonth || 0;
    const { ref, events, daysInMonth, firstDow } = this.calendarEvents(S, off);
    const monthLabel = ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    let cells = '';
    for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell empty"></div>';
    const todayK = iso(new Date());
    for (let d = 1; d <= daysInMonth; d++) {
      const dk = iso(new Date(ref.getFullYear(), ref.getMonth(), d));
      const evs = events[dk] || [];
      const inc = evs.filter(e => e.type === 'receita').reduce((s, e) => s + e.val, 0);
      const exp = evs.filter(e => e.type === 'despesa' || e.type === 'fatura').reduce((s, e) => s + e.val, 0);
      cells += `<div class="cal-cell ${dk === todayK ? 'today' : ''}" onclick="${evs.length ? `FinanceSuite.showDayDetail('${dk}')` : ''}">
        <div class="cal-day">${d}</div>
        ${evs.length ? `<div class="cal-dots">${evs.slice(0, 3).map(e => `<i class="${e.type}"></i>`).join('')}</div>` : ''}
        ${exp ? `<div class="cal-mini neg">${S.hide ? '••' : kk(-exp)}</div>` : ''}
        ${inc ? `<div class="cal-mini pos">${S.hide ? '••' : kk(inc)}</div>` : ''}
      </div>`;
    }
    this._calEvents = events;
    return `<div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap">
      <div><div class="page-title">Calendário</div><div class="page-sub">Vencimentos, metas e fluxo do mês</div></div></div>
      <div class="month-nav"><button class="chip-link" onclick="FinanceSuite.calPrev()">‹ Anterior</button>
        <div class="sec-t" style="text-transform:capitalize;flex:1;text-align:center">${monthLabel}</div>
        <button class="chip-link" onclick="FinanceSuite.calNext()" style="opacity:${off > 0 ? 1 : .35}">Próximo ›</button></div>
      <div class="cal-grid">${cells}</div>
      <div class="sec" style="margin-top:1rem"><div class="sec-h"><div class="sec-t">Legenda</div></div>
        <div class="trend-legend"><span><i class="inc"></i> Entradas</span><span><i class="exp"></i> Saídas</span><span>◎ Fatura</span><span>↻ Recorrente</span></div></div>`;
  },

  showDayDetail(dk) {
    const evs = (this._calEvents || {})[dk] || [];
    if (!evs.length) return;
    const label = parseD(dk).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    openSheet(`<div class="sheet-head"><h3>${label}</h3></div>
      ${evs.map(e => `<div class="fat-tx"><span>${esc(e.title)}</span><span class="num" style="color:${e.type === 'receita' ? 'var(--pos)' : 'var(--neg)'}">${BRL(e.val)}</span></div>`).join('')}
      ${evs.some(e => e.txId) ? `<button class="chip-link" style="margin-top:1rem;width:100%" onclick="closeSheet();go('tx')">Ver transações</button>` : ''}`);
  },

  calPrev() { S.calendarMonth = (S.calendarMonth || 0) + 1; render(); },
  calNext() { if ((S.calendarMonth || 0) > 0) { S.calendarMonth--; render(); } },

  viewPlanning(S) {
    const hv = v => S.hide ? '•••••' : BRL(v);
    const subs = this.detectSubscriptions(S).slice(0, 8);
    const subsTotal = subs.reduce((s, x) => s + x.monthly, 0);
    const emerg = this.emergencyTarget(S);
    const r5020 = this.rule503020(S);
    const rec = S.recurring || [];
    let html = `<div class="page-header" style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap">
      <div><div class="page-title">Planejamento</div><div class="page-sub">Recorrentes, assinaturas e regras financeiras</div></div>
      <button class="chip-link" style="padding:.5rem 1rem;background:var(--brand);color:#fff;border-color:var(--brand)" onclick="FinanceSuite.openRecurringSheet()">+ Recorrente</button></div>`;

    if (r5020) {
      html += `<div class="sec"><div class="sec-h"><div class="sec-t">Regra 50 / 30 / 20</div><div class="sec-sub">Com base nas entradas do mês</div></div>
        <div class="rep-kpis" style="display:grid;grid-template-columns:repeat(3,1fr);gap:.625rem">
          <div class="rep-insight"><div class="k">Necessidades 50%</div><div class="v num">${hv(r5020.needs)}</div></div>
          <div class="rep-insight"><div class="k">Desejos 30%</div><div class="v num">${hv(r5020.wants)}</div></div>
          <div class="rep-insight"><div class="k">Poupar 20%</div><div class="v num ${r5020.actualSave >= r5020.save ? 'pos' : 'neg'}">${hv(r5020.actualSave)}</div></div></div></div>`;
    }

    html += `<div class="sec" style="margin-top:1rem"><div class="sec-h"><div class="sec-t">Reserva de emergência</div></div>
      <p style="font-size:.875rem;color:var(--txt2);margin-bottom:.75rem">Meta sugerida: <b class="num">${hv(emerg.target)}</b> (6× despesas médias de ${hv(emerg.avgExp)})</p>
      ${emerg.existing ? `<p style="font-size:.8125rem;color:var(--pos)">Meta "${esc(emerg.existing.name)}" em andamento.</p>` :
        `<button class="chip-link" onclick="FinanceSuite.createEmergencyGoal()">Criar meta de emergência</button>`}</div>`;

    html += `<div class="sec" style="margin-top:1rem"><div class="sec-h"><div class="sec-t">Lançamentos recorrentes</div><div class="sec-sub num">${rec.length}</div></div>`;
    if (!rec.length) html += '<p style="color:var(--txt3);font-size:.875rem">Salário, aluguel, assinaturas fixas…</p>';
    else rec.forEach(r => {
      html += `<div class="acc-row" style="margin-bottom:.5rem;padding:.75rem 1rem" onclick="FinanceSuite.openRecurringSheet('${r.id}')">
        <div class="acc-mid"><div class="acc-n">${esc(r.description)}</div><div class="acc-t">Dia ${r.day || 1} · ${r.type === 'receita' ? 'Receita' : 'Despesa'} · ${esc(r.category || 'Outros')}</div></div>
        <div class="acc-v num">${hv(r.value)}</div></div>`;
    });
    html += `<button class="add-btn" onclick="FinanceSuite.openRecurringSheet()">+ Adicionar recorrente</button></div>`;

    html += `<div class="sec" style="margin-top:1rem"><div class="sec-h"><div class="sec-t">Assinaturas detectadas</div><div class="sec-sub num">~${hv(subsTotal)}/mês</div></div>`;
    if (!subs.length) html += '<p style="color:var(--txt3);font-size:.875rem">Nenhum padrão repetido detectado ainda.</p>';
    else subs.forEach(s => {
      html += `<div class="fat-tx"><span>${esc(s.desc)} <span style="color:var(--txt3)">(${s.count}×)</span></span><span class="num">${hv(s.monthly)}/mês</span></div>`;
    });
    html += `<button class="chip-link" style="margin-top:.75rem" onclick="FinanceSuite.openSimulator()">Simulador "e se…"</button></div>`;
    return html;
  },

  openRecurringSheet(id) {
    const r = id ? (S.recurring || []).find(x => x.id === id) : null;
    this._editRecId = id || null;
    openSheet(`<div class="sheet-head"><h3>${r ? 'Editar recorrente' : 'Novo recorrente'}</h3>${r ? `<button class="del-btn" onclick="FinanceSuite.deleteRecurring('${r.id}')">Excluir</button>` : ''}</div>
      <div class="fld"><label>Descrição</label><input id="rc-desc" type="text" value="${r ? esc(r.description) : ''}" placeholder="Ex: Aluguel, Salário, Netflix"></div>
      <div class="fld row2"><div><label>Valor (R$)</label><input id="rc-val" type="number" step="0.01" value="${r ? r.value : ''}"></div>
        <div><label>Dia do mês</label><input id="rc-day" type="number" min="1" max="28" value="${r ? (r.day || 1) : 1}"></div></div>
      <div class="fld row2"><div><label>Tipo</label><select id="rc-type"><option value="despesa" ${!r || r.type === 'despesa' ? 'selected' : ''}>Despesa</option><option value="receita" ${r && r.type === 'receita' ? 'selected' : ''}>Receita</option></select></div>
        <div><label>Categoria</label><select id="rc-cat">${catOptions(r ? r.category : 'Outros')}</select></div></div>
      <div class="fld"><label>Conta</label><select id="rc-acc">${accOptions(r ? r.accountId : '')}</select></div>
      <label class="chk"><input type="checkbox" id="rc-paid" ${!r || r.autoPaid !== false ? 'checked' : ''}><span>Marcar como pago automaticamente</span></label>
      <button class="save" onclick="FinanceSuite.saveRecurring()">Salvar</button>`);
  },

  saveRecurring() {
    const desc = document.getElementById('rc-desc').value.trim();
    const val = parseFloat(document.getElementById('rc-val').value);
    const day = parseInt(document.getElementById('rc-day').value) || 1;
    if (!desc || !val) { toast('Preencha descrição e valor', 'err'); return; }
    const base = {
      description: desc, value: val, day, type: document.getElementById('rc-type').value,
      category: document.getElementById('rc-cat').value,
      accountId: document.getElementById('rc-acc').value || null,
      isCreditCard: S.cards.some(c => c.id === document.getElementById('rc-acc').value),
      autoPaid: document.getElementById('rc-paid').checked,
      active: true,
    };
    if (!S.recurring) S.recurring = [];
    if (this._editRecId) Object.assign(S.recurring.find(x => x.id === this._editRecId), base);
    else S.recurring.push({ id: uid(), ...base });
    this._writeRecurring(S.recurring);
    this.processRecurring(S);
    persist(); closeSheet(); toast('Recorrente salvo', 'ok'); render();
  },

  deleteRecurring(id) {
    if (!confirm('Excluir este recorrente?')) return;
    S.recurring = (S.recurring || []).filter(r => r.id !== id);
    this._writeRecurring(S.recurring);
    persist(); closeSheet(); render();
  },

  createEmergencyGoal() {
    const e = this.emergencyTarget(S);
    S.goals.push({ id: uid(), name: 'Reserva de emergência', target: e.target, saved: 0, deadline: null, type: 'emergency', description: '' });
    persist(); toast('Meta de emergência criada', 'ok'); render();
  },

  openSimulator() {
    openSheet(`<div class="sheet-head"><h3>Simulador</h3></div>
      <p style="font-size:.8125rem;color:var(--txt2);margin-bottom:1rem">Veja o impacto de um gasto extra no seu saldo projetado.</p>
      <div class="fld"><label>Gasto extra (R$)</label><input id="sim-exp" type="number" step="0.01" placeholder="500"></div>
      <div class="fld"><label>Entrada extra (R$)</label><input id="sim-inc" type="number" step="0.01" placeholder="0"></div>
      <div id="sim-result" class="insight ins-good" style="display:none;margin-bottom:1rem"></div>
      <button class="save" onclick="FinanceSuite.runSimulator()">Calcular</button>`);
  },

  runSimulator() {
    const exp = parseFloat(document.getElementById('sim-exp').value) || 0;
    const inc = parseFloat(document.getElementById('sim-inc').value) || 0;
    const p = project(S.cfDays || 30);
    const after = p.end - exp + inc;
    const el = document.getElementById('sim-result');
    el.style.display = 'flex';
    el.className = 'insight ' + (after < 0 ? 'ins-bad' : after < p.end * 0.5 ? 'ins-warn' : 'ins-good');
    el.innerHTML = `<div class="dot"></div><div><div class="it">Saldo projetado após simulação</div><div class="im num">${BRL(after)} (${after >= p.end ? '+' : ''}${BRL(after - p.end)} vs. cenário atual)</div></div>`;
  },

  viewImport(S) {
    return `<div class="page-header"><div class="page-title">Importar extrato</div><div class="page-sub">CSV ou OFX do seu banco</div></div>
      <div class="sec"><div class="sec-h"><div class="sec-t">Arquivo bancário</div></div>
        <p style="font-size:.875rem;color:var(--txt2);margin-bottom:1rem">Nubank, Inter, Itaú, Bradesco, BB, C6 e outros formatos OFX/CSV.</p>
        <div class="fld"><label>Conta de destino</label><select id="imp-acc">${accOptions('')}</select></div>
        <input type="file" id="imp-file" accept=".csv,.ofx,.qfx,text/csv,application/x-ofx" hidden>
        <button class="save" onclick="document.getElementById('imp-file').click()">Selecionar arquivo</button>
        <div id="imp-status" class="qi-hint" style="margin-top:1rem"></div></div>
      <div class="sec" style="margin-top:1rem"><div class="sec-h"><div class="sec-t">Open Finance</div></div>
        <p style="font-size:.8125rem;color:var(--txt2);margin-bottom:.75rem">Conexão automática com bancos em breve. Use importação manual ou o app clássico.</p>
        <button class="chip-link" onclick="location.href='classico.html'">Abrir versão completa</button></div>`;
  },

  bindImportPage() {
    const inp = document.getElementById('imp-file');
    if (!inp || inp._bound) return;
    inp._bound = 1;
    inp.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      const st = document.getElementById('imp-status');
      const accId = document.getElementById('imp-acc')?.value;
      st.textContent = 'Lendo arquivo…'; st.className = 'qi-hint busy';
      try {
        let txs = [];
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'csv') {
          if (typeof CSVImporter === 'undefined') throw new Error('Importador CSV não carregou');
          const res = await CSVImporter.readFile(file);
          txs = res.transactions.map(t => ({
            id: uid(), description: t.description, value: t.value, date: t.date,
            fundamentalType: t.fundamentalType || t.type, category: t.category || 'Outros',
            accountId: accId || null, isCreditCard: false, isPaid: true,
            paidByAccountId: accId || null, installments: null, groupId: null, isRecurring: false,
          }));
          st.textContent = `${txs.length} lançamentos (${res.bankName}) prontos.`;
        } else {
          if (typeof OFXImporter === 'undefined') throw new Error('Importador OFX não carregou');
          const res = await OFXImporter.readFile(file);
          txs = (res.transactions || []).map(t => ({
            id: uid(), description: t.description || t.memo || 'Importado',
            value: Math.abs(t.value || 0),
            date: t.date || iso(new Date()),
            fundamentalType: t.fundamentalType || 'despesa',
            category: t.category || 'Outros',
            accountId: accId || null, isCreditCard: false, isPaid: true,
            paidByAccountId: accId || null, installments: null, groupId: null, isRecurring: false,
          }));
          st.textContent = `${txs.length} lançamentos OFX (${res.bankId || 'banco'}).`;
        }
        if (!txs.length) { st.className = 'qi-hint err'; st.textContent = 'Nenhum lançamento encontrado.'; return; }
        if (!confirm(`Importar ${txs.length} lançamento(s)? Duplicatas podem ocorrer.`)) { inp.value = ''; return; }
        S.txs.push(...txs);
        persist(); recompute();
        st.className = 'qi-hint ok';
        st.textContent = `${txs.length} lançamentos adicionados com sucesso!`;
        toast(`${txs.length} importados`, 'ok');
        inp.value = '';
      } catch (err) {
        st.className = 'qi-hint err';
        st.textContent = err.message || 'Erro ao importar';
      }
    };
  },

  openChangePassword() {
    openSheet(`<div class="sheet-head"><h3>Alterar senha</h3></div>
      <div class="fld"><label>Senha atual</label><input id="cp-cur" type="password" autocomplete="current-password"></div>
      <div class="fld"><label>Nova senha</label><input id="cp-new" type="password" autocomplete="new-password" minlength="6"></div>
      <div class="fld"><label>Confirmar nova senha</label><input id="cp-new2" type="password" autocomplete="new-password"></div>
      <button class="save" onclick="FinanceSuite.savePassword()">Salvar senha</button>`);
  },

  async savePassword() {
    const cur = document.getElementById('cp-cur').value;
    const n1 = document.getElementById('cp-new').value;
    const n2 = document.getElementById('cp-new2').value;
    if (!cur || !n1) { toast('Preencha todos os campos', 'err'); return; }
    if (n1 !== n2) { toast('Senhas não coincidem', 'err'); return; }
    try {
      const r = await fetch('/api/auth.php', {
        method: 'POST',
        headers: FinanceSuite.authHeaders(),
        body: JSON.stringify({ action: 'change_password', current_password: cur, new_password: n1 }),
      });
      const d = await r.json();
      if (d.ok) { toast('Senha alterada', 'ok'); closeSheet(); }
      else toast(d.error || 'Erro', 'err');
    } catch (e) { toast('Erro de conexão', 'err'); }
  },

  showOnboarding() {
    if (localStorage.getItem(this.K_ONBOARD)) return;
    const el = document.createElement('div');
    el.id = 'onboard-bg';
    el.className = 'onboard-bg';
    el.innerHTML = `<div class="onboard-card">
      <h2>Bem-vindo ao Finanças+</h2>
      <p>Configure sua vida financeira em 3 passos:</p>
      <ol><li>Crie uma <b>conta bancária</b></li><li>Defina um <b>orçamento</b> por categoria</li><li>Registre seu primeiro <b>lançamento</b></li></ol>
      <button class="save" onclick="FinanceSuite.finishOnboarding()">Começar</button></div>`;
    document.body.appendChild(el);
  },

  finishOnboarding() {
    localStorage.setItem(this.K_ONBOARD, '1');
    document.getElementById('onboard-bg')?.remove();
    if (!S.accounts.length) go('accounts');
  },

  duplicateTx(id) {
    const t = S.txs.find(x => x.id === id);
    if (!t) return;
    S.txs.push({
      ...t, id: uid(), date: iso(new Date()),
      description: (t.description || '') + ' (cópia)',
      installments: null, groupId: null, recurringId: undefined,
    });
    persist(); toast('Lançamento duplicado', 'ok'); render();
  },

  txTemplates() {
    return [
      { label: 'Salário', type: 'receita', cat: 'Salário', desc: 'Salário' },
      { label: 'Aluguel', type: 'despesa', cat: 'Moradia', desc: 'Aluguel' },
      { label: 'Mercado', type: 'despesa', cat: 'Alimentação', desc: 'Supermercado' },
      { label: 'Pix', type: 'despesa', cat: 'Outros', desc: 'Pix' },
    ];
  },

  applyTemplate(tpl) {
    addType = tpl.type;
    openTxSheet();
    setTimeout(() => {
      const d = document.getElementById('in-desc'); if (d) d.value = tpl.desc;
      const c = document.getElementById('in-cat'); if (c) c.value = tpl.cat;
      syncTypeTog();
    }, 400);
  },

  async bootstrap(S) {
    this.initState(S);
    await this.cloudLoad(S);
    this.processRecurring(S);
    setTimeout(() => this.showOnboarding(), 600);
  },
};

window.FinanceSuite = FinanceSuite;
