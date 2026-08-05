# Plano A — Resolver pelos webhooks Intelipost → Wake

**BeBaby Group Importação** · Documento de execução · 05/08/2026
**Diagnóstico de referência:** `diagnostico-integracao-v4.md`

---

## Premissa deste plano

Manter a **integração nativa da Wake** como responsável por escrever a situação do pedido. A Intelipost dispara o webhook, o endpoint `frete.fbits.net` recebe e converte em situação.

**Não envolve desenvolvimento na Tem Api.** O único pedido a ela, se houver, é parar de gravar a situação de faturamento prematuramente — e mesmo isso pode ser contornado (ver Fase 4).

### O que este plano resolve

✅ Duplicidade de embarque na Intelipost
✅ Embarque com nota fiscal entrando na cadeia de webhook
✅ Passivo financeiro de PLPs e etiquetas indevidas
✅ Segurança (API key, credenciais em URL pública)

### O que este plano NÃO resolve por conta própria

❌ **A situação do pedido só avança em `Entregue`.** `Despachado` e `Em trânsito` continuam sem escrever até que a Wake corrija.
❌ Dados fiscais no pedido da Wake (pendência separada).

### O risco a assumir

O comportamento do endpoint da Wake **não está documentado** — o artigo oficial só menciona URL de rastreamento. Você fica dependente de comportamento não especificado, que pode mudar numa atualização sem aviso. E não existe log do endpoint acessível a você: cada falha futura exigirá teste manual.

> **Se este risco não for aceitável, use o `plano-B-infra-tem-api.md`.**

---

## ⚠️ Três coisas que nunca devem ser feitas

| Nunca | Por quê |
|---|---|
| Desativar "Notificação de Cotações" na Wake **antes** de validar o patch do Sankhya | Você fica sem nenhum embarque com canal válido e perde até o rastreio que hoje funciona |
| Salvar uma regra de evento na Intelipost com os campos de autenticação preenchidos pelo autofill do navegador | Sobrescreve a credencial real e derruba o webhook que hoje funciona |
| Ativar "Reintegrar Pedido" em qualquer situação da Wake | Devolve o pedido à fila de não-integrados. Risco de duplicar documento no ERP |

**Sobre cliques na Intelipost:** clicar no botão de uma condição dentro de uma regra de evento **desmarca** a condição, não expande. Se acontecer, saia **sem salvar**.

---

## FASE 0 — Hoje, sem depender de ninguém

### ☐ 0.1 Teste discriminador — `FALHA NA ENTREGA`

**Faça isto primeiro.** Ele define se este plano é viável.

Num pedido de teste com embarque de canal `Wake_kikkaboobrasil`, alterar o Macro Status para `FALHA NA ENTREGA` (13) e conferir o histórico do pedido na Wake.

| Resultado | Significa | Consequência |
|---|---|---|
| Escreveu `Pedido Devolvido` | Nome único funciona, duplicado não. A causa é a ambiguidade dos dois `Pedido Enviado` | **Plano A viável** — você entrega causa e solução no ticket 5.1 |
| Não escreveu nada | A Wake mapeia poucos macro status | **Plano A fica frágil** — depende de escopo de produto da Wake, não de configuração. Considere o Plano B |

**Resultado obtido:** ________________

---

### ☐ 0.2 Desativar a regra de evento 64734

**Onde:** Intelipost → Entregas → Configurações → Regras de Evento
**O quê:** desativar o toggle de `64734 — Webhook Wake`

Aponta para `abcdesignbrasil.com.br/checkout`, uma página de vitrine, e transmite credenciais Basic a cada evento.

**Validar:** toggle desligado. As regras 65461 e 65462 permanecem ativas.

---

### ☐ 0.3 Rotacionar a API key da Intelipost

A mesma chave está em três lugares: os dois scripts do Sankhya (hardcoded) e o painel da Wake.

**Rotação derruba Wake e Sankhya simultaneamente.** Sequência:

1. Gerar a nova chave na Intelipost
2. Atualizar no painel da Wake
3. Atualizar nos dois scripts do Sankhya
4. Testar uma cotação no site e uma no Sankhya
5. Revogar a chave antiga

**Melhoria:** no Sankhya, mover a chave para um parâmetro do sistema em vez de literal no código. Hoje qualquer usuário com acesso ao Dicionário de Dados consegue lê-la.

---

