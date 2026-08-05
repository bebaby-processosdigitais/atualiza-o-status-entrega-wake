# Plano B — Resolver pela infraestrutura da Tem Api

**BeBaby Group Importação** · Documento de execução · 05/08/2026
**Diagnóstico de referência:** `diagnostico-integracao-v4.md`

---

## Premissa deste plano

A **Tem Api** passa a consumir os eventos de macro status da Intelipost e a escrever a situação do pedido na Wake via API pública, usando **IDs numéricos** de situação definidos por vocês.

A integração nativa da Wake **permanece ativa** para o preenchimento da URL de rastreamento. Os dois caminhos são complementares, não exclusivos.

### Por que este plano é tecnicamente superior

**O endpoint da API pública resolve por ID, não por nome.**

```
PUT /pedidos/{pedidoId}/status
{ "id": 12345 }
```

A ambiguidade das duas situações `Pedido Enviado` — que é o provável bloqueio do Plano A — **simplesmente não existe** neste caminho. Você passa o número e acabou.

### A infraestrutura já está pronta

O token da Tem Api tem **30 de 31** endpoints do grupo Pedidos habilitados, incluindo tudo o que é necessário:

| Método | Endpoint | Uso neste plano |
|---|---|---|
| `PUT` | `/pedidos/{pedidoId}/status` | escrever a situação |
| `POST` | `/pedidos/{pedidoId}/rastreamento` | **rastreamento _e_ status numa chamada** |
| `GET` | `/pedidos/situacaoPedido/{situacoesPedido}` | obter os IDs de situação |
| `GET` | `/pedidos/{pedidoId}/status` | ler o status atual (não-regressão) |
| `GET` | `/pedidos/{pedidoId}/historicoSituacao` | auditoria |

Isso transforma o que seria um projeto novo em **pedido incremental**: token válido, permissões concedidas, correlação de pedidos já estabelecida.

### O que este plano resolve

✅ Duplicidade de embarque na Intelipost
✅ Embarque com nota fiscal entrando na cadeia
✅ **Situação avançando em todos os macro status, com mapeamento definido por vocês**
✅ **Dados fiscais no pedido da Wake** (via `POST /rastreamento`)
✅ Mapeamento documentado no seu próprio código, auditável
✅ Log de processamento conforme especificado
✅ Passivo financeiro e segurança

### O que custa

Desenvolvimento na Tem Api: um endpoint receptor de webhook e a lógica de tradução. Escopo pequeno, mas é contrato com fornecedor.

> **Se a Tem Api recusar ou o prazo for inviável**, a mesma especificação pode ser implementada em infraestrutura própria — vocês já operam um servidor Node.js. O único ajuste é criar um token dedicado na Wake para essa função, o que inclusive melhora a auditoria (ver 5.4).

---

## ⚠️ Três coisas que nunca devem ser feitas

| Nunca | Por quê |
|---|---|
| Desativar "Notificação de Cotações" na Wake **antes** de validar o patch do Sankhya | Você fica sem nenhum embarque com canal válido e perde o rastreio que hoje funciona |
| Salvar uma regra de evento na Intelipost com os campos de autenticação preenchidos pelo autofill do navegador | Sobrescreve a credencial real e derruba o webhook que hoje funciona |
| Ativar "Reintegrar Pedido" em qualquer situação da Wake | Devolve o pedido à fila de não-integrados. Risco de duplicar documento no ERP |

**Sobre cliques na Intelipost:** clicar no botão de uma condição dentro de uma regra de evento **desmarca** a condição, não expande. Se acontecer, saia **sem salvar**.

---

## FASE 0 — Hoje, sem depender de ninguém

### ☐ 0.1 Desativar a regra de evento 64734

**Onde:** Intelipost → Entregas → Configurações → Regras de Evento
**O quê:** desativar o toggle de `64734 — Webhook Wake`

Aponta para `abcdesignbrasil.com.br/checkout`, uma página de vitrine, e transmite credenciais Basic a cada evento.

### ☐ 0.2 Rotacionar a API key da Intelipost

A mesma chave está nos dois scripts do Sankhya (hardcoded) e no painel da Wake. **Rotação derruba os dois simultaneamente.**

