# Plano de Ação — Integração Wake ↔ Sankhya ↔ Intelipost

**BeBaby Group Importação** · Documento de execução · 05/08/2026

Este documento é só **o que fazer**. O diagnóstico, as evidências e o porquê de cada item estão no relatório `diagnostico-integracao-wake-sankhya-intelipost-v3.md`.

**Objetivo final:** um único embarque por venda na Intelipost, carregando a nota fiscal e o ID do pedido Wake, com a situação do pedido avançando conforme os eventos da transportadora.

---

## ⚠️ Leia antes de começar

**Três coisas que NÃO devem ser feitas, em nenhuma circunstância:**

| Nunca | Por quê |
|---|---|
| Desativar "Notificação de Cotações" na Wake **antes** de validar o patch do Sankhya | Você fica sem nenhum embarque com canal válido e perde até o rastreio que hoje funciona |
| Salvar uma regra de evento na Intelipost com os campos de autenticação preenchidos pelo autofill do navegador | Sobrescreve a credencial real e derruba o webhook que hoje funciona |
| Ativar "Reintegrar Pedido" em qualquer situação da Wake | Devolve o pedido à fila de não-integrados. Risco de duplicar documento no ERP |

**Uma observação sobre cliques na Intelipost:** clicar no botão de uma condição (ex. "Canal de Vendas") dentro de uma regra de evento **desmarca** a condição, não expande. Se acontecer, saia da tela **sem salvar**.

---

## FASE 0 — Hoje, sem depender de ninguém

### ☐ 0.1 Desativar a regra de evento 64734

**Onde:** Intelipost → Entregas → Configurações → Regras de Evento
**O quê:** desativar o toggle da regra `64734 — Webhook Wake`

Ela aponta para `abcdesignbrasil.com.br/checkout`, uma página de vitrine, e transmite credenciais Basic a cada evento. É resíduo de 12/05/2026, anterior às regras por loja.

**Validar:** o toggle fica claro/desligado. As regras 65461 e 65462 permanecem ativas.

---

### ☐ 0.2 Rotacionar a API key da Intelipost

**A mesma chave está em três lugares:**
1. Hardcoded no script de cotação do Sankhya
2. Hardcoded no script "Enviar para Intelipost"
3. Painel da Wake, em Fretes >> Integração Intelipost

**Rotação derruba Wake e Sankhya simultaneamente.** Precisa ser coordenada:

1. Gerar a nova chave na Intelipost
2. Atualizar no painel da Wake
3. Atualizar nos dois scripts do Sankhya
4. Testar uma cotação no site e uma no Sankhya
5. Revogar a chave antiga

**Melhoria recomendada:** no Sankhya, mover a chave para um parâmetro do sistema em vez de literal no código. Hoje qualquer usuário com acesso ao Dicionário de Dados consegue lê-la.

---

### ☐ 0.3 Testar os dois macro status que faltam

Pega um pedido de teste com embarque na Intelipost (canal `Wake_kikkaboobrasil`), altera o Macro Status manualmente e confere o histórico do pedido na Wake.

| Macro status | Situação Wake resultante | Resultado |
|---|---|---|
| SAIU PARA ENTREGA (16) | | ☐ |
| FALHA NA ENTREGA (13) | | ☐ |

**Já confirmados, não precisa repetir:**

| Macro status | Resultado |
|---|---|
| DESPACHADO (9) | ❌ não escreve situação |
| EM TRÂNSITO (12) | ❌ não escreve situação |
| ENTREGUE (14) | ✅ escreve `Entregue` |

**Como identificar a origem da escrita** — no histórico, a mensagem diz quem escreveu:

| Mensagem | Origem |
|---|---|
| `Situação alterada através da Integração Intelipost (Jaimito)` | integração nativa Wake ↔ Intelipost |
| `Atualizado por: Tem Api via API` | Tem Api |
| `Situação alterada pelo Gateway de Pagamento` | gateway |

