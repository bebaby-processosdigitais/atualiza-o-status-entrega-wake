# Diagnóstico da Integração Wake ↔ Sankhya ↔ Intelipost

**BeBaby Group Importação** · Lojas kikkaboobrasil e abcdesignbrasil · Conta Intelipost 70552
**Período da análise:** 03–05/08/2026
**Versão 4** — consolidada. Substitui as v1, v2 e v3.

**Documentos de execução derivados deste relatório:**
- `plano-A-webhooks-intelipost-wake.md` — resolve pela integração nativa da Wake
- `plano-B-infra-tem-api.md` — resolve pela infraestrutura da Tem Api

---

## Índice

1. [Sumário executivo](#1-sumário-executivo)
2. [Topologia real](#2-topologia-real)
3. [As três falhas](#3-as-três-falhas)
4. [Caso de referência](#4-caso-de-referência)
5. [Evidências no banco Sankhya](#5-evidências-no-banco-sankhya)
6. [Evidências de webhook e status](#6-evidências-de-webhook-e-status)
7. [O problema do mapeamento de status](#7-o-problema-do-mapeamento-de-status)
8. [Permissões do token Tem Api](#8-permissões-do-token-tem-api)
9. [O que a documentação oficial diz](#9-o-que-a-documentação-oficial-diz)
10. [Hipóteses testadas e descartadas](#10-hipóteses-testadas-e-descartadas)
11. [Diagnóstico consolidado](#11-diagnóstico-consolidado)
12. [Os dois caminhos de solução](#12-os-dois-caminhos-de-solução)
13. [Monitoramento](#13-monitoramento)
14. [Pendências abertas](#14-pendências-abertas)
15. [Anexos](#15-anexos)

---

## 1. Sumário executivo

O sintoma relatado — situação do pedido congelada em "Em Preparação" — tem **três causas independentes**. É a combinação delas que fez o problema resistir a todos os testes intermediários.

Cada venda da loja própria gera **dois embarques** na Intelipost:

| | **Caminho 1** — criado pela Wake | **Caminho 2** — criado pelo Sankhya |
|---|---|---|
| `sales_channel` | `Wake_kikkaboobrasil` ✅ | **ausente do payload** ❌ |
| `order_number` | ID do pedido Wake ✅ | `NUNOTA` ❌ |
| Nota fiscal | **não tem** | **tem** ✅ |
| Peso/cubagem | catálogo Wake | real da nota ✅ |
| Webhook dispara? | **sim** | **não** |

### As três falhas

**Falha A — mapeamento de status incompleto.**
Testado com **todos** os macro status ativos na regra de evento. Reproduzível:

| Macro status Intelipost | Retorno HTTP | Escreveu situação? |
|---|---|---|
| `Despachado` (9) | Sucesso | **não** |
| `Em trânsito` (12) | Sucesso | **não** |
| `Entregue` (14) | Sucesso | **sim** |

**Falha B — `sales_channel` ausente no payload do Sankhya.**
A regra de webhook 65461 filtra por Canal de Vendas. O script não envia o campo. O embarque que carrega a nota fiscal **nunca gera webhook**.

**Falha C — situação de faturamento gravada prematuramente.**
A Wake cria o pedido logístico quando o pedido atinge a situação que ela trata como faturado. A **Tem Api grava essa situação antes de existir NF**. No caso de referência: situação sinalizada às 13:30, NF emitida às 16:03. A Wake obedeceu corretamente e criou o embarque com dados de checkout.

### O que ficou claro sobre a solução

**Não existe tela de mapeamento de status em nenhum sistema.** A regra da Intelipost só dispara o webhook — confirmado que a única ação configurada é "Notificação por Webhook". A tradução de macro status em situação acontece dentro do endpoint `frete.fbits.net`, em código da Wake, sem exposição ao lojista. E o campo `Nome` das situações **não é editável**.

Isso produz **dois caminhos possíveis**, detalhados na §12 e em documentos separados.

---

## 2. Topologia real

> As versões anteriores deste relatório atribuíram o Caminho 1 à Tem Api. **Estava errado.** A Wake possui integração **nativa** com a Intelipost.

| Sistema | Papel | Identificador |
|---|---|---|
| **Wake Commerce** | Loja B2C. Cota **e cria embarque** na Intelipost via integração nativa. Recebe webhooks | ID do pedido (`74923`, `75098`) |
| **Tem Api** | Traz o pedido Wake → Sankhya. Grava a situação de faturamento via `PUT /pedidos/{id}/status` | — |
| **Sankhya** | Revisão, cotação, faturamento. Cria embarque via botão de ação | `NUNOTA` (`194260` pedido, `194280` nota) |
| **Intelipost** | Cotação, embarques, disparo de webhooks por regra de evento | `ID Intelipost` (`695250186`) |

### Assinaturas de escrita no histórico da Wake

**Esta é a ferramenta de diagnóstico mais útil de toda a investigação.** Permite identificar a origem de qualquer mudança de situação sem inferência.

| Mensagem no histórico | Origem |
|---|---|
| `Situação alterada através da Integração Intelipost (Jaimito)` | **integração nativa Wake ↔ Intelipost** |
| `Atualizado por: Tem Api via API` | **Tem Api**, via `PUT /pedidos/{id}/status` |
| `Situação alterada pelo Gateway de Pagamento` | gateway |
| `Insert by orders` | criação do pedido |

### Configuração da integração nativa

**Menu:** Fretes >> Integração Intelipost
**Documentação:** `atendimento.wake.tech`, artigo 21406554648471 — *Integração de Frete com a Intelipost* (abril/2025)

| Parâmetro | Valor atual | Função documentada |
|---|---|---|
| Apresentação de Cotações da Intelipost | Ativo | aplica desconto só na cotação mais barata |
| **Notificação de Cotações** | **Ativo** ⚠️ | **"Ao ativar, faz o envio do pedido para a Intelipost"** |
| Validar promoção de Frete Grátis | Ativo | envia info de frete grátis |
| Centros de Distribuição | `25,1032` | CDs válidos |
| Token de Autenticação | *preenchido* | — |
| URL de integração | `https://api.intelipost.com.br/api/v1/quote_...` | — |
| Tempo Máximo de Busca de Cotações | `3` | segundos |
| Tipo de prioridade para cálculo de fretes | `2` | — |
| Integra a URL de rastreamento | *a verificar* | preenche URL de rastreio no status `Despachado` |
| Enviar CNPJ para `tax_id` (TDE/TDA) | *a verificar* | aplica taxas de dificuldade |

### O fluxo oficial (fornecido pelo suporte Wake)

| Passo | Sistema | Ação |
|---|---|---|
| 1 | Wake | Cotação no carrinho |
| 2 | Intelipost | Calcula frete, gera **ID de Cotação** |
| 3 | Wake | Pedido criado, ID de Cotação vinculado |
| 4 | Wake | **Pedido atinge status "Faturado". A plataforma valida se a notificação de pedido está ativa** |
| 5 | Wake → Intelipost | Envia criação do pedido logístico, com o ID de Cotação |
| 6 | Intelipost → Wake | Webhook notifica mudanças de status (ex: `Enviado`, depois `Entregue`) |

**O passo 4 é a origem da Falha C.** O gatilho é o pedido atingir a situação de faturado — e a Tem Api grava essa situação prematuramente.

**O passo 6 é a promessa não cumprida.** Ele afirma que o webhook notifica mudanças de status, citando `Enviado` explicitamente. Na prática, só `Entregue` produz escrita.

### Configuração do webhook (instrução oficial do suporte)

```
Protocolo:     HTTPS (sempre)
Host:          frete.fbits.net/
Path:          api/notificacoes/intelipost/nomedaloja
Porta:         (vazio)
Autenticação:  Basic
```

> A **barra dupla** resultante (`frete.fbits.net//api/...`) é o padrão instruído pela Wake. **Não é defeito.**

---

## 3. As três falhas

```
                    Intelipost: evento de macro status
                              │
              ┌───────────────┴───────────────┐
              │                               │
    Caminho 1 (Wake)                Caminho 2 (Sankhya)
    canal preenchido                canal AUSENTE
              │                               │
    regra 65461 CASA              regra 65461 NÃO CASA
              │                               │
              ▼                               ▼
   POST frete.fbits.net              nenhum webhook
              │                          FALHA B
        HTTP Sucesso
              │
   ┌──────────┴──────────┐
   │ Despachado → nada   │
   │ Em trânsito → nada  │  FALHA A
   │ Entregue → escreve  │
   └─────────────────────┘

    ─────────────────────────────────────────────

    FALHA C: Tem Api grava situação de faturamento
             antes da NF existir → Wake cria embarque
             do Caminho 1 com dados de checkout
```

O embarque que chega na Wake é o que **não tem nota fiscal**, e ele só move status na entrega. O embarque que **tem** a nota fiscal nunca chega.

---

## 4. Caso de referência

**Cliente:** NILTON JOSE DE ALMEIDA COSTA JUNIIR · CPF 01499644396 · Belo Horizonte/MG · CEP 30320-080

| Sistema | Identificador |
|---|---|
| Wake | pedido `74923`, loja `Wake_kikkaboobrasil` |
| Sankhya — pedido | `NUNOTA 194260`, `TIPMOV P`, TOP `1722` |
| Sankhya — nota | `NUNOTA 194280`, `TIPMOV V`, TOP `1728`, `NUMNOTA 48122` |
| NF-e | 48122, série 1, R$ 1.979,10 |

### Os dois embarques

| | **Caminho 1 — Wake** | **Caminho 2 — Sankhya** |
|---|---|---|
| `order_number` enviado | `74923` ✅ | `194280` ❌ |
| `sales_channel` | `Wake_kikkaboobrasil` ✅ | **ausente** ❌ |
| ID Intelipost | 695225333 | 695250186 |
| Cotação | 935450548146119 | 998485357346617 / 263001126033235 |
| Transportadora | Correios PAC | Rodonaves (Geral) Sorocaba |
| Volume | `2252` | `BOX` |
| Peso | 8,7 kg | 15,2 kg |
| Dimensões | 52 × 88 × 14 cm | 30 × 53 × 92 cm |
| PLP | 179315307 | 179344156 |
| Rastreio | `AP291459770BR` | — |
| Nota fiscal | **ausente** | **48122, série 1** |
| Custo / Frete cobrado | R$ 69,67 / R$ 0,00 | — / R$ 150,99 |
| Prazo | 9 dias úteis | 2 dias úteis |
| **Webhook** | **31/07 14:55:50, Sucesso** | **nenhum** |

### Timeline

```
31/07 13:30     Caminho 1: CRIADO (Embarcador)
31/07 14:55     Caminho 1: criado na transportadora + DESPACHADO
31/07 14:55:50  ► webhook regra 65461 → Sucesso
31/07 16:03     Caminho 2: CRIADO + ETIQUETA CRIADA   ← NF emitida aqui
31/07 16:30     Caminho 2: criado na transportadora + DESPACHADO
                ► nenhum webhook
```

A NF foi emitida às 16:03. A Wake já havia criado embarque às 13:30 — **duas horas e meia antes**.

---

## 5. Evidências no banco Sankhya

> **Sempre qualifique `SANKHYA.`** — existe um schema `TESTE` espelhado. Sem qualificar, os resultados voltam duplicados.

### Q1 — Lógica de Intelipost no banco

```sql
SELECT NAME, TYPE, LINE, TEXT FROM ALL_SOURCE
WHERE UPPER(TEXT) LIKE '%INTELIPOST%' ORDER BY NAME, LINE
```

Apenas `AD_APIINTELI_TRG`, trigger de sequence. **Nenhuma stored procedure conversa com a Intelipost** — os botões são `Script (JavaScript)`, confirmado depois pelo código-fonte.

### Q2 — Estrutura da `AD_APIINTELI`

6 colunas: `ID_KEY`, `ID_MAIN`, `VLRFRETE`, `NUMPEDIDO`, `METODOENVIO`, `IDCOTACAO`.

**Sem coluna de data, hora ou status de processamento.** É rascunho de payload, não trilha de auditoria. `NUMPEDIDO` é `VARCHAR2(100)` livre, sem constraint.

### Q3 — Quem lê ou escreve nela

Apenas o trigger. Confirma camada de aplicação.

### Q4 — Dados do caso

```sql
SELECT * FROM SANKHYA.AD_APIINTELI
WHERE NUMPEDIDO IN ('74923', '194280') ORDER BY ID_KEY
```

6 linhas, **todas** com `NUMPEDIDO = 194280`:

| ID_KEY | ID_MAIN | VLRFRETE | METODOENVIO | IDCOTACAO |
|---|---|---|---|---|
| 54777 | `194280,998485357346617` | 123,71 | 1 | 1 |
| 54778 | `194280,998485357346617` | **150,99** | **17155** | 2 |
| 54779 | `194280,998485357346617` | 306,81 | 2 | 3 |
| 54862 | `194280,263001126033235` | 123,71 | 1 | 1 |
| 54863 | `194280,263001126033235` | **150,99** | **17155** | 2 |
| 54864 | `194280,263001126033235` | 306,81 | 2 | 3 |

Cache de cotações. `ID_MAIN` = `NUNOTA,ID_cotação_Intelipost`. Duas sessões para a mesma carga. `150,99` / `17155` corresponde ao frete do Caminho 2 — confirma a origem. **O lado Sankhya nunca usou o ID Wake.**

`METODOENVIO` são todos IDs reais (o script grava `delivery_method_id`). `IDCOTACAO` é apenas `i + 1`, índice de exibição.

### Q5 — A cotação do Caminho 1 passou pelo ERP?

```sql
SELECT * FROM SANKHYA.AD_APIINTELI WHERE ID_MAIN LIKE '%935450548146119%'
```

**Vazio.** Confirma que o Caminho 1 é da integração nativa da Wake.

### Q6 — Campos da `TGFCAB`: dicionário vs. físico

```sql
SELECT D.NOMECAMPO, D.DESCRCAMPO,
       CASE WHEN T.COLUMN_NAME IS NULL
            THEN 'SO NO DICIONARIO' ELSE 'EXISTE' END AS SITUACAO
FROM TDDCAM D
LEFT JOIN ALL_TAB_COLUMNS T
       ON T.OWNER = 'SANKHYA' AND T.TABLE_NAME = 'TGFCAB'
      AND T.COLUMN_NAME = D.NOMECAMPO
WHERE D.NOMETAB = 'TGFCAB' AND D.NOMECAMPO LIKE 'AD%'
ORDER BY SITUACAO, D.NOMECAMPO
```

**Existem fisicamente:** `AD_PEDIDOMKTPLACE` (ID Wake), `AD_IDINTELIPOST`, `AD_MACROSTATUS`, `AD_STATUSLOG`, `AD_RASTREIO`, `AD_DATACOLETA`, `AD_DATACOLETAEXP`, `AD_ENTREGA`, `AD_VALORFRETE`, `AD_CANAL_MKTPLACE`.

**Órfãos (`ORA-00904`):** `AD_CIDADE`, `AD_CNPJPARCEIRO`, `AD_CUBAGEMTOTAL`, `AD_DIFALPAGO`, `AD_NUMEROUNICOPEDIDO`, `AD_TIPPESSOA`, `AD_UF`.

"Macro Status" é vocabulário da Intelipost — esses campos foram criados para receber o retorno dela. Há também uma família VTEX, indicando que a customização nasceu na era VTEX e foi adaptada para a Wake.

### Q7 — Pedido e nota lado a lado

| NUNOTA | NUMNOTA | TIPMOV | TOP | `AD_PEDIDOMKTPLACE` | `AD_IDINTELIPOST` | `AD_MACROSTATUS` | `AD_STATUSLOG` | `AD_RASTREIO` | `AD_VALORFRETE` |
|---|---|---|---|---|---|---|---|---|---|
| 194280 | 48122 | V | 1728 | **74923** | *(vazio)* | *(vazio)* | 2 | *(vazio)* | 150,99 |
| 194260 | 32766 | P | 1722 | **74923** | *(vazio)* | *(vazio)* | *(vazio)* | *(vazio)* | 150,99 |

**Conclusão central:** `AD_PEDIDOMKTPLACE = 74923` **nas duas linhas**. A chave estava disponível, propaga corretamente no faturamento, e o script optou por enviar o `NUNOTA`.

### Q8 — Volume de preenchimento

```sql
SELECT COUNT(*) AS TOTAL,
       COUNT(AD_PEDIDOMKTPLACE) AS COM_ID_WAKE,
       COUNT(AD_IDINTELIPOST)   AS COM_ID_INTELIPOST,
       COUNT(AD_MACROSTATUS)    AS COM_MACROSTATUS,
       COUNT(AD_RASTREIO)       AS COM_RASTREIO
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728 AND DTNEG >= DATE '2026-06-01'
```

| TOTAL | COM_ID_WAKE | COM_ID_INTELIPOST | COM_MACROSTATUS | COM_RASTREIO |
|---|---|---|---|---|
| 2.573 | 2.483 (96,5%) | 154 | **0** | **0** |

### Q9 — Evolução mensal

| Período | Notas | Com ID Intelipost |
|---|---|---|
| 2025-01 a 2025-05 | 787 / 651 / 778 / 860 / 962 | **0** em todos |
| 2025-06 a 2025-12 | 793 / 751 / 948 / 1.373 / 1.777 / 2.218 / 1.297 | 31 / 58 / 90 / 96 / 107 / 191 / 84 |
| 2026-01 a 2026-07 | 764 / 799 / 777 / 1.005 / 865 / 1.038 / 1.464 | 63 / 67 / 87 / 97 / 82 / 62 / 83 |

Começa em **junho/2025**, faixa estável por 14 meses. As regras de webhook são de maio/junho de **2026** — camadas de implantação distintas ao longo de mais de um ano.

### Q10 — Recorte por canal

| Canal | Notas | Com ID Intelipost |
|---|---|---|
| SHOPEE | 3.498 | 0 |
| MERCADO_LIVRE | 1.617 | 0 |
| **SEM CANAL** (loja própria) | **1.482** | **550 (37%)** |
| AMAZON_GLOBAL | 171 | 0 |
| MAGALU / MAGAZINE_LUIZA / MELI / SHPS | 7 / 5 / 2 / 1 | 0 |

Marketplaces expedem por logística própria — zero é correto. A taxa relevante é da loja própria: **37%**.

> ⚠️ `AD_CANAL_MKTPLACE` é **NULL** na loja própria. **Não serve** para determinar a loja de origem no patch.

### Q11 — O número à prova de contestação

```sql
SELECT COUNT(*) AS COM_EMBARQUE,
       COUNT(AD_MACROSTATUS) AS COM_STATUS,
       COUNT(AD_RASTREIO)    AS COM_RASTREIO
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728 AND AD_IDINTELIPOST IS NOT NULL
```

| COM_EMBARQUE | COM_STATUS | COM_RASTREIO |
|---|---|---|
| **1.207** | **0** | **0** |

> **Em 100% dos documentos que comprovadamente geraram embarque na Intelipost, ao longo de 14 meses, o retorno de macro status e rastreio nunca foi gravado no Sankhya.**

**Nota:** nenhum dos dois scripts grava `AD_IDINTELIPOST`. Existe um **terceiro mecanismo** não identificado. Ver P8.

---

## 6. Evidências de webhook e status

### Q12 — Regras de evento na Intelipost

| Prior. | ID | Nome | Criado | Ativo | Destino |
|---|---|---|---|---|---|
| 1 | 60190 | Não altera status Entregue | 07/03/2025 | não | — |
| 2 | 60745 | Re-calcular previsão de entrega | 01/05/2025 | não | — |
| 3–8 | 60184–60189 | E-mail: Criado, Despachado, Em Trânsito, Saiu para Entrega, Entregue, Cancelado | 07/03/2025 | não | — |
| 9 | **64734** | Webhook Wake | 12/05/2026 | **SIM** ⚠️ | `abcdesignbrasil.com.br/checkout` |
| 10 | **65461** | Webhook Wake_kikkaboobrasil | 22/06/2026 | **SIM** | `frete.fbits.net//api/notificacoes/intelipost/kikkaboobrasil` |
| 11 | **65462** | Webhook Wake_abcdesignbrasil | 22/06/2026 | **SIM** | *(presumido equivalente)* |

**Regra 65461 — correta:**
- Condições: `Evento Entrando` + `Canal de Vendas`
- Ação única: Notificação por Webhook (Destino "Avançado", Basic)
- Macro status inicialmente selecionados: DESPACHADO (9), EM TRÂNSITO (12), FALHA NA ENTREGA (13), ENTREGUE (14), SAIU PARA ENTREGA (16)
- **Posteriormente ampliada para todos os macro status disponíveis, sem mudança de comportamento**

**Regra 64734 — incorreta:**
- Condição: **apenas** `Evento Entrando` — sem filtro de canal
- Destino: página de checkout de uma vitrine
- `Enviar para: Cliente`
- Resíduo de 12/05/2026, anterior às regras por loja

**Conclusões:**
- As regras de evento **não alteram status**. O dropdown oferece `Substituição de status` e `Não alterar status`, mas a 65461 usa **apenas** Notificação por Webhook. A conversão é 100% responsabilidade do endpoint da Wake.
- Existe um macro status `MANTER STATUS ANTERIOR` (ID 30000), útil para não-regressão.

### Q13 — Teste comparativo: os dois embarques da mesma venda

**Período:** 06/07 a 31/07/2026 · **Aba:** Todos envios

| Busca | Resultado |
|---|---|
| `74923` (Caminho 1) | **1 webhook** — 31/07 14:55:50, `Despachado`, regra 65461, **Sucesso** |
| `194280` (Caminho 2, **com NF**) | **Nenhum webhook encontrado** |

1. A retenção de 30 dias não explica o vazio — o registro do 74923 está lá.
2. Eventos de `Fonte: Embarcador` **disparam** webhook normalmente.
3. O embarque com a nota fiscal não gera webhook nenhum.
4. A única diferença estrutural é o `sales_channel`.

> **O webhook funciona corretamente, e entrega o embarque errado.**

### Q14 — Histórico de situação do pedido 75098

**Pedido Wake `75098`** (Maria Luiza Mendes, São José/SC), criado 02/08 19:17. Embarque Correios PAC, frete R$ 16,20, referenciado pelo ID Wake.

**Campos de rastreio e NF na Wake:**

| Campo | Valor |
|---|---|
| Cód. Rastreamento | `AP301250997BR` ✅ |
| Url Rastreamento | `https://status.ondeestameupedido.com/tracking/de598276...` ✅ |
| Nota fiscal / Chave / Série / Url NFE | *(todos vazios)* ❌ |
| Data de envio | *(vazio)* ❌ |
| CFOP | `0` |

**Cruzamento webhook × histórico:**

| Webhook Intelipost | Retorno | Escrita no histórico |
|---|---|---|
| 03/08 15:41:25 — `Despachado` | Sucesso | **nenhuma da integração Intelipost** |
| 03/08 17:00:11 — `Em trânsito` | Sucesso | **nenhuma** |
| 05/08 — `Entregue` | Sucesso | **05/08 12:51 — "Situação alterada através da Integração Intelipost (Jaimito)" → `Entregue`** ✅ |

A escrita de 03/08 15:41 (`Em Preparação`) tem assinatura **"Atualizado por: Tem Api via API"**. A coincidência de minuto com o webhook `Despachado` foi coincidência.

### Q15 — Reteste com todos os macro status ativos

Após ampliar a seleção da regra 65461 para **todos** os macro status disponíveis, conforme instrução da documentação oficial da Wake, os testes foram repetidos.

**Resultado: comportamento idêntico.** `Entregue` escreve situação; `Em trânsito` não escreve, de nenhuma maneira.

**Isso elimina** a hipótese de seleção incompleta de eventos, e confirma que o comportamento é **reproduzível e determinístico** — não intermitência nem timing.

---

## 7. O problema do mapeamento de status

### Não existe tela de mapeamento

Este é o núcleo do problema, e a razão pela qual ele não pode ser resolvido por configuração:

| Sistema | O que oferece | O que não oferece |
|---|---|---|
| **Intelipost** | seleção de macro status que disparam webhook | tradução para situações da Wake |
| **Wake — Situações** | edição de **Descrição** e **Observação** | edição do campo **Nome**; nenhum mapeamento |
| **Wake — endpoint nativo** | conversão interna, em código | qualquer exposição ou log ao lojista |

### Situações cadastradas na Wake (loja ABC Design)

| Nome interno | Descrição exibida | Observação |
|---|---|---|
| Pago | Pago | Pago |
| Aguardando Pagamento | Aguardando Pagamento | Aguardando Liberação |
| Pedido Cancelado *(×6)* | Pedido Cancelado | Cartão Temp. Negado / Cartão Negado / Fraude / Suspeito de Fraude / Boleto Expirado / Cancelado |
| **Pedido Enviado** | **Em Preparação** ⚠️ | **Faturado - Nota fiscal emitida** |
| Pedido Autorizado | Pedido Autorizado | Autorizado |
| **Pedido Enviado** | **Em trânsito** ⚠️ | Em trânsito |
| Pedido Devolvido | Pedido Devolvido | Pedido devolvido pelo Correio |
| Documentos Para Compra | Documentos Para Compra | Analise de Risco |
| Pedido Aprovado Analise | Pedido Aprovado Analise | Aprovado Analise |
| Recebido | Recebido | Produto encomendado chegou |
| Separado | Separado | Produto existe em estoque |
| Encomendado | Encomendado | Produto não existe em estoque |
| Entregue | Entregue | Entregue |

**O vocabulário está completo.** Existem slots para faturado, trânsito, entregue e devolvido. **Nenhuma situação nova precisa ser criada.**

E o desenho original era exatamente o fluxo desejado: alguém cadastrou **duas** situações `Pedido Enviado` de propósito — uma para "faturado, NF emitida" e outra para "em trânsito".

### As duas hipóteses restantes

| # | Hipótese | Consequência |
|---|---|---|
| **A** | O endpoint da Wake mapeia poucos macro status, possivelmente só `Entregue` | Pedir ampliação da cobertura |
| **B** | O endpoint resolve a situação **por nome**, e os dois `Pedido Enviado` criam ambiguidade | Pedir desambiguação — e o lojista não pode fazer, pois `Nome` não é editável |

**Padrão observado que sustenta a hipótese B:**

| Nome interno | Quantas situações | Escreve? |
|---|---|---|
| `Entregue` | 1 — único | ✅ |
| `Pedido Enviado` | **2** | ❌ |
| `Pedido Devolvido` | 1 — único | **a testar** |
| `Pedido Cancelado` | 6 | a testar |

**Teste discriminador (pendente):** acionar `FALHA NA ENTREGA` (13) e verificar se escreve `Pedido Devolvido`, que tem nome único.

- **Escreveu** → hipótese **B** confirmada. Nome único funciona, duplicado não.
- **Não escreveu** → hipótese **A**. A Wake mapeia pouca coisa.

### O mapeamento desejado

Com o vocabulário existente, sem criar nada:

| Macro status Intelipost | ID | Situação Wake | ID situação |
|---|---|---|---|
| DESPACHADO | 9 | `Pedido Enviado` (desc. "Em trânsito") | *a obter* |
| EM TRÂNSITO | 12 | `Pedido Enviado` (desc. "Em trânsito") | *a obter* |
| SAIU PARA ENTREGA | 16 | `Pedido Enviado` (desc. "Em trânsito") | *a obter* |
| ENTREGUE | 14 | `Entregue` | *a obter* |
| FALHA NA ENTREGA | 13 | `Pedido Devolvido` ou nenhuma *(decisão)* | *a obter* |

Três macro status apontam para a mesma situação intencionalmente: o fluxo desejado tem quatro estados visíveis ao cliente, não sete.

**Para obter os IDs:** Swagger → `GET /pedidos/situacaoPedido/{situacoesPedido}` ou "Retorna todas as situações de pedido da loja", **com o token de cada loja separadamente**.

---

## 8. Permissões do token Tem Api

Levantamento na tela de configuração de permissões do token, grupo **Pedidos (30/31 endpoints habilitados)**.

### Endpoints relevantes já habilitados

| Método | Endpoint | Descrição | Relevância |
|---|---|---|---|
| `PUT` | `/pedidos/{pedidoId}/status` | Atualiza a situação do pedido | **é o que grava "Em Preparação" hoje** |
| `POST` | `/pedidos/{pedidoId}/rastreamento` | **Insere rastreamento _e status_** a um pedido | **resolve status + dados fiscais numa chamada** |
| `PUT` | `/pedidos/{pedidoId}/rastreamento` | Atualiza rastreamento | — |
| `GET` | `/pedidos/{pedidoId}/rastreamento` | Retorna dados de rastreamento/nf | — |
| `GET` | `/pedidos/{pedidoId}/status` | Retorna o último status | — |
| `GET` | `/pedidos/{pedidoId}/historicoSituacao` | Histórico de situações | auditoria |
| `GET` | `/pedidos/situacaoPedido/{situacoesPedido}` | Lista situações | obter os IDs |

### Por que isso é decisivo

**A Tem Api já tem tudo o que é necessário para resolver a Falha A.** Token válido, permissões concedidas, correlação de pedidos estabelecida.

E o mais importante: **`PUT /pedidos/{pedidoId}/status` recebe `{"id": N}` — resolve por ID, não por nome.** A ambiguidade dos dois `Pedido Enviado` simplesmente não existe nesse caminho.

Isso transforma o que seria um projeto novo em um pedido incremental — e é a base do **Plano B**.

### Dois itens a verificar

- **Qual é o endpoint desabilitado** (30 de 31). Confirmar que não é algo necessário.
- **Se existem tokens separados por função.** Se tudo usa um token só, o rótulo "Atualizado por" nunca distingue quem fez o quê. Um token dedicado para a função de status daria auditoria permanente no histórico.

---

## 9. O que a documentação oficial diz

Artigo `atendimento.wake.tech/hc/pt-br/articles/21406554648471`, de abril/2025.

### 9.1 — O mapeamento de status não está documentado

A única coisa que o artigo promete sobre retorno da Intelipost:

> "**Integra a URL de rastreamento fornecida pela Intelipost nos pedidos da plataforma:** Ao ativar essa funcionalidade, se a sua integração enviar pedidos para a Intelipost, a URL de rastreamento será automaticamente preenchida no painel administrativo da plataforma quando o status 'Despachado' for retornado pela Intelipost."

**URL de rastreamento. Nada sobre situação do pedido, em nenhum trecho do artigo.**

Mas o fluxograma fornecido pelo suporte afirma, no passo 6, que a Intelipost "notifica a Wake sobre as mudanças de status (ex: Enviado, e posteriormente, Entregue)". E o `Entregue` foi comprovadamente escrito.

**Conclusão:** a funcionalidade existe e não está documentada. Isso muda o enquadramento do ticket — em vez de reportar bug, solicita-se a documentação de algo demonstravelmente existente.

### 9.2 — A instrução é selecionar todos os macro status

> "Nessa tela, clique na opção **Macro** e, logo abaixo, selecione **todos** os eventos apresentados."

Cumprido (ver Q15). Não alterou o comportamento, mas elimina esse contra-argumento.

### 9.3 — A origem da regra 64734 está explicada

> "**Host**: URL do Carrinho da Loja, inserir somente o host sem o caminho, por exemplo: intelipost.com.br"

Alguém seguiu a instrução literalmente e colocou `abcdesignbrasil.com.br` + `/checkout` — o carrinho da loja. **Não foi erro aleatório: foi documentação ambígua.** O `frete.fbits.net` veio depois, do operador. As regras por loja de 22/06 substituíram a tentativa de 12/05, mas ninguém apagou a primeira.

### 9.4 — O conflito do canal de vendas

> "Para informar o nome do canal de vendas para devolver o rastreamento para a Wake, informe '**FBITS**'."

A documentação diz `FBITS`; a operação usa `Wake_kikkaboobrasil`. O artigo é de abril/2025 e as regras por loja são de junho/2026 — provavelmente antecede o suporte a multi-loja.

**O canal não é o bloqueio do status.** Se fosse, o `Entregue` também não teria escrito. Mantém-se `Wake_kikkaboobrasil`, com a pergunta incluída no ticket.

### 9.5 — Requisito de cadastro: peso inteiro

> "Para que a cotação ocorra corretamente é necessário que os produtos possuam peso cadastrado como sendo inteiro. Por exemplo: peso 235 (correto) / peso 0,235 (retorno erro)."

O script do Sankhya envia `pr.pesobruto * i.qtdneg` direto do `TGFPRO`, decimal em kg. Candidato provável para a divergência 8,7 vs. 15,2 kg.

---

## 10. Hipóteses testadas e descartadas

**Dezesseis hipóteses caíram no processo**, todas por confronto com dado observado.

| Hipótese | Por que parecia certa | Como caiu |
|---|---|---|
| A cotação "rouba o lugar" do envio real | Status muda exatamente na cotação | Q4/Q5: dois shipment orders distintos |
| O campo `AD_*` se perde no faturamento | Padrão Sankhya: campos custom não propagam | Q7: presente nas duas linhas |
| O botão envia dois payloads num clique | Dois registros na Intelipost | Q5 + código: cada script faz um POST |
| A Tem Api nunca grava o ID Wake no Sankhya | Explicaria o uso do NUNOTA | Q7/Q8: preenchido em 96,5% |
| Os campos de retorno são só dicionário | `ORA-00904` em `AD_NUMEROUNICOPEDIDO` | Q6: os dez campos existem fisicamente |
| Taxa de falha do canal é ~92% | Q8: 154 de 2.573 | Q10: marketplaces não usam Intelipost. Taxa real 37% |
| A Tem Api cria o embarque do Caminho 1 | Era o integrador conhecido | Painel + doc Wake: integração **nativa** |
| Não existe webhook configurado | Status não avançava | Q13/Q14: webhook existe e retorna Sucesso |
| Eventos de `Fonte: Embarcador` não disparam webhook | Coincidência de horário no 75098 | Q13: o `Despachado` do 74923 disparou |
| A regra 64734 é o destino alternativo do embarque real | Sem filtro de canal, deveria pegar tudo | Q13: busca por `194280` retornou nada |
| `METODOENVIO` mistura IDs reais e índices | Valores `17155`, `1`, `2` | Código: grava sempre `delivery_method_id` |
| A barra dupla na URL é bug | `frete.fbits.net//api/...` | Instrução oficial do suporte Wake |
| A integração nativa só devolve rastreio, não status | Artigo do centro de atendimento | Fluxo oficial passo 6 + Q14: escreveu `Entregue` |
| A escrita de 15:41 veio do webhook | Coincidência de minuto | Q14: assinatura é "Tem Api via API" |
| A Wake cria embarque na aprovação do pagamento | Timing observado | Fluxo oficial passo 4: gatilho é atingir "Faturado" |
| **A seleção incompleta de macro status é a causa** | Só cinco estavam ativos | **Q15: com todos ativos, comportamento idêntico** |

**Lição de método:** a resposta plausível não é a resposta verificada. Quando um fornecedor responder, a resposta provável será uma explicação plausível sem evidência. Este documento existe para permitir cobrar o dado.

---

## 11. Diagnóstico consolidado

| # | Defeito | Onde | Severidade |
|---|---|---|---|
| **D1** | `sales_channel` **ausente do payload** do script do Sankhya → embarque com NF não gera webhook | **Sankhya** | **Crítica** |
| **D2** | Mapeamento macro status → situação incompleto: só `Entregue` escreve. Reproduzível com todos os macro status ativos | **Wake** | **Crítica** |
| **D3** | `order_number = c.nunota` em vez de `AD_PEDIDOMKTPLACE` | **Sankhya** | **Crítica** |
| **D4** | Tem Api grava a situação de faturamento antes da NF existir → dispara criação de embarque pela Wake com dados de checkout | **Tem Api** | **Crítica** — passivo financeiro |
| **D5** | Duas situações com nome interno `Pedido Enviado`; `Nome` não editável pelo lojista | **Wake** | Alta |
| **D6** | Regra 64734 ativa apontando para página de vitrine, transmitindo credenciais Basic | **Intelipost** | Alta — segurança |
| **D7** | API key da Intelipost hardcoded nos dois scripts, idêntica à do painel Wake | **Sankhya** | Alta — segurança |
| **D8** | Sem trava de estado no botão: aceita pedido não faturado e permite duplo clique | **Sankhya** | Alta |
| **D9** | `JOIN AD_APIINTELI` ambíguo: casa múltiplas linhas sem `ORDER BY` → frete arbitrário | **Sankhya** | Alta |
| **D10** | Dados fiscais (número, série, chave, URL da NF) nunca gravados na Wake | Wake / Sankhya | Alta |
| **D11** | Canal de retorno Intelipost → Sankhya inativo: 0 de 1.207 | **Sankhya** | Alta — observabilidade |
| **D12** | `DESPACHADO` gravado com Fonte `Embarcador` na criação, sem despacho físico | Wake / Sankhya | Média |
| **D13** | Divergência de cubagem: 8,7 kg vs. 15,2 kg. Doc Wake exige peso **inteiro** | Cadastro | Média |
| **D14** | Script de cotação gera **um volume por linha de item** — infla o frete cotado | **Sankhya** | Média |
| **D15** | `AD_APIINTELI` sem coluna de data ou status de processamento | **Sankhya** | Média |
| **D16** | Ausência de log de eventos órfãos em qualquer ponto da cadeia | Wake / Tem Api | Alta |
| **D17** | Mapeamento de status não documentado no artigo oficial da Wake | **Wake** | Média — risco de mudança sem aviso |

---

## 12. Os dois caminhos de solução

Ambos compartilham a **mesma base** no Sankhya (D1, D3, D8, D9) e as ações de segurança. Divergem apenas em **quem resolve a Falha A**, o mapeamento de status.

### Comparação

| | **Plano A** — webhooks Intelipost → Wake | **Plano B** — infra Tem Api |
|---|---|---|
| Quem escreve a situação | endpoint nativo `frete.fbits.net` | Tem Api via `PUT /pedidos/{id}/status` |
| Resolve situação por | **nome** (hipótese) | **ID numérico** |
| A ambiguidade `Pedido Enviado` | é bloqueio, e você não pode resolver | **desaparece** |
| Desenvolvimento necessário | nenhum além do Sankhya | endpoint receptor na Tem Api |
| Dependência de terceiro | **Wake** — prazo e escopo incertos | **Tem Api** — escopo definido |
| Você define o mapeamento? | não | **sim** |
| Visibilidade / log | nenhuma acessível a você | conforme especificado |
| Documentação do comportamento | inexistente (D17) | seu próprio código |
| Dados fiscais na Wake | pendência separada | resolvido junto, via `POST /rastreamento` |
| Custo de manutenção | zero, mas risco de quebra silenciosa | manutenção do endpoint |
| Prazo estimado | indeterminado — depende da Wake | definido no contrato com a Tem Api |

### Recomendação

**Executar a base do Sankhya imediatamente** — ela é comum aos dois planos, elimina a duplicidade de embarque e o passivo financeiro, e não depende de decisão nenhuma.

**Abrir o ticket na Wake de qualquer forma** — é gratuito, pode resolver, e a resposta é informação valiosa mesmo que negativa.

**Não travar o projeto esperando a Wake.** O Plano B tem escopo definido, resolve por ID (eliminando o problema de raiz, não contornando), e a infraestrutura do lado da Tem Api já está pronta — token válido e permissões concedidas. Também resolve os dados fiscais, que no Plano A ficam como pendência separada.

Os planos **não são mutuamente exclusivos**: as regras 65461 e 65462 podem continuar ativas para o rastreio enquanto a Tem Api assume a escrita de situação.

### Antes de decidir, rode o teste discriminador

`FALHA NA ENTREGA` (13) → verifica se escreve `Pedido Devolvido`, que tem nome único.

- **Escreveu** → hipótese B confirmada. O Plano A vira viável **se** a Wake aceitar desambiguar. Você entrega causa e solução no ticket.
- **Não escreveu** → hipótese A. O Plano A depende de a Wake ampliar a cobertura de mapeamento, o que é escopo de produto, não configuração. **O Plano B fica claramente preferível.**

---

## 13. Monitoramento

### M1 — Saúde do canal de retorno

```sql
SELECT COUNT(*)              AS COM_EMBARQUE,
       COUNT(AD_MACROSTATUS) AS COM_STATUS,
       COUNT(AD_RASTREIO)    AS COM_RASTREIO,
       ROUND(COUNT(AD_MACROSTATUS) * 100 / NULLIF(COUNT(*), 0), 1) AS PCT_STATUS
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND AD_IDINTELIPOST IS NOT NULL AND DTNEG >= DATE '2026-08-01'
```

**Linha de base: 1.207 / 0 / 0.**

### M2 — Cobertura do embarque na loja própria

```sql
SELECT COUNT(*) AS NOTAS_LOJA,
       COUNT(AD_IDINTELIPOST) AS COM_EMBARQUE,
       ROUND(COUNT(AD_IDINTELIPOST) * 100 / NULLIF(COUNT(*), 0), 1) AS PCT
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND AD_CANAL_MKTPLACE IS NULL AND DTNEG >= DATE '2026-08-01'
```

**Linha de base: 37%.** Meta após o patch: ~100%.

### M3 — Cotação repetida (proxy de duplicidade)

```sql
SELECT NUMPEDIDO,
       COUNT(DISTINCT SUBSTR(ID_MAIN, INSTR(ID_MAIN, ',') + 1)) AS COTACOES
FROM SANKHYA.AD_APIINTELI
GROUP BY NUMPEDIDO
HAVING COUNT(DISTINCT SUBSTR(ID_MAIN, INSTR(ID_MAIN, ',') + 1)) > 1
ORDER BY 2 DESC
```

### M4 — Documentos sem chave de correlação

```sql
SELECT NUNOTA, NUMNOTA, DTNEG, CODEMP, AD_CANAL_MKTPLACE
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND AD_PEDIDOMKTPLACE IS NULL AND DTNEG >= DATE '2026-06-01'
ORDER BY DTNEG DESC
```

Base: 90 de 2.573.

### M5 — Teste de webhook (Intelipost)

Webhook → Lista de webhooks, aba **Todos envios**, período ampliado. Registros ficam **30 dias**.

Buscar o `AD_PEDIDOMKTPLACE` e o `NUNOTA` do mesmo documento. Após o patch, deve haver **um único** embarque disparando pela regra 65461.

```sql
SELECT NUNOTA, NUMNOTA, DTNEG, AD_PEDIDOMKTPLACE, AD_IDINTELIPOST
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND AD_IDINTELIPOST IS NOT NULL AND DTNEG >= SYSDATE - 20
ORDER BY DTNEG DESC
```

### M6 — Pedidos travados na Wake

Listagem de Pedidos, combinar filtros:
- **Histórico de Situações** contém "Em Preparação"
- **Situações** (atual) = "Em Preparação"

### M7 — Auditoria de origem das escritas

No histórico de qualquer pedido, a mensagem identifica a origem (ver §2). É o método mais rápido para validar cada correção.

---

## 14. Pendências abertas

| # | Pendência | Como resolver | Bloqueia |
|---|---|---|---|
| **P1** | **Teste `FALHA NA ENTREGA` → `Pedido Devolvido`** | 2 cliques na Intelipost + histórico na Wake | **Escolha entre Plano A e B** |
| **P2** | CODEMP → loja | Query da base comum | Patch Sankhya |
| **P3** | `sales_channel` da ABC Design | Abrir embarque criado pela Wake naquela loja | Patch Sankhya |
| **P4** | Canal para CODEMP 3 e 4 | Verificar se há vendas por essas empresas | Patch Sankhya |
| **P5** | Valores de `TIPMOV` e `STATUSNFE` | Query da base comum | Trava de estado |
| **P6** | **IDs das duas situações `Pedido Enviado`** | `GET /pedidos/situacaoPedido/...`, por loja | Ambos os planos |
| **P7** | Situações da loja Kikkaboo | Mesmo endpoint, token da Kikkaboo | Ambos os planos |
| **P8** | **Quem grava `AD_IDINTELIPOST`?** Nenhum script grava, e está em 1.207 documentos | Listar **todas** as ações da `TGFCAB`; investigar Tem Api | Trava anti-reenvio |
| P9 | Qual é o endpoint desabilitado no token (30/31) | Tela de permissões | Plano B |
| P10 | Existem tokens separados por função? | Tela de tokens | Auditoria |
| P11 | Por que a regra 64734 não disparou para `194280`? | Hipótese: `Enviar para: Cliente` + "Notificações por" vazio | Nenhum — ponta solta |
| P12 | `originWarehouseCode` está correto? (1→02, 2→01, 3→04, 4→03) | Comparar com armazéns na Intelipost | Limpeza |
| P13 | Significado de `AD_STATUSLOG` | Query de limpeza | Limpeza |
| P14 | Movimentação do rastreio `AP291459770BR` | Consulta Correios | Severidade do passivo |
| P15 | PLPs não postadas geram cobrança? | Correios / contrato | Passivo financeiro |
| P16 | TOP 1728 atende também B2B? | Cadastro de TOPs | Interpreta os 90 de M4 |
| P17 | O diagnóstico se aplica igual à abcdesignbrasil? | Repetir Q8–Q15 para a loja | Escopo dos tickets |
| P18 | Estado dos parâmetros "Integra URL de rastreamento" e "Enviar CNPJ para tax_id" | Tela Fretes >> Integração Intelipost | Validação pós-patch |

---

## 15. Anexos

### A — Campos da `TGFCAB`

**Canal de retorno logístico (existem fisicamente):**

| Campo | Rótulo | Populado? |
|---|---|---|
| `AD_PEDIDOMKTPLACE` | [Pedido Externo] — ID Wake | **sim, 96,5%** |
| `AD_IDINTELIPOST` | Id Intelipost | parcial, 37% na loja própria |
| `AD_MACROSTATUS` | Macro Status | **não — 0 de 1.207** |
| `AD_RASTREIO` | Código de Rastreio | **não — 0 de 1.207** |
| `AD_STATUSLOG` | Status Logística | parcial |
| `AD_DATACOLETA` | Data da Coleta | não verificado |
| `AD_DATACOLETAEXP` | Data da Expedição | não verificado |
| `AD_ENTREGA` | Entrega | não verificado |
| `AD_VALORFRETE` | Valor do Frete | sim |
| `AD_CANAL_MKTPLACE` | [Canal Marketplace] | sim, **NULL na loja própria** |

**Órfãos de dicionário:** `AD_CIDADE` · `AD_CNPJPARCEIRO` · `AD_CUBAGEMTOTAL` · `AD_DIFALPAGO` · `AD_NUMEROUNICOPEDIDO` · `AD_TIPPESSOA` · `AD_UF`

**Herança VTEX:** `AD_CODRASTREIOVTEX` · `AD_DTENTREGAVTEX` · `AD_DTENVIORVTEX` · `AD_URLRASTREIOVTEX` · `AD_VTEXMODALIDADE` · `AD_MKTCAMPANHAVTEX` · `AD_MKTMIDIAVTEX` · `AD_MKTORIGEMVTEX` · `AD_ORDERIDVTEXB2C` · `AD_CODPROJVTEX`

### B — Os dois scripts do Sankhya

**Script 1 — Cotação** → `POST https://api.intelipost.com.br/api/v1/quote`
Payload: `origin_zip_code` (`TSIEMP.CEP`), `destination_zip_code` (`TGFPAR.CEP`), `volumes[]` de `TGFITE` × `TGFPRO` (`weight` = `PESOBRUTO × QTDNEG`, `height` = `ALTURA`, `width` = `LARGURA`, `length` = `ESPESSURA`).
Grava em `AD_APIINTELI`: `ID_MAIN` = `Pedido,idCotacaoID`, `VLRFRETE` = `final_shipping_cost`, `METODOENVIO` = `delivery_method_id`, `IDCOTACAO` = `i+1`.
Problemas: API key hardcoded · sem verificação de HTTP status · um volume por linha de item.

**Script 2 — Enviar para Intelipost** → `POST https://api.intelipost.com.br/api/v1/shipment_order`
Lê `CODEMP` → `originWarehouseCode` (1→02, 2→01, 3→04, 4→03). Monta `order_number` = `c.nunota` ❌, `customer_shipping_costs` = `ai.VLRFRETE`, `delivery_method_id` = `ai.METODOENVIO`, `end_customer` de `TGFPAR`/`TSICID`/`TSIEND`/`TSIBAI`, `shipment_order_volume_array` com `shipment_order_volume_invoice` (`serienota`, `numnota`, `chavenfe`, `dtfatur`, `vlrnota`).
Problemas: sem `sales_channel` ❌ · `order_number` errado ❌ · `JOIN AD_APIINTELI` ambíguo · sem trava de estado · não grava `AD_IDINTELIPOST` · API key hardcoded.
Tem tratamento de HTTP status, adicionado recentemente.

### C — API Intelipost

Confirmados no SDK oficial (`github.com/intelipost`, pacote `api-intelipost`):

| Item | Observação |
|---|---|
| `sales_channel` | campo de canal de vendas no ShipmentOrder |
| `sales_order_number` | campo de número do pedido de venda |
| `additional_information` | objeto que suporta N pares chave-valor |
| `POST /shipment_order` | cria embarque |
| `POST /shipment_order/set_invoice` | **anexa NF a embarque existente** |
| `POST /shipment_order/set_tracking_data` | atualiza dados de rastreio |
| `GET /shipment_order/read_status/{order_number}` | consulta status |
| `ChangeDeliveryMethod` | troca método de entrega |

**Macro status com IDs:** DESPACHADO 9 · EM TRÂNSITO 12 · FALHA NA ENTREGA 13 · ENTREGUE 14 · SAIU PARA ENTREGA 16 · FECHADO 15 · AGUARDANDO POSTAGEM 18 · AUTORIZAÇÃO CANCELADA 19 · CANCELADO 7 · MANTER STATUS ANTERIOR 30000

**Ações disponíveis nas regras de evento:** Não alterar status · Adicionar prazo de entrega · Re-calcular previsão de entrega · Substituição de status · Notificações (E-mail, SMS, WhatsApp, Webhook) · Ajustar Data/Horário · Logs de Add/Events

**Condições disponíveis:** Métodos de Envio · Evento Entrando · Contém no Histórico · Evento Anterior do Evento Entrando · Evento Anterior ao Evento Base Entrando · Região de Destino · Canal de Vendas · Diferença Horário Evento Entrando/Ocorrência · Diferença Horário Evento Entrando/Evento Anterior · Diferença Ocorrência Evento Entrando/Evento Anterior · Repetição Evento Entrando · Diferença Evento Entrando/Data Específica · Histórico do Pedido

### D — API Wake

| Recurso | URL |
|---|---|
| Swagger / API Explorer | `https://api.fbits.net/swagger` |
| Portal do desenvolvedor | `https://wakecommerce.readme.io/` |
| Situação de pedido | `https://api.fbits.net/Documentacao/SituacaoPedido` |
| Gestão de pedidos | `https://api.fbits.net/Documentacao/GestaoPedidos` |
| **Integração de Frete com a Intelipost** | `atendimento.wake.tech`, artigo 21406554648471 |
| Endpoint de notificação (kikkaboo) | `https://frete.fbits.net//api/notificacoes/intelipost/kikkaboobrasil` |

Menu do portal: **Referências de API → API Pública**. Limite: **120 requisições/minuto por token e por grupo de endpoints**.

| Finalidade | Endpoint |
|---|---|
| Listar situações da loja | `GET /pedidos/situacaoPedido/{situacoesPedido}` |
| Atualizar situação | `PUT /pedidos/{pedidoId}/status`, corpo `{"id": N}` |
| Último status | `GET /pedidos/{pedidoId}/status` |
| Histórico de situações | `GET /pedidos/{pedidoId}/historicoSituacao` |
| **Inserir rastreamento _e status_** | `POST /pedidos/{pedidoId}/rastreamento` |
| Atualizar rastreamento | `PUT /pedidos/{pedidoId}/rastreamento` |
| Consultar rastreamento/nf | `GET /pedidos/{pedidoId}/rastreamento` |
| Dados de um pedido | `GET /pedidos/{pedidoId}` |

> **Situação e rastreamento/NF são famílias distintas de endpoint** — exceto o `POST /pedidos/{pedidoId}/rastreamento`, que faz as duas coisas.

> **"Reintegrar Pedido"** na tela de Situações provavelmente devolve o pedido à fila de não-integrados quando ele entra naquela situação. **Não use como tentativa de conserto** — o sentido é oposto ao necessário, e há risco de duplicar documento no ERP. Todos os checkboxes estão desmarcados hoje, e é onde devem ficar.

---

*Documento consolidado a partir de análise em 03–05/08/2026 sobre a base de produção Sankhya (schema `SANKHYA`), painel Intelipost (conta 70552), painel administrativo, documentação oficial e permissões de token da Wake Commerce, código-fonte dos dois botões de ação da `TGFCAB`, e SDK oficial da Intelipost.*