1. Gerar a nova chave na Intelipost
2. Atualizar no painel da Wake
3. Atualizar nos dois scripts do Sankhya
4. Testar uma cotação no site e uma no Sankhya
5. Revogar a chave antiga

**Melhoria:** mover a chave para um parâmetro do sistema no Sankhya. Hoje qualquer usuário com acesso ao Dicionário de Dados consegue lê-la.

### ☐ 0.3 Levantar e cancelar o passivo

**Onde:** Intelipost → Entregas → Gestão de Pedidos

Filtrar embarques abertos **sem nota fiscal** — são os criados pela Wake. Cancelar em lote.

- ☐ Verificar com os Correios se as PLPs não postadas estão gerando cobrança
- ☐ Conferir se os embarques sem NF têm notificação ao destinatário ativa
- ☐ Conferir se o rastreio `AP291459770BR` teve movimentação real

### ☐ 0.4 Verificar automações dependentes de situação

**Onde:** Kommo

Levantar quais fluxos disparam por mudança de situação. **Neste plano todos voltam a funcionar** — vale saber o que vai ser reativado, para não gerar disparos em massa retroativos.

---

## FASE 1 — Descobertas

### ☐ 1.1 Obter os IDs das situações, por loja

**Esta é a descoberta central do plano.** Sem os IDs, não há especificação.

**Onde:** `https://api.fbits.net/swagger` → `GET /pedidos/situacaoPedido/{situacoesPedido}`

Rodar com o token de **cada loja separadamente** — os cadastros podem divergir.

**Kikkaboo:**

| Nome interno | Descrição | ID |
|---|---|---|
| Pedido Enviado | Em Preparação | |
| Pedido Enviado | Em trânsito | |
| Entregue | Entregue | |
| Pedido Devolvido | Pedido Devolvido | |

**ABC Design:**

| Nome interno | Descrição | ID |
|---|---|---|
| Pedido Enviado | Em Preparação | |
| Pedido Enviado | Em trânsito | |
| Entregue | Entregue | |
| Pedido Devolvido | Pedido Devolvido | |

### ☐ 1.2 CODEMP → loja

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

| CODEMP | Loja | `sales_channel` |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |

> `AD_CANAL_MKTPLACE` **não serve** — é `NULL` justamente na loja própria.

### ☐ 1.3 `sales_channel` da loja ABC Design

Abrir na Intelipost um embarque criado pela Wake naquela loja e copiar a string do campo **Canal de Vendas**, exatamente, com o mesmo case.

**Valor:** ________________

> Kikkaboo já confirmado: `Wake_kikkaboobrasil`.

### ☐ 1.4 Valores de `TIPMOV` e `STATUSNFE`

```sql
SELECT TIPMOV, CODTIPOPER, STATUSNFE, COUNT(*) AS QTD
FROM SANKHYA.TGFCAB
WHERE CODTIPOPER IN (1722, 1728) AND DTNEG >= DATE '2026-07-01'
GROUP BY TIPMOV, CODTIPOPER, STATUSNFE ORDER BY 4 DESC
```

**Valor de NF-e autorizada:** ________________

### ☐ 1.5 Descobrir quem grava `AD_IDINTELIPOST` hoje

Nenhum dos dois scripts grava esse campo, e ele está em 1.207 documentos. Existe um terceiro mecanismo — possivelmente a própria Tem Api.

Listar **todas** as ações da `TGFCAB` no Dicionário de Dados. Se não houver, perguntar à Tem Api.

> **Faça antes da Fase 3.4.** Se algo já grava esse campo, conflita com a nova gravação e a trava anti-reenvio bloquearia envios legítimos.

### ☐ 1.6 Verificar o endpoint desabilitado no token

O grupo Pedidos mostra **30/31** habilitados. Identificar qual está desabilitado e confirmar que não é necessário para este plano.

---

## FASE 2 — Especificação para a Tem Api

Esta é a peça central. Envie como especificação, não como pedido genérico.

### ☐ 2.1 Definir o mapeamento

Preencher com os IDs da Fase 1.1:

| Macro status Intelipost | ID Intelipost | Situação Wake | ID situação Kikkaboo | ID situação ABC |
|---|---|---|---|---|
| DESPACHADO | 9 | `Pedido Enviado` — "Em trânsito" | | |
| EM TRÂNSITO | 12 | `Pedido Enviado` — "Em trânsito" | | |
| SAIU PARA ENTREGA | 16 | `Pedido Enviado` — "Em trânsito" | | |
| ENTREGUE | 14 | `Entregue` | | |
| FALHA NA ENTREGA | 13 | *(decisão: `Pedido Devolvido` ou nenhuma escrita)* | | |
| CANCELADO | 7 | `Pedido Cancelado` *(decisão de qual dos 6)* | | |

**Notas de desenho:**

Três macro status apontam para a mesma situação intencionalmente — o fluxo desejado tem quatro estados visíveis ao cliente, não sete. Simplificar reduz ruído e evita criar situações novas.

`FALHA NA ENTREGA` é decisão sua. Recomendação: **não escrever situação nova**, apenas gerar alerta interno. Falha de entrega frequentemente é temporária e se resolve na segunda tentativa — mudar o status do cliente cria ansiedade desnecessária.

### ☐ 2.2 Especificação técnica

**Texto para enviar à Tem Api:**

> ## Solicitação: consumo de eventos Intelipost e escrita de situação na Wake
>
> ### Contexto
>
> A integração nativa da Wake com a Intelipost escreve a situação do pedido apenas no macro status `Entregue`. Os macro status `Despachado` e `Em trânsito` são recebidos pelo endpoint da Wake com retorno HTTP de sucesso, mas não produzem alteração de situação. O comportamento é reproduzível e foi testado com todos os macro status ativos na regra de evento.
>
> Solicitamos que a Tem Api assuma essa função, aproveitando as permissões que o token já possui.
>
> ### Escopo
>
> **1. Endpoint receptor de webhook.**
> Disponibilizar um endpoint HTTPS que receba os eventos de macro status da Intelipost. Configuraremos uma regra de evento na Intelipost apontando para ele, com autenticação Basic.
>
> O payload da Intelipost traz, entre outros campos, o macro status e o `sales_order_number` / `order_number`, que conterá o **ID do pedido na Wake**.
>
> **2. Tradução e escrita.**
> Para cada evento recebido, traduzir o macro status conforme a tabela de mapeamento fornecida e chamar:
>
> ```
> PUT /pedidos/{pedidoId}/status
> { "id": <ID da situação> }
> ```
>
> O `pedidoId` é o valor recebido no `order_number`. **A escrita deve usar o ID numérico da situação**, não o nome — o cadastro possui duas situações com o mesmo nome interno (`Pedido Enviado`), e a resolução por nome é ambígua.
>
> **3. Dados fiscais.**
> Utilizar `POST /pedidos/{pedidoId}/rastreamento`, que grava rastreamento **e** status numa única chamada, para preencher também número, série, chave e URL da NF-e — hoje vazios em todos os pedidos.
>
> ### Requisitos não funcionais
>
> **Idempotência.** Toda escrita deve ser segura para repetir. Um retry de rede ou reenvio de webhook não pode produzir efeito duplicado.
>
> **Não-regressão de status.** Eventos podem chegar fora de ordem. Antes de escrever, consultar `GET /pedidos/{pedidoId}/status` e ignorar qualquer evento que represente retrocesso na jornada (ex: não voltar de `Entregue` para `Em trânsito`). A ordem de precedência é: Em Preparação → Em trânsito → Entregue.
>
> **Log de eventos órfãos.** Todo evento cujo `order_number` não corresponda a um pedido existente na loja deve ser registrado em log consultável e gerar alerta. **Nunca descartar silenciosamente.** A ausência desse controle é o que permitiu que a falha atual operasse sem detecção por 14 meses.
>
> **Log de processamento.** Registro consultável de cada evento recebido, a tradução aplicada, a chamada realizada e o retorno da API da Wake.
>
> **Multi-loja.** O mapeamento de IDs de situação difere entre as lojas kikkaboobrasil e abcdesignbrasil. O roteamento deve considerar a loja de origem.
>
> ### Fora de escopo
>
> A integração nativa da Wake permanecerá ativa para o preenchimento da URL de rastreamento. Esta solicitação não a substitui.