Isso alimenta o ticket 5.1.

---

### ☐ 0.4 Levantar o passivo de embarques duplicados

**Onde:** Intelipost → Entregas → Gestão de Pedidos

Filtrar embarques abertos sem nota fiscal (são os criados pela Wake). Cancelar em lote.

**Em paralelo:**
- ☐ Verificar com os Correios se as PLPs não postadas estão gerando cobrança
- ☐ Conferir se os embarques sem NF têm notificação ao destinatário ativa (no caso analisado o campo "Notificações por" estava vazio — confirmar se é a regra)
- ☐ Conferir se o rastreio `AP291459770BR` teve movimentação real

---

### ☐ 0.5 Verificar automações que dependem da situação

**Onde:** Kommo

Qualquer fluxo disparado por mudança de situação do pedido está hoje recebendo eventos incompletos — nunca recebe despacho nem trânsito. Levantar quais são, para saber o que volta a funcionar depois da correção.

---

## FASE 1 — Descobertas que bloqueiam o patch

### ☐ 1.1 CODEMP → loja

```sql
SELECT C.CODEMP, COUNT(*) AS NOTAS,
       MIN(C.AD_PEDIDOMKTPLACE) AS EXEMPLO_1,
       MAX(C.AD_PEDIDOMKTPLACE) AS EXEMPLO_2
FROM SANKHYA.TGFCAB C
WHERE C.TIPMOV = 'V' AND C.CODTIPOPER = 1728
  AND C.AD_CANAL_MKTPLACE IS NULL
  AND C.DTNEG >= DATE '2026-07-01'
GROUP BY C.CODEMP ORDER BY 2 DESC
```

Pega um `EXEMPLO_1` de cada CODEMP e procura o número no admin de cada loja. Onde o pedido existir, aquele CODEMP é daquela loja.

**Preencher:**

| CODEMP | Loja | `sales_channel` |
|---|---|---|
| 1 | | `Wake_kikkaboobrasil` *(a confirmar se é CODEMP 1)* |
| 2 | | |
| 3 | | |
| 4 | | |

> `AD_CANAL_MKTPLACE` **não serve** para isso — ele é `NULL` justamente na loja própria.

---

### ☐ 1.2 `sales_channel` da loja ABC Design

**Onde:** Intelipost → Gestão de Pedidos

Abrir um embarque criado pela Wake na loja ABC Design (tem canal preenchido e não tem nota fiscal) e copiar a string do campo **Canal de Vendas**, exatamente, com o mesmo case.

**Valor encontrado:** ________________

> O da Kikkaboo já está confirmado: `Wake_kikkaboobrasil`. Copiado do embarque 695225333, que comprovadamente dispara pela regra 65461.

---

### ☐ 1.3 Valores de `TIPMOV` e `STATUSNFE`

```sql
SELECT TIPMOV, CODTIPOPER, STATUSNFE, COUNT(*) AS QTD
FROM SANKHYA.TGFCAB
WHERE CODTIPOPER IN (1722, 1728)
  AND DTNEG >= DATE '2026-07-01'
GROUP BY TIPMOV, CODTIPOPER, STATUSNFE
ORDER BY 4 DESC
```

Identificar qual valor de `STATUSNFE` corresponde a NF-e autorizada. Vai na trava do patch.

**Valor de NF-e autorizada:** ________________

---

### ☐ 1.4 IDs das situações, por loja

**Onde:** `https://api.fbits.net/swagger` → endpoint "Retorna todas as situações de pedido da loja"

Rodar **com o token de cada loja separadamente**.

Interessa especialmente os **dois IDs distintos** por trás do nome `Pedido Enviado`:

| Nome interno | Descrição | ID | Loja |
|---|---|---|---|
| Pedido Enviado | Em Preparação | | |
| Pedido Enviado | Em trânsito | | |
| Entregue | Entregue | | |

Alimenta o ticket 5.1.

---