### ☐ 0.4 Levantar e cancelar o passivo

**Onde:** Intelipost → Entregas → Gestão de Pedidos

Filtrar embarques abertos **sem nota fiscal** — são os criados pela Wake. Cancelar em lote.

Em paralelo:
- ☐ Verificar com os Correios se as PLPs não postadas estão gerando cobrança
- ☐ Conferir se os embarques sem NF têm notificação ao destinatário ativa
- ☐ Conferir se o rastreio `AP291459770BR` teve movimentação real

---

### ☐ 0.5 Verificar automações dependentes de situação

**Onde:** Kommo

Qualquer fluxo disparado por mudança de situação está hoje recebendo eventos incompletos. Levantar quais são, para saber o que volta a funcionar e o que continuará limitado neste plano.

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

Pegue um `EXEMPLO_1` de cada CODEMP e procure o número no admin de cada loja.

| CODEMP | Loja | `sales_channel` |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |

> `AD_CANAL_MKTPLACE` **não serve** — é `NULL` justamente na loja própria.

### ☐ 1.2 `sales_channel` da loja ABC Design

Abrir na Intelipost um embarque criado pela Wake na loja ABC Design (canal preenchido, sem nota fiscal) e copiar a string do campo **Canal de Vendas**, exatamente, com o mesmo case.

**Valor:** ________________

> Kikkaboo já confirmado: `Wake_kikkaboobrasil`, copiado do embarque 695225333.

### ☐ 1.3 Valores de `TIPMOV` e `STATUSNFE`

```sql
SELECT TIPMOV, CODTIPOPER, STATUSNFE, COUNT(*) AS QTD
FROM SANKHYA.TGFCAB
WHERE CODTIPOPER IN (1722, 1728) AND DTNEG >= DATE '2026-07-01'
GROUP BY TIPMOV, CODTIPOPER, STATUSNFE ORDER BY 4 DESC
```

**Valor de NF-e autorizada:** ________________

### ☐ 1.4 Descobrir quem grava `AD_IDINTELIPOST` hoje

Nenhum dos dois scripts grava esse campo, e ele está em 1.207 documentos. Existe um terceiro mecanismo.

Listar **todas** as ações da `TGFCAB` no Dicionário de Dados, não só as duas conhecidas. Se não houver, investigar a Tem Api.

> **Faça antes da Fase 2.4.** Se algo já grava esse campo, pode conflitar com a nova gravação, e a trava anti-reenvio bloquearia envios legítimos.

---

## FASE 2 — Patch no script "Enviar para Intelipost"

**Onde:** Sankhya → Dicionário de Dados → `TGFCAB` → aba Ações → "Enviar para Intelipost"
**Tipo:** `Script (JavaScript)` — editável, sem depender de fornecedor

> **Faça backup do script atual antes de qualquer alteração.**

### ☐ 2.1 Derivar o `sales_channel` junto do armazém

Substituir o bloco que define `originWarehouseCode`:

```javascript
var originWarehouseCode = null;
var salesChannel = null;

if (codemp === "1") {
    originWarehouseCode = "02";
    salesChannel = "Wake_kikkaboobrasil";
} else if (codemp === "2") {
    originWarehouseCode = "01";
    salesChannel = "Wake_abcdesignbrasil";   // ← valor da Fase 1.2
} else if (codemp === "3") {
    originWarehouseCode = "04";
    salesChannel = null;                      // ← definir se houver vendas
} else if (codemp === "4") {
    originWarehouseCode = "03";
    salesChannel = null;                      // ← definir se houver vendas
} else {
    mensagem = "CODEMP nao reconhecido: " + codemp;
}

if (salesChannel == null) {
    mensagem = "Envio bloqueado: canal de vendas nao definido para CODEMP " + codemp;
    return;
}
```

### ☐ 2.2 Corrigir a referência do pedido

Localizar no `selectQuery`:

```javascript
"  'order_number' VALUE c.nunota, " +
```

Substituir por:

```javascript
"  'order_number' VALUE c.AD_PEDIDOMKTPLACE, " +
"  'sales_order_number' VALUE c.AD_PEDIDOMKTPLACE, " +
"  'sales_channel' VALUE '" + salesChannel + "', " +
"  'additional_information' VALUE JSON_OBJECT('nunota' VALUE c.nunota), " +
```

