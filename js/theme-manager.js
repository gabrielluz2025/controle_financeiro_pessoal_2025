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
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        if (!themeToggleBtn) return;
        
        const isDark = this.getCurrentTheme() === 'dark';
        themeToggleBtn.innerHTML = isDark 
            ? '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>'
            : '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l-2.12-2.12a4 4 0 00-5.656 0l-2.12 2.12a1 1 0 001.414 1.414l2.12-2.12a2 2 0 012.828 0l2.12 2.12a1 1 0 001.414-1.414zM2.05 5.464l2.12 2.12a4 4 0 005.656 0l2.12-2.12a1 1 0 00-1.414-1.414l-2.12 2.12a2 2 0 01-2.828 0l-2.12-2.12a1 1 0 00-1.414 1.414z" clip-rule="evenodd"></path></svg>';
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