## FASE 2 — Patch no script "Enviar para Intelipost"

**Onde:** Sankhya → Dicionário de Dados → `TGFCAB` → aba Ações → botão "Enviar para Intelipost"
**Tipo:** `Script (JavaScript)` — editável, sem depender de fornecedor

> **Faça backup do script atual antes de qualquer alteração.**

---

### ☐ 2.1 Derivar o `sales_channel` junto do armazém

**Localizar** o bloco que define `originWarehouseCode` e **substituir** por:

```javascript
var originWarehouseCode = null;
var salesChannel = null;

if (codemp === "1") {
    originWarehouseCode = "02";
    salesChannel = "Wake_kikkaboobrasil";
} else if (codemp === "2") {
    originWarehouseCode = "01";
    salesChannel = "Wake_abcdesignbrasil";   // ← preencher com o valor da Fase 1.2
} else if (codemp === "3") {
    originWarehouseCode = "04";
    salesChannel = null;                      // ← definir se houver vendas
} else if (codemp === "4") {
    originWarehouseCode = "03";
    salesChannel = null;                      // ← definir se houver vendas
} else {
    mensagem = "CODEMP não reconhecido: " + codemp;
}

if (salesChannel == null) {
    mensagem = "Envio bloqueado: canal de vendas não definido para CODEMP " + codemp;
    return;
}
```

O `return` no final evita criar embarque sem canal — que é exatamente o problema atual.

---

### ☐ 2.2 Corrigir a referência do pedido no payload

**Localizar** no `selectQuery`:

```javascript
"  'order_number' VALUE c.nunota, " +
```

**Substituir por:**

```javascript
"  'order_number' VALUE c.AD_PEDIDOMKTPLACE, " +
"  'sales_order_number' VALUE c.AD_PEDIDOMKTPLACE, " +
"  'sales_channel' VALUE '" + salesChannel + "', " +
"  'additional_information' VALUE JSON_OBJECT('nunota' VALUE c.nunota), " +
```

**Por que o ID Wake nos dois campos:** não se sabe qual deles o endpoint da Wake lê. O `NUNOTA` vai em `additional_information`, que a API da Intelipost aceita como pares chave-valor livres — a operação não perde a referência do ERP.

---

### ☐ 2.3 Adicionar a trava de estado

**Inserir antes** do bloco `try` que faz o POST:

```javascript
var gate = getQuery("native");
gate.setParam("Pedido", Pedido);
gate.nativeSelect(
  "SELECT TIPMOV, NUMNOTA, CHAVENFE, AD_PEDIDOMKTPLACE, AD_IDINTELIPOST " +
  "FROM SANKHYA.TGFCAB WHERE NUNOTA = {Pedido}"
);

if (gate.next()) {
    if (String(gate.getString("TIPMOV")).trim() !== "V") {
        mensagem = "Envio bloqueado: documento nao e nota de venda faturada.";
        return;
    }
    if (gate.getString("NUMNOTA") == null || gate.getString("CHAVENFE") == null) {
        mensagem = "Envio bloqueado: NF-e nao emitida ou nao autorizada.";
        return;
    }
    if (gate.getString("AD_PEDIDOMKTPLACE") == null) {
        mensagem = "Envio bloqueado: pedido sem ID de origem (Pedido Externo).";
        return;
    }
    if (gate.getString("AD_IDINTELIPOST") != null) {
        mensagem = "Envio bloqueado: embarque ja criado (" +
                   gate.getString("AD_IDINTELIPOST") + ").";
        return;
    }
} else {
    mensagem = "Envio bloqueado: documento nao encontrado.";
    return;
}
```

Ajuste os valores conforme a Fase 1.3. A trava do `AD_IDINTELIPOST` só funciona depois de 2.4.

---

### ☐ 2.4 Gravar o `AD_IDINTELIPOST` no retorno

