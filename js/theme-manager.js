/**
 * Gerenciador de Tema Escuro
 * Controla a alternância entre tema claro e escuro
 */
const ThemeManager = {
    THEME_KEY: 'app_theme_preference',
    DARK_MODE_CLASS: 'dark-mode',
    
    init() {
        const savedTheme = localStorage.getItem(this.THEME_KEY) || 'light';
        this.setTheme(savedTheme);
        this.setupThemeToggle();
    },
    
    setTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add(this.DARK_MODE_CLASS);
        } else {
            document.body.classList.remove(this.DARK_MODE_CLASS);
        }
        localStorage.setItem(this.THEME_KEY, theme);
    },
    
    toggleTheme() {
        const currentTheme = localStorage.getItem(this.THEME_KEY) || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
        return newTheme;
    },
    
    getCurrentTheme() {
        return localStorage.getItem(this.THEME_KEY) || 'light';
    },
    
    setupThemeToggle() {
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => {
                this.toggleTheme();
                this.updateThemeToggleIcon();
            });
            this.updateThemeToggleIcon();
        }
    },
    
    updateThemeToggleIcon() {
        const isDark = this.getCurrentTheme() === 'dark';
        const lightIcon = document.getElementById('theme-icon-light');
        const darkIcon  = document.getElementById('theme-icon-dark');
        if (lightIcon) lightIcon.classList.toggle('hidden', isDark);
        if (darkIcon)  darkIcon.classList.toggle('hidden', !isDark);
        /* Also regenerate charts with correct palette after toggle */
        setTimeout(() => {
            if (typeof UI !== 'undefined' && AppState.currentView === 'dashboard') {
                UI.renderBalanceChart();
                UI.renderExpensesChart();
            }
        }, 50);
    }
};

/**
 * Gerenciador de Metas Financeiras
 * Controla a criação e acompanhamento de metas de economia
 */
const GoalsManager = {
    GOALS_KEY: 'app_financial_goals_v1',
    
    init() {
        this.goals = JSON.parse(localStorage.getItem(this.GOALS_KEY)) || [];
    },
    
    addGoal(goal) {
        const newGoal = {
            id: crypto.randomUUID(),
            name: goal.name,
            targetAmount: goal.targetAmount,
            currentAmount: goal.currentAmount || 0,
            dueDate: goal.dueDate,
            category: goal.category || 'Geral',
            createdAt: new Date().toISOString(),
            completed: false
        };
        this.goals.push(newGoal);
        this.save();
        return newGoal;
    },
    
    updateGoal(goalId, updates) {
        const goal = this.goals.find(g => g.id === goalId);
        if (goal) {
            Object.assign(goal, updates);
            if (goal.currentAmount >= goal.targetAmount) {
                goal.completed = true;
            }
            this.save();
        }
        return goal;
    },
    
    deleteGoal(goalId) {
        this.goals = this.goals.filter(g => g.id !== goalId);
        this.save();
    },
    
    getGoals() {
        return this.goals;
    },
    
    getGoalProgress(goalId) {
        const goal = this.goals.find(g => g.id === goalId);
        if (!goal) return 0;
        return (goal.currentAmount / goal.targetAmount) * 100;
    },
    
    save() {
        localStorage.setItem(this.GOALS_KEY, JSON.stringify(this.goals));
    }
};

/**
 * Gerenciador de Alertas
 * Controla notificações visuais do sistema
 */
const AlertsManager = {
    showAlert(message, type = 'info', duration = 5000) {
        const alertContainer = document.getElementById('alerts-container');
        if (!alertContainer) return;
        
        const alertId = crypto.randomUUID();
        const alertElement = document.createElement('div');
        alertElement.id = `alert-${alertId}`;
        alertElement.className = `notification notification-${type} animate-slide-in`;
        alertElement.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()" class="ml-auto text-lg">&times;</button>
        `;
        
        alertContainer.appendChild(alertElement);
        
        if (duration > 0) {
            setTimeout(() => {
                alertElement.remove();
            }, duration);
        }
        
        return alertId;
    },
    
    showSuccess(message, duration = 5000) {
        return this.showAlert(message, 'success', duration);
    },
    
    showError(message, duration = 5000) {
        return this.showAlert(message, 'error', duration);
    },
    
    showWarning(message, duration = 5000) {
        return this.showAlert(message, 'warning', duration);
    }
};

// Inicializar gerenciadores quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
    GoalsManager.init();
});
