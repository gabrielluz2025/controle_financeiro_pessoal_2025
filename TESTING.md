# 🧪 Guia de Testes - Sistema Financeiro V2

## Testes Manuais

### 1. Health Check
```bash
curl http://localhost:3000/health
```

**Resposta esperada:**
```json
{
  "status": "ok",
  "timestamp": "2026-05-18T16:25:52.833Z",
  "version": "1.0.0"
}
```

### 2. Listar Bancos Disponíveis
```bash
curl http://localhost:3000/api/openfinance/banks
```

**Resposta esperada:**
```json
{
  "success": true,
  "banks": [
    {
      "id": "nubank",
      "name": "Nubank",
      "logo": "https://...",
      "color": "#820AD1",
      "available": true
    },
    ...
  ],
  "total": 8
}
```

### 3. Registrar Novo Usuário
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "usuario@example.com",
    "name": "Usuário Teste",
    "password": "senha123"
  }'
```

**Resposta esperada:**
```json
{
  "success": true,
  "message": "Usuário registrado com sucesso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "usuario@example.com",
    "name": "Usuário Teste"
  }
}
```

### 4. Fazer Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "usuario@example.com",
    "password": "senha123"
  }'
```

### 5. Obter Dados do Usuário
```bash
curl -H "Authorization: Bearer SEU_TOKEN" \
  http://localhost:3000/api/auth/me
```

### 6. Iniciar Conexão com Banco
```bash
curl -X POST http://localhost:3000/api/openfinance/connect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{
    "bank": "nubank"
  }'
```

**Resposta esperada:**
```json
{
  "success": true,
  "authUrl": "https://auth.nubank.com.br/oauth2/authorize?...",
  "state": "abc123...",
  "expiresIn": 600
}
```

### 7. Obter Status de Conexões
```bash
curl -H "Authorization: Bearer SEU_TOKEN" \
  http://localhost:3000/api/openfinance/status
```

### 8. Obter Análise de Gastos
```bash
curl -H "Authorization: Bearer SEU_TOKEN" \
  http://localhost:3000/api/analytics/summary
```

**Resposta esperada:**
```json
{
  "success": true,
  "data": {
    "totalIncome": 5000,
    "totalExpenses": 2150,
    "balance": 2850,
    "categories": [
      {
        "name": "Alimentação",
        "value": 650,
        "percentage": 30
      },
      ...
    ],
    "monthlyTrend": [...],
    "topTransactions": [...]
  }
}
```

### 9. Obter Análise por Período
```bash
curl -H "Authorization: Bearer SEU_TOKEN" \
  http://localhost:3000/api/analytics/period/2026/5
```

## Testes de Integração

### Fluxo Completo de Autenticação

1. **Registrar usuário**
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "teste@example.com",
       "name": "Teste",
       "password": "senha123"
     }' | jq -r '.token')
   ```

2. **Verificar dados do usuário**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3000/api/auth/me
   ```

3. **Listar bancos**
   ```bash
   curl http://localhost:3000/api/openfinance/banks
   ```

4. **Iniciar conexão**
   ```bash
   curl -X POST http://localhost:3000/api/openfinance/connect \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"bank": "nubank"}'
   ```

## Testes de Segurança

### 1. Testar Rate Limiting
```bash
# Fazer mais de 100 requisições em 15 minutos
for i in {1..110}; do
  curl http://localhost:3000/health
done
```

**Esperado**: Após 100 requisições, receber erro 429 (Too Many Requests)

### 2. Testar Proteção CORS
```bash
curl -H "Origin: http://malicious.com" \
  -H "Access-Control-Request-Method: POST" \
  http://localhost:3000/api/auth/login
```

**Esperado**: Requisição bloqueada ou sem headers CORS

### 3. Testar Validação de Token
```bash
curl -H "Authorization: Bearer token_invalido" \
  http://localhost:3000/api/analytics/summary
```

**Esperado**: Erro 401 (Unauthorized)

### 4. Testar Proteção contra CSRF
```bash
curl -X POST http://localhost:3000/api/openfinance/connect \
  -H "Content-Type: application/json" \
  -d '{"bank": "nubank"}'
```

**Esperado**: Erro 401 (sem token de autenticação)

## Testes de Performance

### 1. Teste de Carga
```bash
# Usando Apache Bench
ab -n 1000 -c 10 http://localhost:3000/health
```

### 2. Teste de Latência
```bash
# Medir tempo de resposta
time curl http://localhost:3000/health
```

## Checklist de Validação

- [ ] Servidor inicia sem erros
- [ ] MongoDB conecta com sucesso
- [ ] Health check retorna status ok
- [ ] Registro de usuário funciona
- [ ] Login funciona e retorna token
- [ ] Endpoints protegidos requerem token
- [ ] Listar bancos retorna 8 bancos
- [ ] Iniciar conexão gera authUrl válida
- [ ] Analytics retorna dados corretos
- [ ] Rate limiting funciona
- [ ] Erros são tratados corretamente
- [ ] Logs são registrados

## Logs Esperados

Ao iniciar o servidor, você deve ver:

```
✅ MongoDB conectado com sucesso
╔═══════════════════════════════════════════════════════╗
║     Sistema Financeiro - Open Finance Brasil          ║
╠═══════════════════════════════════════════════════════╣
║  🚀 Servidor rodando na porta 3000                    ║
║  🔒 Segurança: Helmet, CORS, Rate Limiting ativados   ║
║  📊 Open Finance: Pronto para integração              ║
║  💾 Banco de Dados: MongoDB conectado                 ║
║  📊 Analytics: Ativado                                ║
║  🌐 Frontend: http://localhost:8001              ║
╚═══════════════════════════════════════════════════════╝
```

---

**Última atualização**: Maio 2026