Hoje a resposta da API cai em `mensagem` e é descartada. No bloco de sucesso (`responseCode >= 200 && responseCode < 300`), extrair o ID do shipment order do JSON de retorno e gravar:

```javascript
if (responseCode >= 200 && responseCode < 300) {
    try {
        var jsonResp = new org.json.JSONObject(response);
        var idIntelipost = jsonResp.getJSONObject("content").get("id");
        var upd = getQuery("native");
        upd.update("UPDATE SANKHYA.TGFCAB SET AD_IDINTELIPOST = '" + idIntelipost +
                   "' WHERE NUNOTA = " + Pedido);
    } catch (e2) {
        // não bloqueia o fluxo, mas registra
        mensagem = "Embarque criado, falha ao gravar ID: " + e2.message;
    }
    mensagem = "Pedido enviado com sucesso. HTTP " + responseCode +
               (response ? " - Retorno: " + response : "");
}
```

> **Confirme o caminho do ID no JSON de retorno** antes de aplicar — pode ser `content.id`, `content.shipment_order_id` ou outro. Rode um envio primeiro e leia o corpo da resposta na mensagem de retorno.

---

### ☐ 2.5 Corrigir o `JOIN` ambíguo

**Localizar:**

```javascript
"JOIN AD_APIINTELI ai ON ai.NUMPEDIDO = '" + Pedido + "' AND ai.IDCOTACAO = '" + Cotacao + "' "
```

O filtro não distingue entre sessões de cotação diferentes. Com duas sessões para o mesmo documento, o mesmo `IDCOTACAO` casa com duas linhas, e sem `ORDER BY` o frete enviado é arbitrário.

**Correção mínima** — usar sempre a cotação mais recente:

```javascript
"JOIN (SELECT * FROM (SELECT ai2.* FROM AD_APIINTELI ai2 " +
"      WHERE ai2.NUMPEDIDO = '" + Pedido + "' AND ai2.IDCOTACAO = '" + Cotacao + "' " +
"      ORDER BY ai2.ID_KEY DESC) WHERE ROWNUM = 1) ai ON 1=1 "
```

---

## FASE 3 — Validação (obrigatória antes da Fase 4)

Faturar um pedido de teste na loja Kikkaboo e clicar o botão.

### ☐ 3.1 Conferir o embarque na Intelipost

| Verificar | Esperado |
|---|---|
| Canal de Vendas | `Wake_kikkaboobrasil` preenchido |
| Pedido / Pedido de Venda | ID do pedido Wake, não o NUNOTA |
| Nota fiscal | preenchida |
| Peso e dimensões | valores reais da nota |

### ☐ 3.2 Conferir o disparo do webhook

**Onde:** Intelipost → Webhook → Lista de webhooks → aba "Todos envios"

Buscar pelo **ID do pedido Wake**. Deve aparecer disparo pela regra `65461` com status Sucesso.

> Se não aparecer, o `sales_channel` não casou com o filtro. Volte e confira o case da string.

### ☐ 3.3 Conferir o `AD_IDINTELIPOST`

```sql
SELECT NUNOTA, NUMNOTA, AD_PEDIDOMKTPLACE, AD_IDINTELIPOST
FROM SANKHYA.TGFCAB
WHERE NUNOTA = <NUNOTA do teste>
```

Deve estar preenchido. Testar clicar o botão de novo — deve ser bloqueado pela trava.

### ☐ 3.4 Conferir o histórico na Wake

Abrir o pedido e ver o histórico de situações. Se houver escrita com assinatura `Situação alterada através da Integração Intelipost (Jaimito)`, a cadeia inteira está funcionando.

---

## FASE 4 — Desligar a criação de embarque pela Wake

### ☐ 4.1 Desativar "Notificação de Cotações"

**Onde:** Wake → Fretes >> Integração Intelipost
**Parâmetro:** `Intelipost - Ativar/Desativar notificação de cotações` → desativar

Função documentada: *"Ao ativar, faz o envio do pedido para a Intelipost."* É ele que cria o embarque duplicado.