### ☐ 2.3 Pedido complementar — situação de faturamento prematura

**Assunto:** Gravação de situação de faturamento antes da emissão da NF-e

> Identificamos que a Tem Api grava a situação `Pedido Enviado` (observação "Faturado - Nota fiscal emitida") antes de existir nota fiscal emitida no ERP, via `PUT /pedidos/{pedidoId}/status`.
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
> Solicitamos que a gravação da situação de faturamento ocorra somente após a emissão e autorização da NF-e no ERP, e informação de qual gatilho é utilizado hoje.

> **Nota:** este item deixa de ser urgente após a Fase 5.1 (desativar "Notificação de Cotações"), que impede a Wake de criar embarque independentemente de quando a situação é gravada. A escrita continua conceitualmente errada, mas para de causar dano.

---

## FASE 3 — Patch no script "Enviar para Intelipost"

Idêntico ao Plano A — a base no Sankhya é comum aos dois planos.

**Onde:** Sankhya → Dicionário de Dados → `TGFCAB` → aba Ações → "Enviar para Intelipost"
**Tipo:** `Script (JavaScript)` — editável, sem depender de fornecedor

> **Faça backup do script atual antes de qualquer alteração.**

### ☐ 3.1 Derivar o `sales_channel` junto do armazém

```javascript
var originWarehouseCode = null;
var salesChannel = null;

if (codemp === "1") {
    originWarehouseCode = "02";
    salesChannel = "Wake_kikkaboobrasil";
} else if (codemp === "2") {
    originWarehouseCode = "01";
    salesChannel = "Wake_abcdesignbrasil";   // ← valor da Fase 1.3
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

### ☐ 3.2 Corrigir a referência do pedido

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

> **Neste plano essa correção é ainda mais crítica.** O endpoint da Tem Api vai receber o `order_number` no payload do webhook e usá-lo como `pedidoId` na chamada à Wake. Se vier o `NUNOTA`, a chamada falha.

### ☐ 3.3 Adicionar a trava de estado

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

Ajuste os valores conforme a Fase 1.4.

### ☐ 3.4 Gravar o `AD_IDINTELIPOST` no retorno

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

> **Confirme o caminho do ID no JSON de retorno** antes de aplicar. Rode um envio e leia o corpo da resposta.

### ☐ 3.5 Corrigir o `JOIN` ambíguo

```javascript
"JOIN (SELECT * FROM (SELECT ai2.* FROM AD_APIINTELI ai2 " +
"      WHERE ai2.NUMPEDIDO = '" + Pedido + "' AND ai2.IDCOTACAO = '" + Cotacao + "' " +
"      ORDER BY ai2.ID_KEY DESC) WHERE ROWNUM = 1) ai ON 1=1 "
```

Com duas sessões de cotação para o mesmo documento, o mesmo `IDCOTACAO` casa com duas linhas e o frete enviado é arbitrário.

---

## FASE 4 — Nova regra de evento e validação

### ☐ 4.1 Criar a regra de evento apontando para a Tem Api

**Onde:** Intelipost → Regras de Evento → Adicionar nova regra

| Configuração | Valor |
|---|---|
| Nome | `Webhook Status Tem Api - kikkaboobrasil` |
| Condições | `Evento Entrando` + `Canal de Vendas` |
| Canal de Vendas | `Wake_kikkaboobrasil` |
| Macro status | todos os relevantes ao mapeamento da Fase 2.1 |
| Ação | Notificação por Webhook |
| Protocolo / Host / Path | conforme fornecido pela Tem Api |
| Autenticação | Basic, credenciais fornecidas pela Tem Api |

Repetir para a loja abcdesignbrasil.

> **As regras 65461 e 65462 permanecem ativas** — elas continuam responsáveis pelo preenchimento da URL de rastreamento pela integração nativa.

> ⚠️ **Limpe os campos de autenticação** antes de salvar. O navegador faz autofill com `marketplace@bebaby.com.br` e senha, e salvar assim sobrescreve credenciais.

### ☐ 4.2 Validar o patch do Sankhya

Faturar um pedido de teste na Kikkaboo e clicar o botão.

| Verificar | Onde | Esperado |
|---|---|---|
| Canal de Vendas | Intelipost, embarque | `Wake_kikkaboobrasil` preenchido |
| Pedido / Pedido de Venda | Intelipost, embarque | ID do pedido Wake |
| Nota fiscal | Intelipost, embarque | preenchida |
| `AD_IDINTELIPOST` | Sankhya | preenchido |
| Reenvio | Sankhya | bloqueado pela trava |

### ☐ 4.3 Validar a cadeia de status completa

Alterar o macro status na Intelipost e conferir o histórico do pedido na Wake, um por um:

| Macro status | Situação esperada | Assinatura esperada | OK? |
|---|---|---|---|
| DESPACHADO | Em trânsito | *token da Tem Api* | ☐ |
| EM TRÂNSITO | Em trânsito | *token da Tem Api* | ☐ |
| SAIU PARA ENTREGA | Em trânsito | *token da Tem Api* | ☐ |
| ENTREGUE | Entregue | *token da Tem Api* | ☐ |

### ☐ 4.4 Validar não-regressão

Após `Entregue`, alterar o macro status de volta para `Em trânsito` e confirmar que a situação na Wake **não retrocede**.

### ☐ 4.5 Validar o log de órfãos

Disparar um webhook manual na Intelipost com um `order_number` inexistente e confirmar que aparece no log de órfãos da Tem Api, com alerta.

**Onde:** Intelipost → Webhook → "Enviar webhook manualmente"

> ⚠️ Nessa tela, **limpe os campos de usuário e senha** preenchidos pelo autofill antes de enviar.

---

## FASE 5 — Desligar a criação de embarque pela Wake

### ☐ 5.1 Desativar "Notificação de Cotações"

**Onde:** Wake → Fretes >> Integração Intelipost
**Parâmetro:** `Intelipost - Ativar/Desativar notificação de cotações` → desativar

Função documentada: *"Ao ativar, faz o envio do pedido para a Intelipost."*

**Só execute depois da Fase 4 completa e validada.**

### ☐ 5.2 Monitorar o rastreio por uma semana

O parâmetro "Integra a URL de rastreamento" diz *"se a sua integração enviar pedidos para a Intelipost"*. Não está claro se inclui o embarque criado pelo Sankhya.

**Neste plano isso é menos crítico**: se a integração nativa parar de preencher o rastreio, a Tem Api já grava esses dados via `POST /pedidos/{pedidoId}/rastreamento`. Mas vale confirmar antes de assumir.

### ☐ 5.3 Confirmar embarque único

Faturar um pedido e conferir na Intelipost que há **um único** registro.

### ☐ 5.4 Criar token dedicado para a função de status

**Recomendado, não obrigatório.**

Hoje todas as escritas da Tem Api aparecem no histórico como "Atualizado por: Tem Api via API". Um token separado para a função de status faria o histórico mostrar uma assinatura distinta, dando **auditoria permanente** de quem escreveu o quê.

Isso é especialmente útil porque a Tem Api passa a ter duas responsabilidades distintas de escrita: a situação de faturamento e a situação logística.

---

## FASE 6 — Observabilidade no Sankhya

### ☐ 6.1 Regra de evento de retorno para o Sankhya

Nova regra, mesmo filtro de canal, webhook apontando para endpoint do Sankhya. Pré-requisito de 6.2.

### ☐ 6.2 Popular os campos de retorno na `TGFCAB`

Existem e estão vazios em 1.207 de 1.207 documentos:

`AD_MACROSTATUS` · `AD_RASTREIO` · `AD_DATACOLETA` · `AD_DATACOLETAEXP` · `AD_ENTREGA`

> **Alternativa mais econômica neste plano:** a Tem Api já estará recebendo esses eventos e já se comunica com o Sankhya. Vale pedir que ela grave nesses campos no mesmo fluxo, dispensando uma quarta regra de evento na Intelipost.

### ☐ 6.3 Colunas de auditoria na `AD_APIINTELI`

| Coluna | Tipo | Finalidade |
|---|---|---|
| `DHINCLUSAO` | `DATE` | quando a cotação foi registrada |
| `STATUSPROC` | `VARCHAR2(20)` | pendente / enviado / erro |
| `DHENVIO` | `DATE` | quando o embarque foi criado |
| `RETORNOAPI` | `VARCHAR2(4000)` | corpo da resposta da Intelipost |

### ☐ 6.4 Job de reconciliação diária

Comparar situação na Wake × estado no Sankhya × macro status na Intelipost, listando divergências. Rede de segurança para webhook perdido.

---

## FASE 7 — Limpeza

### ☐ 7.1 Corrigir a descrição de `Pedido Enviado`

A descrição "Em Preparação" contradiz a observação da própria linha ("Faturado - Nota fiscal emitida").

> ⚠️ Aparece na página do cliente e em e-mails transacionais. **Mapeie onde o rótulo é consumido antes de trocar.**

> **Neste plano a correção é opcional** — o mapeamento por ID funciona independentemente do rótulo. Mas manter um rótulo enganoso confunde a operação.

### ☐ 7.2 Revisar `originWarehouseCode`

Mapeamento cruza: `1→02`, `2→01`, `3→04`, `4→03`. Conferir contra a lista de armazéns na Intelipost.

### ☐ 7.3 Volume por linha de item no script de cotação

O `JSON_ARRAYAGG` sobre `TGFITE` gera um volume **por linha de item** — inflando o frete apresentado ao cliente.

### ☐ 7.4 Unidade do peso

A documentação da Wake exige peso cadastrado como **inteiro** (`235` correto, `0,235` erro). Candidato provável para a divergência 8,7 vs. 15,2 kg.

### ☐ 7.5 Investigar `AD_STATUSLOG`

```sql
SELECT AD_STATUSLOG, COUNT(*) AS QTD
FROM SANKHYA.TGFCAB
WHERE CODTIPOPER = 1728 AND TIPMOV = 'V'
GROUP BY AD_STATUSLOG ORDER BY 2 DESC
```

### ☐ 7.6 Limpar campos órfãos do dicionário

`AD_CIDADE` · `AD_CNPJPARCEIRO` · `AD_CUBAGEMTOTAL` · `AD_DIFALPAGO` · `AD_NUMEROUNICOPEDIDO` · `AD_TIPPESSOA` · `AD_UF`

### ☐ 7.7 Ticket informativo na Wake

Mesmo resolvendo por conta própria, vale registrar o comportamento na Wake. O texto completo está no `plano-A-webhooks-intelipost-wake.md`, seção 5.2.

Duas razões: se eles corrigirem, você ganha redundância; e o comportamento não documentado pode afetar outros lojistas.

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
| `PCT` | **37%** | ~100% após Fase 3 |

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

> **Neste plano esse número cai assim que a Fase 4 entrar em produção** — não depende de terceiro além da própria Tem Api.

### Log de órfãos

Após a Fase 4, acompanhar o log de eventos órfãos da Tem Api. **Deve ficar em zero.** Qualquer entrada indica pedido fora de correlação, e é o sinal de alerta que faltou nos últimos 14 meses.

---

## Resumo de dependências

| Sob seu controle | Depende da Tem Api |
|---|---|
| 0.1 Desativar regra 64734 | 2.2 Endpoint receptor e tradução |
| 0.2 Rotacionar API key | 2.3 Situação de faturamento prematura *(opcional após 5.1)* |
| 0.3 Cancelar embarques duplicados | |
| 1.1–1.6 Descobertas | |
| 2.1 Definir o mapeamento | |
| 3.1–3.5 Patch no Sankhya | |
| 4.1 Criar a regra de evento | |
| 4.2–4.5 Validação | |
| 5.1–5.4 Desligar criação pela Wake | |
| 6.1–6.4 Observabilidade | |
| 7.1–7.7 Limpeza | |

**Um único item depende de terceiro, e o escopo dele está inteiramente especificado neste documento.** Diferente do Plano A, você define o mapeamento, o comportamento fica no código de quem você contrata, e não há dependência de comportamento não documentado de plataforma.

---

*Documento de execução derivado de `diagnostico-integracao-v4.md`. A base no Sankhya (Fase 3) é idêntica à do `plano-A-webhooks-intelipost-wake.md` — execute-a independentemente da escolha entre os planos.*
