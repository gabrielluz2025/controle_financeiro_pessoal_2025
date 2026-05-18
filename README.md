# 💰 Sistema Financeiro com Open Finance Brasil

Sistema completo de gestão financeira pessoal com integração real ao **Open Finance Brasil** para sincronização automática de contas bancárias, cartões de crédito e transações.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![Open Finance](https://img.shields.io/badge/Open%20Finance-Brasil-purple.svg)

## 🚀 Funcionalidades

### 📊 Dashboard Financeiro
- Visão geral de receitas, despesas e saldo
- Gráficos interativos de gastos por categoria
- Análise de tendências financeiras
- Previsão de gastos com IA

### 🏦 Open Finance Brasil
- **Integração Exclusiva com InfinitePay (CloudWalk)**: Sincronização nativa e segura.
- Sincronização automática de contas e saldos
- Importação de transações em tempo real
- Cartões de crédito e faturas

### 🔒 Segurança
- Autenticação OAuth 2.0 + PKCE
- Criptografia AES-256 para dados sensíveis
- JWT com refresh tokens
- Rate limiting e proteção contra DDoS
- Headers de segurança (Helmet)
- Certificados digitais BRCAC

### 💳 Gestão Completa
- Múltiplas contas bancárias
- Cartões de crédito com controle de fatura
- Categorização automática de gastos
- Orçamentos e metas financeiras
- Relatórios detalhados

## 📁 Estrutura do Projeto

```
controle_financeiro_pessoal_2025/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD GitHub Actions
├── server/
│   ├── controllers/
│   │   └── OpenFinanceControllerV2.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   └── logger.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── accounts.js
│   │   └── openfinance.js
│   └── index.js               # Servidor Express
├── services/
│   ├── config.js              # Configurações Open Finance
│   ├── openfinance-real.js    # Cliente Open Finance
│   └── oauth-callback.js      # Handler OAuth
├── js/
│   └── app-state.js           # Estado da aplicação
├── css/
│   └── main.css               # Estilos
├── certs/                     # Certificados (não versionado)
├── index.html                 # Frontend
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## 🛠️ Instalação

### Pré-requisitos
- Node.js >= 18.0.0
- npm ou yarn
- Certificado digital BRCAC (para produção)

### 1. Clone o repositório
```bash
git clone https://github.com/seu-usuario/controle_financeiro_pessoal_2025.git
cd controle_financeiro_pessoal_2025
```

### 2. Instale as dependências
```bash
npm install
```

### 3. Configure as variáveis de ambiente
```bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

### 4. Inicie o servidor
```bash
# Desenvolvimento
npm run dev

# Produção
npm start
```

### 5. Acesse o sistema
- Frontend: http://localhost:8001
- API: http://localhost:3000

## ⚙️ Configuração Open Finance

### Obter Credenciais

Para integração real com bancos, você precisa:

1. **Registrar-se no Open Finance Brasil**
   - Acesse: https://openfinancebrasil.atlassian.net/
   - Siga o processo de credenciamento

2. **Obter certificados digitais**
   - Certificado BRCAC emitido por AC credenciada
   - Certificado de transporte (mTLS)

3. **Configurar cada banco**
   - Registrar sua aplicação no portal de cada banco
   - Obter Client ID e Client Secret
   - Configurar redirect URIs

### Variáveis de Ambiente

```env
# InfinitePay (CloudWalk)
INFINITEPAY_CLIENT_ID=seu_client_id
INFINITEPAY_CLIENT_SECRET=seu_client_secret
INFINITEPAY_REDIRECT_URI=http://localhost:3000/api/openfinance/callback/infinitepay
```

## 🔐 Segurança

### Medidas Implementadas

| Recurso | Descrição |
|---------|-----------|
| **OAuth 2.0 + PKCE** | Fluxo seguro de autorização |
| **JWT** | Tokens assinados com expiração |
| **Helmet** | Headers HTTP seguros |
| **Rate Limiting** | Proteção contra DDoS |
| **CORS** | Controle de origem |
| **bcrypt** | Hash de senhas |
| **Criptografia** | AES-256 para dados sensíveis |

### Boas Práticas

- ⚠️ **NUNCA** commite o arquivo `.env`
- ⚠️ **NUNCA** exponha certificados digitais
- ✅ Use HTTPS em produção
- ✅ Mantenha dependências atualizadas
- ✅ Monitore logs de acesso

## 📡 API Endpoints

### Autenticação
```
POST /api/auth/register    - Registrar usuário
POST /api/auth/login       - Login
POST /api/auth/refresh     - Renovar token
POST /api/auth/logout      - Logout
GET  /api/auth/me          - Dados do usuário
```

### Open Finance
```
GET  /api/openfinance/banks           - Listar bancos
POST /api/openfinance/connect         - Iniciar conexão
GET  /api/openfinance/callback/:bank  - Callback OAuth
GET  /api/openfinance/accounts        - Listar contas
GET  /api/openfinance/credit-cards    - Listar cartões
GET  /api/openfinance/status          - Status conexões
```

### Contas e Transações
```
GET    /api/accounts              - Listar contas
POST   /api/accounts              - Criar conta
PUT    /api/accounts/:id          - Atualizar conta
DELETE /api/accounts/:id          - Excluir conta
GET    /api/accounts/transactions - Listar transações
POST   /api/accounts/transactions - Criar transação
GET    /api/accounts/summary      - Resumo financeiro
```

## 🚀 Deploy

### GitHub Pages (Frontend)
O deploy automático está configurado via GitHub Actions. A cada push na branch `main`, o sistema é automaticamente publicado.

### Servidor (Backend)
Para deploy do backend, recomendamos:
- **Railway**: https://railway.app
- **Render**: https://render.com
- **Heroku**: https://heroku.com
- **DigitalOcean**: https://digitalocean.com

## 💡 Ideias para Melhorias

### Próximas Features
- [ ] App mobile (React Native)
- [ ] Notificações push
- [ ] Integração com PIX
- [ ] Investimentos (ações, FIIs, cripto)
- [ ] Metas de economia gamificadas
- [ ] Relatórios em PDF
- [ ] Multi-moeda
- [ ] Importação de extratos (OFX/CSV)
- [ ] Análise preditiva com Machine Learning
- [ ] Integração com assistentes de voz

### Segurança Avançada
- [ ] 2FA (autenticação dois fatores)
- [ ] Biometria no app mobile
- [ ] Auditoria de acessos
- [ ] Backup criptografado na nuvem

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 📞 Suporte

- 📧 Email: suporte@sistemafinanceiro.com
- 💬 Issues: https://github.com/seu-usuario/controle_financeiro_pessoal_2025/issues

---

Feito com ❤️ para organizar suas finanças