**Só execute depois da Fase 3 completa e validada.**

### ☐ 4.2 Monitorar o rastreio por uma semana

O parâmetro "Integra a URL de rastreamento" diz *"se a sua integração enviar pedidos para a Intelipost"*. Não está claro se isso inclui o embarque criado pelo Sankhya.

Se o código de rastreio parar de aparecer nos pedidos, essa é a causa — e vira pergunta para a Wake.

### ☐ 4.3 Confirmar que só existe um embarque por venda

Faturar um pedido e conferir na Intelipost que há **um único** registro.

---

## FASE 5 — Tickets externos

### ☐ 5.1 Ticket na Wake — mapeamento de macro status

Complete a tabela da Fase 0.3 e os IDs da Fase 1.4 antes de enviar.

**Assunto:** Integração Intelipost — apenas parte dos macro status altera a situação do pedido

> O endpoint `https://frete.fbits.net/api/notificacoes/intelipost/kikkaboobrasil` recebe eventos de macro status da Intelipost e responde com sucesso, mas apenas parte deles produz alteração de situação do pedido.
>
> **Evidência — pedido 75098.** Webhooks disparados pela Intelipost, todos com retorno de sucesso registrado no log da Intelipost:
>
> - 03/08/2026 15:41:25 — `Despachado` — nenhuma alteração de situação
> - 03/08/2026 17:00:11 — `Em trânsito` — nenhuma alteração de situação
> - 05/08/2026 — `Entregue` — situação alterada para `Entregue` às 12:51, com a mensagem "Situação alterada através da Integração Intelipost (Jaimito)"
>
> A regra de evento 65461 na Intelipost cobre os cinco macro status: DESPACHADO (9), EM TRÂNSITO (12), FALHA NA ENTREGA (13), ENTREGUE (14) e SAIU PARA ENTREGA (16).
>
> **Observação relevante.** Nossa loja possui **duas situações com o nome interno `Pedido Enviado`** — uma com descrição "Em Preparação" e observação "Faturado - Nota fiscal emitida", outra com descrição "Em trânsito". A situação `Entregue` é única. Levantamos a hipótese de que a resolução da situação-alvo seja feita por nome, e que a ambiguidade impeça a escrita.
>
> Solicitamos:
> 1. A tabela de mapeamento entre macro status Intelipost e situações da plataforma;
> 2. Confirmação de se a resolução da situação-alvo é feita por ID ou por nome;
> 3. Se por nome, orientação sobre como resolver a duplicidade — o campo Nome não é editável pelo lojista;
> 4. Onde consultamos o log de processamento desse endpoint;
> 5. Confirmação do valor esperado no campo Canal de Vendas. A documentação do artigo *Integração de Frete com a Intelipost* instrui usar "FBITS", mas nossa configuração utiliza nome por loja (`Wake_kikkaboobrasil`), por operarmos duas lojas na mesma conta Intelipost.

---

### ☐ 5.2 Ticket na Tem Api — situação de faturamento prematura

**Assunto:** Gravação de situação de faturamento antes da emissão da NF-e gera embarque logístico indevido

> Identificamos que a Tem Api grava a situação `Pedido Enviado` (observação "Faturado - Nota fiscal emitida") antes de existir nota fiscal emitida no ERP.
>
> Conforme o fluxo oficial da integração Wake ↔ Intelipost, a plataforma cria o pedido logístico na Intelipost quando o pedido atinge o status de faturado. Como a situação é gravada prematuramente, a Wake cria um embarque real — com PLP, etiqueta e ordem na transportadora — utilizando os dados do checkout, para mercadoria que ainda não foi faturada.
>
> **Evidência — pedido Wake 74923 / Sankhya NUNOTA 194280.**
>
> - 31/07/2026 13:30 — embarque criado na Intelipost pela Wake (Correios PAC, PLP 179315307, rastreio AP291459770BR, sem nota fiscal)
> - 31/07/2026 16:03 — NF-e 48122 emitida no Sankhya
>
> A situação de faturamento foi sinalizada aproximadamente duas horas e meia antes da emissão da nota.
>
> Solicitamos:
> 1. Que a gravação da situação de faturamento ocorra somente após a emissão e autorização da NF-e no ERP;
> 2. Qual gatilho é utilizado hoje para essa escrita;
> 3. Levantamento do volume de pedidos afetados desde a entrada em produção.

