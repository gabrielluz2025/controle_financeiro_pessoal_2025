/**
 * Módulo de Estado da Aplicação
 * Gerencia todo o estado central da aplicação
 */
const AppState = {
    accounts: [], 
    creditCards: [], 
    transactions: [], 
    budgets: [],
    categories: ["Alimentação", "Transporte", "Moradia", "Lazer", "Saúde", "Educação", "Salário", "Investimentos", "Contas Fixas", "Compras", "Pagamento de Fatura", "Outros"],
    currentView: 'dashboard', 
    isSidebarCollapsed: false,
    displayMonth: new Date().getMonth(),
    displayYear: new Date().getFullYear(),
    selectedTransactionIds: [],
    selectedFaturaCardId: null,
    
    init() {
        this.accounts = JSON.parse(localStorage.getItem('app_accounts_v3')) || [];
        this.creditCards = JSON.parse(localStorage.getItem('app_creditCards_v3')) || [];
        this.transactions = JSON.parse(localStorage.getItem('app_transactions_v3')) || [];
        this.budgets = JSON.parse(localStorage.getItem('app_budgets_v3')) || [];
        const storedCategories = JSON.parse(localStorage.getItem('app_categories_v3'));
        if (storedCategories && storedCategories.length) {
            this.categories = storedCategories;
        }
        if (!this.categories.includes("Outros")) this.categories.push("Outros");
        if (!this.categories.includes("Pagamento de Fatura")) this.categories.push("Pagamento de Fatura");
        this.recalculateAllBalances();
    },
    
    recalculateAllBalances() {
        // Recalculate account balances
        this.accounts.forEach(account => {
            let currentBalance = account.initialBalance || 0;
            const accountTransactions = this.transactions.filter(
                tx => tx.accountId === account.id && !tx.isCreditCard
            );
            accountTransactions.forEach(tx => {
                // If an income, add value
                if (tx.fundamentalType === 'receita') {
                    currentBalance += tx.value;
                } 
                // If an expense paid by this account, subtract value
                else if (tx.fundamentalType === 'despesa' && tx.isPaid && tx.paidByAccountId === account.id) {
                    currentBalance -= tx.value;
                } 
                // If an expense not paid by this account, but from a linked card, it affects the card balance, not directly the account
                // However, payment of that card bill *will* affect this account balance, which is handled by the "Pagamento de Fatura" transaction type.
                // So, no direct impact for credit card expenses on account balance here.
            });
            account.balance = currentBalance;
        });

        // Recalculate credit card balances
        this.creditCards.forEach(card => {
            let usedAmount = 0;
            const cardTransactions = this.transactions.filter(
                tx => tx.accountId === card.id && tx.isCreditCard
            );
            
            cardTransactions.forEach(tx => {
                // Credit card expenses increase used amount
                if (tx.fundamentalType === 'despesa') {
                    usedAmount += tx.value;
                } 
                // Payments to the card reduce used amount (these are "Receitas" in the context of the card, but "Pagamento de Fatura" expense on linked account)
                // This scenario (payments to card as income) should be reflected as the "Pagamento de Fatura" transaction category from the linked account.
                // If there are explicit "receita" transactions on a credit card (e.g., refunds), they reduce the used amount.
                else if (tx.fundamentalType === 'receita') {
                    usedAmount -= tx.value;
                }
            });
            // Ensure usedAmount doesn't go below zero
            usedAmount = Math.max(0, usedAmount);
            card.availableLimit = card.limit - usedAmount;
        });
    },

    saveAll() {
        localStorage.setItem('app_accounts_v3', JSON.stringify(this.accounts));
        localStorage.setItem('app_creditCards_v3', JSON.stringify(this.creditCards));
        localStorage.setItem('app_transactions_v3', JSON.stringify(this.transactions));
        localStorage.setItem('app_categories_v3', JSON.stringify(this.categories));
        localStorage.setItem('app_budgets_v3', JSON.stringify(this.budgets));
    },
    
    clearAllData() {
        this.accounts = []; 
        this.creditCards = []; 
        this.transactions = []; 
        this.budgets = [];
        this.categories = ["Alimentação", "Transporte", "Moradia", "Lazer", "Saúde", "Educação", "Salário", "Investimentos", "Contas Fixas", "Compras", "Pagamento de Fatura", "Outros"];
        this.saveAll();
    },

    exportData() {
        const dataToExport = {
            accounts: this.accounts,
            creditCards: this.creditCards,
            transactions: this.transactions,
            categories: this.categories,
            budgets: this.budgets,
        };
        const dataStr = JSON.stringify(dataToExport, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = 'financas_backup.json';
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    }
};
