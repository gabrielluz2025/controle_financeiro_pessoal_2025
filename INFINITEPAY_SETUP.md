# Configuração da Integração Real com InfinitePay

## 📋 Pré-requisitos

1. **Conta InfinitePay**: Crie uma conta em [infinitepay.io](https://www.infinitepay.io)
2. **Portal de Desenvolvedores**: Acesse [infinitepay.io/desenvolvedores](https://www.infinitepay.io/desenvolvedores)
3. **Credenciais OAuth**: Registre sua aplicação para obter `CLIENT_ID` e `CLIENT_SECRET`

## 🔑 Obtendo Credenciais

### 1. Registrar Aplicação

1. Acesse o portal de desenvolvedores da InfinitePay
2. Clique em "Criar Nova Aplicação"
3. Preencha os dados:
   - **Nome da Aplicação**: `Controle Financeiro Pessoal`
   - **URL de Redirecionamento**: `http://localhost:3000/api/openfinance/callback/infinitepay`
   - **Webhook URL**: `http://localhost:3000/api/openfinance/webhook/infinitepay`

### 2. Copiar Credenciais

Após registrar, você receberá:
- `CLIENT_ID`
- `CLIENT_SECRET`
- `API_KEY` (opcional)

## 🔧 Configurar Variáveis de Ambiente

Edite o arquivo `.env` na raiz do projeto:

```bash
# ================================================
# INFINITEPAY - CREDENCIAIS REAIS
# ================================================
INFINITEPAY_CLIENT_ID=seu_client_id_aqui
INFINITEPAY_CLIENT_SECRET=seu_client_secret_aqui
INFINITEPAY_REDIRECT_URI=http://localhost:3000/api/openfinance/callback/infinitepay

# ================================================
# MODO DE OPERAÇÃO
# ================================================
NODE_ENV=development  # Use 'development' para sandbox, 'production' para produção
```

## 🚀 Como Funciona a Integração

### Fluxo de Autenticação

1. **Usuário clica em "Conectar InfinitePay"**
   - Frontend chama `/api/openfinance/connect`
   - Backend gera URL de autorização OAuth

2. **Popup de Autenticação**
   - Usuário é redirecionado para o InfinitePay
   - Autoriza o acesso aos dados

3. **Callback e Troca de Tokens**
   - InfinitePay redireciona para `/api/openfinance/callback/infinitepay`
   - Backend troca o `authorization_code` por `access_token`
   - Token é salvo no banco de dados

4. **Sincronização de Dados**
   - Frontend chama `/api/openfinance/sync`
   - Backend usa o `access_token` para buscar dados reais:
     - **Contas**: Saldos e informações da conta
     - **Cartões**: Limites e disponibilidade
     - **Transações**: Histórico de pagamentos recebidos

### Dados Importados Automaticamente

Após a conexão, o sistema importa:

| Tipo | Campo | Exemplo |
|------|-------|---------|
| **Contas** | Nome, Saldo, Tipo | Conta PJ InfinitePay, R$ 5.420,50 |
| **Cartões** | Nome, Limite, Disponível | InfiniteCard Visa, R$ 10.000,00 |
| **Transações** | Descrição, Valor, Data | Venda Cartão #8821, R$ 1.250,00 |

## 🔔 Webhooks em Tempo Real

O sistema está configurado para receber notificações de pagamentos em tempo real.

### Eventos Suportados

- `payment.completed`: Pagamento recebido com sucesso
- `payment.failed`: Falha no pagamento
- `payment.refunded`: Reembolso processado

### Como Registrar Webhook

1. Acesse o portal de desenvolvedores da InfinitePay
2. Vá para "Webhooks"
3. Clique em "Adicionar Webhook"
4. Configure:
   - **URL**: `http://seu-dominio.com/api/openfinance/webhook/infinitepay`
   - **Eventos**: Selecione os eventos desejados
   - **Versão**: Use a versão mais recente

## 🧪 Testando a Integração

### 1. Iniciar o Servidor

```bash
npm start
```

### 2. Acessar a Aplicação

```
http://localhost:8001
```

### 3. Conectar ao InfinitePay

1. Clique no botão "Conectar InfinitePay"
2. Autorize o acesso
3. Aguarde a sincronização de dados

### 4. Verificar Dados Importados

Os dados devem aparecer em:
- **Minhas Contas**: Saldos da conta PJ
- **Meus Cartões**: Limites de crédito
- **Transações**: Histórico de pagamentos

## 📊 Sincronização Manual

Para sincronizar dados manualmente a qualquer momento:

```bash
curl -X POST http://localhost:3000/api/openfinance/sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer seu_token_jwt" \
  -d '{"bank": "infinitepay"}'
```

## 🐛 Troubleshooting

### Erro: "Usuário não autenticado"

**Solução**: O sistema agora permite conexão sem login. Se o erro persistir:
1. Limpe o cache do navegador
2. Verifique se o backend está rodando: `npm start`

### Erro: "Backend não disponível"

**Solução**: O sistema entrará em modo de demonstração automaticamente. Para usar dados reais:
1. Inicie o servidor: `npm start`
2. Verifique a conexão MongoDB: `mongod`

### Erro: "Credenciais inválidas"

**Solução**:
1. Verifique `INFINITEPAY_CLIENT_ID` e `INFINITEPAY_CLIENT_SECRET` no `.env`
2. Confirme que as credenciais estão corretas no portal de desenvolvedores
3. Verifique se a URL de redirecionamento está registrada corretamente

### Dados não aparecem após conexão

**Solução**:
1. Verifique se o MongoDB está rodando
2. Confira os logs do servidor para erros de API
3. Teste manualmente o endpoint `/api/openfinance/sync`

## 📚 Documentação Oficial

- [InfinitePay Developers](https://www.infinitepay.io/desenvolvedores)
- [Open Finance Brasil](https://openfinancebrasil.atlassian.net/)
- [CloudWalk](https://www.cloudwalk.io/)

## 🔐 Segurança

### Boas Práticas

1. **Nunca compartilhe credenciais**: Mantenha `CLIENT_SECRET` seguro
2. **Use HTTPS em produção**: Sempre use conexão segura
3. **Valide tokens**: Verifique a validade dos tokens antes de usar
4. **Rotação de chaves**: Altere suas credenciais regularmente

### Certificados Digitais (Obrigatório para Produção)

Para produção, você precisará de certificados digitais:
- Certificado de Transporte (BRCAC)
- Chave privada
- CA Bundle

Coloque os arquivos em:
```
./certs/
├── certificate.pem
├── private-key.pem
└── ca-bundle.pem
```

## 📞 Suporte

- **Email**: parcerias@cloudwalk.io
- **Central de Ajuda**: [ajuda.infinitepay.io](https://ajuda.infinitepay.io)
- **Telefone**: 0800 591 7207