**Por que o ID Wake nos dois campos:** não se sabe qual deles o endpoint da Wake lê. O `NUNOTA` vai em `additional_information`, que a API da Intelipost aceita como pares chave-valor livres.

### ☐ 2.3 Adicionar a trava de estado

Inserir **antes** do bloco `try` que faz o POST:

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

Ajuste os valores conforme a Fase 1.3.

### ☐ 2.4 Gravar o `AD_IDINTELIPOST` no retorno

No bloco de sucesso (`responseCode >= 200 && responseCode < 300`):

```javascript
try {
    var jsonResp = new org.json.JSONObject(response);
    var idIntelipost = jsonResp.getJSONObject("content").get("id");
    var upd = getQuery("native");
    upd.update("UPDATE SANKHYA.TGFCAB SET AD_IDINTELIPOST = '" + idIntelipost +
               "' WHERE NUNOTA = " + Pedido);
} catch (e2) {
    mensagem = "Embarque criado, falha ao gravar ID: " + e2.message;
}
```

> **Confirme o caminho do ID no JSON de retorno** antes de aplicar — pode ser `content.id`, `content.shipment_order_id` ou outro. Rode um envio primeiro e leia o corpo da resposta.

### ☐ 2.5 Corrigir o `JOIN` ambíguo

Localizar:

```javascript
"JOIN AD_APIINTELI ai ON ai.NUMPEDIDO = '" + Pedido + "' AND ai.IDCOTACAO = '" + Cotacao + "' "
```

Com duas sessões de cotação para o mesmo documento, o mesmo `IDCOTACAO` casa com duas linhas, e sem `ORDER BY` o frete enviado é arbitrário.

Correção mínima — usar sempre a cotação mais recente:

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

Buscar pelo **ID do pedido Wake**. Deve aparecer disparo pela regra `65461` com Sucesso.

> Se não aparecer, o `sales_channel` não casou com o filtro. Confira o case da string.

### ☐ 3.3 Conferir o `AD_IDINTELIPOST`

```sql
SELECT NUNOTA, NUMNOTA, AD_PEDIDOMKTPLACE, AD_IDINTELIPOST
FROM SANKHYA.TGFCAB WHERE NUNOTA = <NUNOTA do teste>
```

Preenchido. Clicar o botão de novo — deve ser bloqueado pela trava.

### ☐ 3.4 Conferir o histórico na Wake

Abrir o pedido e ver o histórico. Após o embarque avançar para `Entregue`, deve aparecer escrita com assinatura `Situação alterada através da Integração Intelipost (Jaimito)`.

> Neste plano, `Despachado` e `Em trânsito` **continuarão sem escrever** até que o ticket 5.1 seja resolvido. Isso é esperado.

---

## FASE 4 — Desligar a criação de embarque pela Wake

### ☐ 4.1 Desativar "Notificação de Cotações"

**Onde:** Wake → Fretes >> Integração Intelipost
**Parâmetro:** `Intelipost - Ativar/Desativar notificação de cotações` → desativar

Função documentada: *"Ao ativar, faz o envio do pedido para a Intelipost."* É ele que cria o embarque duplicado.

**Só execute depois da Fase 3 completa e validada.**

> **Efeito colateral positivo:** desativando este parâmetro, a Falha C (Tem Api gravando situação de faturamento prematuramente) deixa de produzir dano. A escrita continua conceitualmente errada, mas não gera mais embarque indevido. **Isso torna o ticket para a Tem Api opcional neste plano.**

### ☐ 4.2 Monitorar o rastreio por uma semana

O parâmetro "Integra a URL de rastreamento" diz *"se a sua integração enviar pedidos para a Intelipost"*. Não está claro se inclui o embarque criado pelo Sankhya.

Se o código de rastreio parar de aparecer nos pedidos, essa é a causa — e vira pergunta para a Wake.

### ☐ 4.3 Confirmar embarque único

Faturar um pedido e conferir na Intelipost que há **um único** registro.

---

## FASE 5 — Ticket na Wake

Este é o **único item que pode destravar a Falha A neste plano**, e ele depende inteiramente da Wake.

### ☐ 5.1 Obter os IDs das situações antes de enviar

**Onde:** `https://api.fbits.net/swagger` → `GET /pedidos/situacaoPedido/{situacoesPedido}`

Rodar com o token de **cada loja separadamente**.