---

### ☐ 5.3 Definir a gravação dos dados fiscais

Número, série, chave e URL da NF-e permanecem vazios no pedido da Wake. Definir com Wake e Tem Api quem grava: o endpoint de rastreamento completo chamado pelo Sankhya/Tem Api, ou o endpoint de notificação recebendo da Intelipost.

---

## FASE 6 — Observabilidade

### ☐ 6.1 Criar regra de evento de retorno para o Sankhya

**Onde:** Intelipost → Regras de Evento → Adicionar nova regra

Mesma configuração da 65461 (condições `Evento Entrando` + `Canal de Vendas`, mesmos cinco macro status), mas com webhook apontando para um endpoint do Sankhya.

### ☐ 6.2 Popular os campos de retorno na `TGFCAB`

Os campos existem e estão vazios em 1.207 de 1.207 documentos:

`AD_MACROSTATUS` · `AD_RASTREIO` · `AD_DATACOLETA` · `AD_DATACOLETAEXP` · `AD_ENTREGA`

Isso transforma o Sankhya em fonte de auditoria consultável por SQL — vocês deixam de depender de fornecedor para diagnosticar.

### ☐ 6.3 Colunas de auditoria na `AD_APIINTELI`

| Coluna | Tipo | Finalidade |
|---|---|---|
| `DHINCLUSAO` | `DATE` | quando a cotação foi registrada |
| `STATUSPROC` | `VARCHAR2(20)` | pendente / enviado / erro |
| `DHENVIO` | `DATE` | quando o embarque foi criado |
| `RETORNOAPI` | `VARCHAR2(4000)` | corpo da resposta da Intelipost |

Com `RETORNOAPI`, falhas futuras passam a ser diagnosticáveis sem ticket.

### ☐ 6.4 Job de reconciliação diária

Comparar situação na Wake × estado no Sankhya × macro status na Intelipost, e listar divergências. Rede de segurança: mesmo perdendo um webhook, o pedido é corrigido em 24h.

---

## FASE 7 — Limpeza

### ☐ 7.1 Corrigir a descrição de `Pedido Enviado`

A descrição "Em Preparação" contradiz a observação da própria linha ("Faturado - Nota fiscal emitida").

> ⚠️ Essa descrição aparece na página do cliente e em e-mails transacionais — a coluna `Email cópia oculta` está preenchida nessa linha. **Mapeie onde o rótulo é consumido antes de trocar.** Todo cliente com pedido nessa situação vê a mudança imediatamente.

### ☐ 7.2 Revisar o `originWarehouseCode`

O mapeamento cruza: `1→02`, `2→01`, `3→04`, `4→03`. Conferir contra a lista de armazéns na Intelipost. Se estiver invertido, há embarques cotados a partir do CD errado.

### ☐ 7.3 Volume por linha de item no script de cotação

O `JSON_ARRAYAGG` sobre `TGFITE` gera um volume **por linha de item**. Um pedido com três produtos é cotado como três volumes, mesmo indo numa caixa só — inflando o frete apresentado ao cliente. Verificar se é intencional.

### ☐ 7.4 Unidade do peso

A documentação da Wake exige peso cadastrado como **inteiro** (`235` correto, `0,235` retorna erro). O script envia `pr.pesobruto * i.qtdneg` direto do `TGFPRO`, decimal em kg. Candidato provável para a divergência de cubagem entre checkout e faturamento.

### ☐ 7.5 Investigar `AD_STATUSLOG`

