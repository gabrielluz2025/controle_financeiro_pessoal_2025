/**
 * LiveCashFlow — Fluxo de Caixa Vivo (projeção diária com regras locais)
 *
 * Projeta o saldo das contas dia a dia até um horizonte (padrão 30 dias),
 * considerando receitas futuras, despesas não pagas e faturas de cartão,
 * e detecta o "dia de estouro" (quando o saldo fica negativo).
 *
 * Importante sobre o modelo de saldo do app:
 *  - account.balance já inclui TODAS as receitas (inclusive futuras) e
 *    subtrai apenas as despesas JÁ PAGAS.
 *  - Portanto, receitas com data futura são removidas do ponto de partida
 *    e readicionadas na data correta (evita contagem dupla).
 *  - Despesas não pagas NÃO estão no saldo e entram como saídas na data.
 */
const LiveCashFlow = {

    HORIZON_DAYS: 30,

    _startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; },
    _iso(d) {
        const x = this._startOfDay(d);
        const m = String(x.getMonth() + 1).padStart(2, '0');
        const day = String(x.getDate()).padStart(2, '0');
        return `${x.getFullYear()}-${m}-${day}`;
    },
    _parse(s) {
        if (!s) return this._startOfDay(new Date());
        return this._startOfDay(new Date(String(s).slice(0, 10) + 'T00:00:00'));
    },
    _daysBetween(a, b) { return Math.round((this._startOfDay(b) - this._startOfDay(a)) / 86400000); },

    project(days = this.HORIZON_DAYS) {
        const today = this._startOfDay(new Date());
        const horizon = new Date(today); horizon.setDate(horizon.getDate() + days);

        const accounts = AppState.accounts || [];
        const txs = AppState.transactions || [];
        const cards = AppState.creditCards || [];

        // Ponto de partida = saldo atual das contas
        let startBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0);

        // Remove receitas futuras já embutidas no saldo (serão readicionadas na data)
        const futureIncome = txs.filter(t =>
            t.fundamentalType === 'receita' && this._parse(t.date) > today);
        startBalance -= futureIncome.reduce((s, t) => s + (t.value || 0), 0);

        // Despesas vencidas e não pagas (não cartão) => obrigação imediata (hoje)
        const overdue = txs.filter(t =>
            t.fundamentalType === 'despesa' && !t.isCreditCard && !t.isPaid &&
            this._parse(t.date) < today);
        const overdueSum = overdue.reduce((s, t) => s + (t.value || 0), 0);

        const eventsByDay = {};
        const addEvent = (dateObj, ev) => {
            let d = this._startOfDay(dateObj);
            if (d < today) d = new Date(today);
            if (d > horizon) return;
            const k = this._iso(d);
            (eventsByDay[k] = eventsByDay[k] || []).push(ev);
        };

        // Receitas futuras entram como entrada na data
        futureIncome.forEach(t => addEvent(this._parse(t.date), {
            type: 'in', label: t.description || 'Receita', amount: +(t.value || 0)
        }));

        // Despesas futuras não pagas (não cartão) => saída na data
        txs.filter(t =>
            t.fundamentalType === 'despesa' && !t.isCreditCard && !t.isPaid &&
            this._parse(t.date) >= today
        ).forEach(t => addEvent(this._parse(t.date), {
            type: 'out', label: t.description || 'Despesa', amount: -(t.value || 0)
        }));

        // Despesas em atraso => lançadas como saída "hoje"
        if (overdueSum > 0) addEvent(new Date(today), {
            type: 'out', label: `${overdue.length} conta(s) em atraso`,
            amount: -overdueSum, overdue: true
        });

        // Faturas de cartão => próximo vencimento dentro do horizonte
        cards.forEach(card => {
            const used = Math.max(0, (card.limit || 0) - (card.availableLimit || 0));
            if (used <= 0 || !card.dueDay) return;
            let due = new Date(today.getFullYear(), today.getMonth(), card.dueDay);
            if (due < today) due = new Date(today.getFullYear(), today.getMonth() + 1, card.dueDay);
            if (due <= horizon) addEvent(due, {
                type: 'out', label: `Fatura ${card.name || 'cartão'}`,
                amount: -used, card: true
            });
        });

        // Série diária
        const points = [];
        let running = startBalance;
        let lowest = { date: new Date(today), balance: running };
        let breach = null;

        for (let i = 0; i <= days; i++) {
            const d = new Date(today); d.setDate(d.getDate() + i);
            const k = this._iso(d);
            const evs = eventsByDay[k] || [];
            const delta = evs.reduce((s, e) => s + e.amount, 0);
            running += delta;
            const rounded = Math.round(running * 100) / 100;
            points.push({ date: new Date(d), iso: k, balance: rounded, delta, events: evs });
            if (rounded < lowest.balance) lowest = { date: new Date(d), balance: rounded };
            if (!breach && rounded < 0) breach = { date: new Date(d), balance: rounded };
        }

        const allEvents = Object.values(eventsByDay).flat();
        const overdraft = accounts.reduce((s, a) => s + (a.overdraftLimit || 0), 0);

        return {
            today,
            horizonDays: days,
            hasData: accounts.length > 0,
            startBalance: Math.round(startBalance * 100) / 100,
            endBalance: points.length ? points[points.length - 1].balance : startBalance,
            points, lowest, breach, overdraft,
            totalIn: allEvents.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0),
            totalOut: allEvents.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0),
        };
    },

    insight(p) {
        const fmt = v => 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (p.breach) {
            const dias = this._daysBetween(p.today, p.breach.date);
            const quando = dias <= 0 ? 'hoje'
                : dias === 1 ? 'amanhã'
                : `em ${dias} dias (${p.breach.date.toLocaleDateString('pt-BR')})`;
            const usaChequeEspecial = p.overdraft > 0 && Math.abs(p.breach.balance) <= p.overdraft;
            return {
                level: usaChequeEspecial ? 'warning' : 'danger',
                title: usaChequeEspecial ? 'Atenção: saldo no limite' : 'Risco de saldo negativo',
                message: `Nesse ritmo, seu saldo fica negativo ${quando}. Faltam ${fmt(p.breach.balance)}.`
                    + (usaChequeEspecial ? ' Você entraria no cheque especial.' : ' Considere adiar gastos ou antecipar uma entrada.')
            };
        }

        const piso = p.overdraft > 0 ? p.overdraft * 0.2 : 200;
        if (p.lowest.balance < piso) {
            return {
                level: 'warning',
                title: 'Mês apertado',
                message: `Seu ponto mais baixo será ${fmt(p.lowest.balance)} em ${p.lowest.date.toLocaleDateString('pt-BR')}. Segure os gastos supérfluos nesse período.`
            };
        }

        return {
            level: 'good',
            title: 'Tudo sob controle',
            message: `Projeção saudável: você deve fechar o período com cerca de ${fmt(p.endBalance)}.`
        };
    },
};