| Nome interno | Descrição | ID | Loja |
|---|---|---|---|
| Pedido Enviado | Em Preparação | | |
| Pedido Enviado | Em trânsito | | |
| Entregue | Entregue | | |
| Pedido Devolvido | Pedido Devolvido | | |

### ☐ 5.2 Enviar o ticket

**Assunto:** Integração Intelipost — mapeamento de macro status para situação do pedido não documentado e incompleto

> O endpoint `https://frete.fbits.net/api/notificacoes/intelipost/kikkaboobrasil` recebe eventos de macro status da Intelipost e responde com sucesso, mas apenas parte deles produz alteração de situação do pedido.
>
> **Evidência — pedido 75098.** Webhooks disparados pela Intelipost, todos com retorno de sucesso registrado no log da Intelipost:
>
> - 03/08/2026 15:41:25 — `Despachado` — nenhuma alteração de situação
> - 03/08/2026 17:00:11 — `Em trânsito` — nenhuma alteração de situação
> - 05/08/2026 — `Entregue` — situação alterada para `Entregue` às 12:51, com a mensagem "Situação alterada através da Integração Intelipost (Jaimito)"
>
> **O comportamento é reproduzível.** Repetimos os testes após ampliar a regra de evento 65461 para incluir **todos** os macro status disponíveis, conforme instrução do artigo *Integração de Frete com a Intelipost*. O resultado foi idêntico.
>
> **Sobre a documentação.** O artigo citado descreve apenas o preenchimento automático da URL de rastreamento no retorno do status 'Despachado'. Não há menção a alteração da situação do pedido. No entanto, o fluxo de integração fornecido pelo suporte indica, no passo 6, que o webhook notifica mudanças de status — citando explicitamente "Enviado" e "Entregue" —, e observamos a escrita de `Entregue` acontecendo.
>
> **Hipótese que levantamos.** Nossa loja possui **duas situações com o nome interno `Pedido Enviado`**: uma com descrição "Em Preparação" e observação "Faturado - Nota fiscal emitida"; outra com descrição "Em trânsito". A situação `Entregue` é única no cadastro. Suspeitamos que a resolução da situação-alvo seja feita por nome, e que a ambiguidade impeça a escrita.
>
> Solicitamos:
> 1. A documentação do mapeamento entre macro status da Intelipost e situações da plataforma, já que essa funcionalidade não consta no artigo público;
> 2. Confirmação de se a resolução da situação-alvo é feita por ID ou por nome;
> 3. Se por nome, orientação sobre como resolver a duplicidade — o campo Nome não é editável pelo lojista;
> 4. Onde consultamos o log de processamento desse endpoint;
> 5. Confirmação do valor esperado no campo Canal de Vendas. O artigo instrui usar "FBITS", mas nossa configuração utiliza nome por loja (`Wake_kikkaboobrasil`), por operarmos duas lojas na mesma conta Intelipost.

### ☐ 5.3 Definir a gravação dos dados fiscais

Número, série, chave e URL da NF-e permanecem vazios no pedido da Wake. Neste plano é pendência separada — definir com Wake e Tem Api quem grava.

---

## FASE 6 — Observabilidade no Sankhya

### ☐ 6.1 Criar regra de evento de retorno para o Sankhya

**Onde:** Intelipost → Regras de Evento → Adicionar nova regra

Mesma configuração da 65461 (condições `Evento Entrando` + `Canal de Vendas`, todos os macro status), com webhook apontando para um endpoint do Sankhya.

### ☐ 6.2 Popular os campos de retorno na `TGFCAB`

Os campos existem e estão vazios em 1.207 de 1.207 documentos:

`AD_MACROSTATUS` · `AD_RASTREIO` · `AD_DATACOLETA` · `AD_DATACOLETAEXP` · `AD_ENTREGA`

Isso transforma o Sankhya em fonte de auditoria consultável por SQL — e é especialmente valioso neste plano, já que você não tem acesso ao log do endpoint da Wake.

### ☐ 6.3 Colunas de auditoria na `AD_APIINTELI`

| Coluna | Tipo | Finalidade |
|---|---|---|
| `DHINCLUSAO` | `DATE` | quando a cotação foi registrada |
| `STATUSPROC` | `VARCHAR2(20)` | pendente / enviado / erro |
| `DHENVIO` | `DATE` | quando o embarque foi criado |
| `RETORNOAPI` | `VARCHAR2(4000)` | corpo da resposta da Intelipost |

### ☐ 6.4 Job de reconciliação diária