```sql
SELECT AD_STATUSLOG, COUNT(*) AS QTD
FROM SANKHYA.TGFCAB
WHERE CODTIPOPER = 1728 AND TIPMOV = 'V'
GROUP BY AD_STATUSLOG ORDER BY 2 DESC
```

### ☐ 7.6 Descobrir quem grava `AD_IDINTELIPOST` hoje

Nenhum dos dois scripts grava esse campo, e ele está preenchido em 1.207 documentos. Existe um terceiro mecanismo não identificado.

Listar **todas** as ações da `TGFCAB` no Dicionário de Dados, não só as duas conhecidas. Se não houver, investigar a Tem Api.

> Relevante para a Fase 2.4: se algo já grava esse campo, pode haver conflito com a nova gravação.

### ☐ 7.7 Limpar campos órfãos do dicionário

`AD_CIDADE` · `AD_CNPJPARCEIRO` · `AD_CUBAGEMTOTAL` · `AD_DIFALPAGO` · `AD_NUMEROUNICOPEDIDO` · `AD_TIPPESSOA` · `AD_UF`

Existem no dicionário e não na tabela. Se algum layout referenciar um deles, o usuário vê `ORA-00904` em tela.

---

## Métricas de acompanhamento

Rodar antes e depois de cada fase.

### Saúde do canal de retorno

```sql
SELECT COUNT(*)              AS COM_EMBARQUE,
       COUNT(AD_MACROSTATUS) AS COM_STATUS,
       COUNT(AD_RASTREIO)    AS COM_RASTREIO,
       ROUND(COUNT(AD_MACROSTATUS) * 100 / NULLIF(COUNT(*), 0), 1) AS PCT_STATUS
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND AD_IDINTELIPOST IS NOT NULL
  AND DTNEG >= DATE '2026-08-01'
```

| | Linha de base | Meta |
|---|---|---|
| `COM_EMBARQUE` | 1.207 | — |
| `PCT_STATUS` | **0%** | ~100% após Fase 6 |

### Cobertura do embarque na loja própria

```sql
SELECT COUNT(*) AS NOTAS_LOJA,
       COUNT(AD_IDINTELIPOST) AS COM_EMBARQUE,
       ROUND(COUNT(AD_IDINTELIPOST) * 100 / NULLIF(COUNT(*), 0), 1) AS PCT
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND AD_CANAL_MKTPLACE IS NULL
  AND DTNEG >= DATE '2026-08-01'
```

| | Linha de base | Meta |
|---|---|---|
| `PCT` | **37%** | ~100% após Fase 2 |

### Pedidos travados (sem SQL)

Wake → Listagem de Pedidos, combinar filtros:
- **Histórico de Situações** contém "Em Preparação"
- **Situações** (atual) = "Em Preparação"

Exportar e acompanhar a redução.

---

## Resumo por dependência

| Depende só de você | Depende de fornecedor |
|---|---|
| 0.1 Desativar regra 64734 | 5.1 Mapeamento de status (Wake) |
| 0.2 Rotacionar API key | 5.2 Situação prematura (Tem Api) |
| 0.3 Testar macro status | 5.3 Dados fiscais (Wake / Tem Api) |
| 0.4 Cancelar embarques duplicados | |
| 1.1–1.4 Descobertas | |
| 2.1–2.5 Patch no Sankhya | |
| 3.1–3.4 Validação | |
| 4.1–4.3 Desligar criação pela Wake | |
| 6.1–6.4 Observabilidade | |
| 7.1–7.7 Limpeza | |

**Onze grupos de ação sob seu controle, três dependendo de terceiro.** E os três de terceiro não bloqueiam a eliminação da duplicidade de embarque, que é o item de impacto financeiro.

---

*Documento de execução derivado de `diagnostico-integracao-wake-sankhya-intelipost-v3.md`. Consulte o relatório para as evidências que sustentam cada item.*