Comparar situação na Wake × estado no Sankhya × macro status na Intelipost, listando divergências. **Neste plano a reconciliação é mais importante que no Plano B**, porque você não controla a escrita de situação e não tem log dela.

---

## FASE 7 — Limpeza

### ☐ 7.1 Corrigir a descrição de `Pedido Enviado`

A descrição "Em Preparação" contradiz a observação da própria linha ("Faturado - Nota fiscal emitida").

> ⚠️ Aparece na página do cliente e em e-mails transacionais — a coluna `Email cópia oculta` está preenchida nessa linha. **Mapeie onde o rótulo é consumido antes de trocar.**

### ☐ 7.2 Revisar `originWarehouseCode`

Mapeamento cruza: `1→02`, `2→01`, `3→04`, `4→03`. Conferir contra a lista de armazéns na Intelipost.

### ☐ 7.3 Volume por linha de item no script de cotação

O `JSON_ARRAYAGG` sobre `TGFITE` gera um volume **por linha de item** — inflando o frete apresentado ao cliente.

### ☐ 7.4 Unidade do peso

A documentação da Wake exige peso cadastrado como **inteiro** (`235` correto, `0,235` erro). O script envia decimal em kg. Candidato provável para a divergência 8,7 vs. 15,2 kg.

### ☐ 7.5 Investigar `AD_STATUSLOG`

```sql
SELECT AD_STATUSLOG, COUNT(*) AS QTD
FROM SANKHYA.TGFCAB
WHERE CODTIPOPER = 1728 AND TIPMOV = 'V'
GROUP BY AD_STATUSLOG ORDER BY 2 DESC
```

### ☐ 7.6 Limpar campos órfãos do dicionário

`AD_CIDADE` · `AD_CNPJPARCEIRO` · `AD_CUBAGEMTOTAL` · `AD_DIFALPAGO` · `AD_NUMEROUNICOPEDIDO` · `AD_TIPPESSOA` · `AD_UF`

---

## Métricas

### Cobertura do embarque na loja própria

```sql
SELECT COUNT(*) AS NOTAS_LOJA,
       COUNT(AD_IDINTELIPOST) AS COM_EMBARQUE,
       ROUND(COUNT(AD_IDINTELIPOST) * 100 / NULLIF(COUNT(*), 0), 1) AS PCT
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND AD_CANAL_MKTPLACE IS NULL AND DTNEG >= DATE '2026-08-01'
```

| | Linha de base | Meta |
|---|---|---|
| `PCT` | **37%** | ~100% após Fase 2 |

### Saúde do canal de retorno

```sql
SELECT COUNT(*)              AS COM_EMBARQUE,
       COUNT(AD_MACROSTATUS) AS COM_STATUS,
       COUNT(AD_RASTREIO)    AS COM_RASTREIO
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND AD_IDINTELIPOST IS NOT NULL AND DTNEG >= DATE '2026-08-01'
```

**Linha de base: 1.207 / 0 / 0.** Meta após Fase 6.

### Pedidos travados

Wake → Listagem de Pedidos, filtros combinados:
- **Histórico de Situações** contém "Em Preparação"
- **Situações** (atual) = "Em Preparação"

> Neste plano, esse número **só cai de verdade** depois do ticket 5.1 ser resolvido. Antes disso, os pedidos avançam apenas na entrega.

---

## Resumo de dependências

| Sob seu controle | Depende da Wake |
|---|---|
| 0.1 Teste discriminador | **5.1/5.2 Mapeamento de macro status** |
| 0.2 Desativar regra 64734 | 5.3 Dados fiscais |
| 0.3 Rotacionar API key | |
| 0.4 Cancelar embarques duplicados | |
| 1.1–1.4 Descobertas | |
| 2.1–2.5 Patch no Sankhya | |
| 3.1–3.4 Validação | |
| 4.1–4.3 Desligar criação pela Wake | |
| 6.1–6.4 Observabilidade | |
| 7.1–7.6 Limpeza | |

**Um único item depende de terceiro — mas é o que resolve o sintoma que originou toda a investigação.** Enquanto o ticket 5.1 não for atendido, a situação do pedido continuará avançando apenas na entrega.

Se esse prazo for inaceitável, o `plano-B-infra-tem-api.md` remove essa dependência.

---

*Documento de execução derivado de `diagnostico-integracao-v4.md`.*
