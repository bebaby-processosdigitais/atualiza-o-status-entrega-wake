# Diagnóstico da Integração Wake ↔ Sankhya ↔ Intelipost

**BeBaby Group Importação** — Lojas kikkaboobrasil e abcdesignbrasil (Wake Commerce)
**Conta Intelipost:** ID 70552
**Período da análise:** 03–05/08/2026
**Versão 3** — consolidada. Substitui integralmente as v1 e v2, que continham atribuições de responsabilidade incorretas.

**Objetivo:** fazer a situação do pedido na Wake refletir os eventos logísticos da Intelipost, e eliminar a duplicidade de embarques.

---

## Índice

1. [Sumário executivo](#1-sumário-executivo)
2. [Topologia real](#2-topologia-real)
3. [As duas falhas](#3-as-duas-falhas)
4. [Caso de referência](#4-caso-de-referência)
5. [Evidências no banco Sankhya](#5-evidências-no-banco-sankhya)
6. [Evidências de webhook e status](#6-evidências-de-webhook-e-status)
7. [O mapeamento de status](#7-o-mapeamento-de-status)
8. [Hipóteses testadas e descartadas](#8-hipóteses-testadas-e-descartadas)
9. [Diagnóstico consolidado](#9-diagnóstico-consolidado)
10. [**Correções no Sankhya**](#10-correções-no-sankhya)
11. [Correções na Wake](#11-correções-na-wake)
12. [Correções na Intelipost](#12-correções-na-intelipost)
13. [Segurança](#13-segurança)
14. [Plano de execução](#14-plano-de-execução)
15. [Monitoramento](#15-monitoramento)
16. [Pendências abertas](#16-pendências-abertas)
17. [Anexos](#17-anexos)

---

## 1. Sumário executivo

O sintoma relatado — situação do pedido congelada em "Em Preparação" — tem **duas causas independentes**, cada uma atingindo um caminho diferente. É essa combinação que fez o problema resistir a todos os testes intermediários.

Cada venda da loja própria gera **dois embarques** na Intelipost:

| | **Caminho 1** — criado pela Wake | **Caminho 2** — criado pelo Sankhya |
|---|---|---|
| `sales_channel` | `Wake_kikkaboobrasil` ✅ | **ausente do payload** ❌ |
| `order_number` | ID do pedido Wake ✅ | `NUNOTA` ❌ |
| Nota fiscal | **não tem** | **tem** ✅ |
| Peso/cubagem | catálogo Wake | real da nota ✅ |
| Webhook dispara? | **sim** | **não** |
| Status avança na Wake? | **parcialmente** | não se aplica |

**Falha A — mapeamento de status incompleto (Caminho 1).**
Três webhooks foram aceitos com sucesso pela Wake. Apenas um produziu escrita de situação:

| Macro status Intelipost | Retorno | Escreveu situação? |
|---|---|---|
| `Despachado` | Sucesso | **não** |
| `Em trânsito` | Sucesso | **não** |
| `Entregue` | Sucesso | **sim** |

**Falha B — `sales_channel` ausente (Caminho 2).**
A regra de webhook 65461 filtra por Canal de Vendas. O script do Sankhya não envia esse campo. O embarque que carrega a nota fiscal **nunca gera webhook**.

**Causa da duplicidade.** A Wake cria o pedido logístico quando o pedido atinge a situação que ela trata como faturado — que é `Pedido Enviado` (Observação: "Faturado - Nota fiscal emitida"). A **Tem Api grava essa situação antes de existir nota fiscal**. No caso de referência, a Tem Api sinalizou faturamento às 13:30 e a NF só foi emitida às 16:03. A Wake obedeceu corretamente e criou o embarque com os dados do checkout.

### O que precisa ser feito

| # | Ação | Onde | Depende de terceiro? |
|---|---|---|---|
| 1 | Enviar `sales_channel` e `order_number = AD_PEDIDOMKTPLACE` | Script Sankhya | Só se o botão for Java |
| 2 | Desativar "Notificação de Cotações" (após validar o item 1) | Admin Wake | **Não** |
| 3 | Desativar a regra de evento 64734 | Intelipost | **Não** |
| 4 | Rotacionar a API key da Intelipost | Sankhya + Wake | **Não** |
| 5 | Completar o mapeamento de macro status → situação | Ticket Wake | **Sim** |
| 6 | Tem Api parar de gravar situação de faturamento antes da NF | Ticket Tem Api | **Sim** |

Quatro dos seis itens estão sob seu controle.

---

## 2. Topologia real

> As v1 e v2 atribuíram o Caminho 1 à Tem Api. **Estava errado.** A Wake possui integração **nativa** com a Intelipost.

### Quem faz o quê

| Sistema | Papel | Identificador |
|---|---|---|
| **Wake Commerce** | Loja B2C. Cota **e cria embarque** na Intelipost via integração nativa. Recebe webhooks | ID do pedido (`74923`, `75098`) |
| **Tem Api** | Traz o pedido Wake → Sankhya. Grava a situação de faturamento | — |
| **Sankhya** | Revisão, cotação, faturamento. Cria embarque via botão | `NUNOTA` (`194260` pedido, `194280` nota) |
| **Intelipost** | Cotação, embarques, disparo de webhooks por regra de evento | `ID Intelipost` (`695250186`) |

### Assinaturas de escrita no histórico da Wake

Este é o discriminador que permite identificar a origem de cada mudança de situação:

| Mensagem no histórico | Origem |
|---|---|
| `Situação alterada através da Integração Intelipost (Jaimito)` | **integração nativa Wake ↔ Intelipost** |
| `Atualizado por: Tem Api via API` | **Tem Api** |
| `Situação alterada pelo Gateway de Pagamento` | gateway |
| `Insert by orders` | criação do pedido |

### Configuração da integração nativa

**Menu:** Fretes >> Integração Intelipost
**Documentação oficial:** `atendimento.wake.tech`, artigo *Integração de Frete com a Intelipost* (não está no `readme.io` nem no `api.fbits.net` — não é endpoint público)

| Parâmetro | Valor atual | Função documentada |
|---|---|---|
| Apresentação de Cotações da Intelipost | **Ativo** | aplica desconto só na cotação mais barata |
| **Notificação de Cotações** | **Ativo** ⚠️ | **"Ao ativar, faz o envio do pedido para a Intelipost"** |
| Validar promoção de Frete Grátis | Ativo | envia info de frete grátis |
| Centros de Distribuição | `25,1032` | CDs válidos |
| Token de Autenticação | *preenchido* | — |
| URL de integração | `https://api.intelipost.com.br/api/v1/quote_...` | — |
| Tempo Máximo de Busca de Cotações | `3` | segundos |
| Tipo de prioridade para cálculo de fretes | `2` | — |
| Acréscimo de dias no prazo de envio | `0` | — |
| Integra a URL de rastreamento | *a verificar* | preenche URL de rastreio no status `Despachado` |
| Enviar CNPJ para `tax_id` (TDE/TDA) | *a verificar* | aplica taxas de dificuldade |

> **Requisito de cadastro documentado:** o peso do produto deve estar cadastrado como **inteiro**. `peso 235` é correto; `peso 0,235` retorna erro na cotação. Candidato provável para a divergência de cubagem observada.

### O fluxo oficial (fornecido pelo suporte Wake)

| Passo | Sistema | Ação |
|---|---|---|
| 1 | Wake | Cotação no carrinho |
| 2 | Intelipost | Calcula frete, gera **ID de Cotação** |
| 3 | Wake | Pedido criado, ID de Cotação vinculado |
| 4 | Wake | **Pedido atinge status "Faturado". A plataforma valida se a notificação de pedido está ativa** |
| 5 | Wake → Intelipost | Envia criação do pedido logístico, com o ID de Cotação |
| 6 | Intelipost → Wake | Webhook notifica mudanças de status (ex: `Enviado`, depois `Entregue`) |

**O passo 4 é a chave da duplicidade.** O gatilho é o pedido atingir a situação de faturado — e a Tem Api grava essa situação prematuramente.

### Configuração do webhook (instrução oficial do suporte Wake)

```
Protocolo:  HTTPS (sempre)
Host:       frete.fbits.net/
Path:       api/notificacoes/intelipost/nomedaloja
Porta:      (vazio)
Autenticação: Basic
```

> A **barra dupla** resultante (`frete.fbits.net//api/...`) é o padrão instruído pela Wake. **Não é bug** — a v2 deste relatório errou ao apontá-la como defeito.

---

## 3. As duas falhas

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
```

O embarque que chega na Wake é o que **não tem nota fiscal**, e ele só move status na entrega. O embarque que **tem** a nota fiscal nunca chega.

---

## 4. Caso de referência

**Cliente:** NILTON JOSE DE ALMEIDA COSTA JUNIIR — CPF 01499644396 — Belo Horizonte/MG — CEP 30320-080

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
31/07 13:30   Caminho 1: CRIADO (Embarcador)
31/07 14:55   Caminho 1: criado na transportadora (Intelipost) + DESPACHADO (Embarcador)
31/07 14:55:50  ► webhook regra 65461 → Sucesso
31/07 16:03   Caminho 2: CRIADO + ETIQUETA CRIADA (Embarcador)   ← NF emitida aqui
31/07 16:30   Caminho 2: criado na transportadora + DESPACHADO
                ► nenhum webhook
```

A NF foi emitida às 16:03. A Wake já havia criado embarque às 13:30 — **duas horas e meia antes** —, porque a Tem Api gravou a situação de faturamento antecipadamente.

---

## 5. Evidências no banco Sankhya

> **Sempre qualifique `SANKHYA.`** — existe um schema `TESTE` espelhado. Sem qualificar, os resultados voltam duplicados e há risco de analisar o ambiente errado.

### Q1 — Lógica de Intelipost no banco

```sql
SELECT NAME, TYPE, LINE, TEXT
FROM ALL_SOURCE
WHERE UPPER(TEXT) LIKE '%INTELIPOST%'
ORDER BY NAME, LINE
```

**Resultado:** apenas `AD_APIINTELI_TRG`, trigger `BEFORE INSERT ON AD_APIINTELI` que preenche `ID_KEY` por sequence.

**Conclusão:** nenhuma stored procedure conversa com a Intelipost. Os botões são `Script (JavaScript)` — confirmado depois pelo código-fonte.

### Q2 — Estrutura da `AD_APIINTELI`

```sql
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM ALL_TAB_COLUMNS
WHERE TABLE_NAME = 'AD_APIINTELI' AND OWNER = 'SANKHYA'
ORDER BY COLUMN_ID
```

6 colunas: `ID_KEY`, `ID_MAIN`, `VLRFRETE`, `NUMPEDIDO`, `METODOENVIO`, `IDCOTACAO`.

**Conclusão:** sem coluna de data, hora ou status de processamento. É rascunho de payload, não trilha de auditoria. `NUMPEDIDO` é `VARCHAR2(100)` livre, sem constraint — nada impede que receba o ID Wake numa hora e o NUNOTA na outra.

### Q3 — Quem lê ou escreve nela

```sql
SELECT NAME, TYPE, LINE, TEXT
FROM ALL_SOURCE
WHERE UPPER(TEXT) LIKE '%AD_APIINTELI%'
ORDER BY NAME, LINE
```

Apenas o trigger. Confirma camada de aplicação.

### Q4 — Dados do caso

```sql
SELECT * FROM SANKHYA.AD_APIINTELI
WHERE NUMPEDIDO IN ('74923', '194280')
ORDER BY ID_KEY
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

**Conclusões:**
- Cache de opções de cotação. Três linhas por sessão. `ID_MAIN` = `NUNOTA,ID_cotação_Intelipost`.
- Duas sessões para a mesma carga. Gap de 83 no `ID_KEY` indica sessões separadas.
- `150,99` / `17155` corresponde ao frete do Caminho 2 — confirma a origem daquele embarque.
- O lado Sankhya nunca usou o ID Wake.
- `METODOENVIO` são todos IDs reais da Intelipost (o script grava `delivery_method_id`). **A v2 errou ao sugerir mapeamento incompleto.** Já `IDCOTACAO` é apenas `i + 1`, índice de exibição.

### Q5 — A cotação do Caminho 1 passou pelo ERP?

```sql
SELECT * FROM SANKHYA.AD_APIINTELI
WHERE ID_MAIN LIKE '%935450548146119%'
```

**Vazio.** O embarque do Caminho 1 não passou pelo Sankhya — criado pela integração nativa da Wake.

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

**Existem fisicamente:** `AD_PEDIDOMKTPLACE` ([Pedido Externo] — guarda o ID Wake), `AD_IDINTELIPOST`, `AD_MACROSTATUS`, `AD_STATUSLOG`, `AD_RASTREIO`, `AD_DATACOLETA`, `AD_DATACOLETAEXP`, `AD_ENTREGA`, `AD_VALORFRETE`, `AD_CANAL_MKTPLACE`.

**Órfãos (só no dicionário, dão `ORA-00904`):** `AD_CIDADE`, `AD_CNPJPARCEIRO`, `AD_CUBAGEMTOTAL`, `AD_DIFALPAGO`, `AD_NUMEROUNICOPEDIDO`, `AD_TIPPESSOA`, `AD_UF`.

**Conclusão:** "Macro Status" é vocabulário da Intelipost. Esses campos foram criados para receber o retorno logístico dela. Há também uma família VTEX (`AD_CODRASTREIOVTEX`, `AD_URLRASTREIOVTEX`, `AD_ORDERIDVTEXB2C`...), indicando que a customização nasceu na era VTEX e foi adaptada para a Wake.

### Q7 — Pedido e nota lado a lado

```sql
SELECT C.NUNOTA, C.NUMNOTA, C.TIPMOV, C.CODTIPOPER,
       C.AD_PEDIDOMKTPLACE, C.AD_IDINTELIPOST, C.AD_MACROSTATUS,
       C.AD_STATUSLOG, C.AD_RASTREIO, C.AD_VALORFRETE
FROM SANKHYA.TGFCAB C
WHERE C.NUNOTA = 194280
   OR C.NUNOTA IN (SELECT V.NUNOTAORIG FROM SANKHYA.TGFVAR V WHERE V.NUNOTA = 194280)
```

| NUNOTA | NUMNOTA | TIPMOV | TOP | `AD_PEDIDOMKTPLACE` | `AD_IDINTELIPOST` | `AD_MACROSTATUS` | `AD_STATUSLOG` | `AD_RASTREIO` | `AD_VALORFRETE` |
|---|---|---|---|---|---|---|---|---|---|
| 194280 | 48122 | V | 1728 | **74923** | *(vazio)* | *(vazio)* | 2 | *(vazio)* | 150,99 |
| 194260 | 32766 | P | 1722 | **74923** | *(vazio)* | *(vazio)* | *(vazio)* | *(vazio)* | 150,99 |

**Conclusão central:** `AD_PEDIDOMKTPLACE = 74923` **nas duas linhas**. A chave estava disponível no pedido e na nota, propaga corretamente no faturamento, e o script optou por enviar o `NUNOTA`. Defeito de implementação puro.

`AD_STATUSLOG = 2` só na nota — algo escreve nele, provável flag interno de "enviado".

### Q8 — Volume de preenchimento

```sql
SELECT COUNT(*) AS TOTAL,
       COUNT(AD_PEDIDOMKTPLACE) AS COM_ID_WAKE,
       COUNT(AD_IDINTELIPOST)   AS COM_ID_INTELIPOST,
       COUNT(AD_MACROSTATUS)    AS COM_MACROSTATUS,
       COUNT(AD_RASTREIO)       AS COM_RASTREIO
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND DTNEG >= DATE '2026-06-01'
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

Começa em **junho/2025** e opera em faixa estável por 14 meses. Não é regressão — nunca funcionou plenamente. As regras de webhook são de maio/junho de **2026**: camadas de implantação distintas, montadas por gente diferente ao longo de mais de um ano.

### Q10 — Recorte por canal (descartou uma conclusão errada)

```sql
SELECT NVL(AD_CANAL_MKTPLACE, 'SEM CANAL') AS CANAL,
       COUNT(*) AS NOTAS, COUNT(AD_IDINTELIPOST) AS COM_ID_INTELIPOST
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728 AND DTNEG >= DATE '2026-01-01'
GROUP BY NVL(AD_CANAL_MKTPLACE, 'SEM CANAL') ORDER BY 2 DESC
```

| Canal | Notas | Com ID Intelipost |
|---|---|---|
| SHOPEE | 3.498 | 0 |
| MERCADO_LIVRE | 1.617 | 0 |
| **SEM CANAL** (loja própria) | **1.482** | **550 (37%)** |
| AMAZON_GLOBAL | 171 | 0 |
| MAGALU / MAGAZINE_LUIZA / MELI / SHPS | 7 / 5 / 2 / 1 | 0 |

Marketplaces expedem por logística própria e **não transitam pela Intelipost** — zero é correto. A taxa relevante é da loja própria: **37%**, não os ~8% do total.

> ⚠️ `AD_CANAL_MKTPLACE` é **NULL** na loja própria. **Esse campo não serve** para determinar a loja de origem no patch (ver §10.2).

### Q11 — O número à prova de contestação

```sql
SELECT COUNT(*) AS COM_EMBARQUE,
       COUNT(AD_MACROSTATUS) AS COM_STATUS,
       COUNT(AD_RASTREIO)    AS COM_RASTREIO
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND AD_IDINTELIPOST IS NOT NULL
```

| COM_EMBARQUE | COM_STATUS | COM_RASTREIO |
|---|---|---|
| **1.207** | **0** | **0** |

> **Em 100% dos documentos que comprovadamente geraram embarque na Intelipost, ao longo de 14 meses, o retorno de macro status e rastreio nunca foi gravado no Sankhya.**

**Nota:** nenhum dos dois scripts grava `AD_IDINTELIPOST`. Existe um **terceiro mecanismo** não identificado que preenche esse campo em 1.207 documentos. Ver P8.

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
- Macro status selecionados: **DESPACHADO (9), EM TRÂNSITO (12), FALHA NA ENTREGA (13), ENTREGUE (14), SAIU PARA ENTREGA (16)**
- Contadores de ocorrências visíveis: 2627 / 2161 / 1648 / 1863

**Regra 64734 — incorreta:**
- Condição: **apenas** `Evento Entrando` — sem filtro de canal
- Destino: página de checkout de uma vitrine, não endpoint de API
- `Enviar para: Cliente`
- Resíduo de 12/05/2026, anterior às regras por loja

**Conclusões:**
- A cobertura de eventos está **completa** — a regra dispara para toda a jornada. Se o status não avança, não é falta de evento configurado.
- As regras de evento **não alteram status**. O dropdown oferece `Substituição de status` e `Não alterar status`, mas a 65461 usa **apenas** Notificação por Webhook. A conversão é 100% responsabilidade do endpoint da Wake.
- Existe um macro status `MANTER STATUS ANTERIOR` (ID 30000), útil para não-regressão.

### Q13 — Teste comparativo: os dois embarques da mesma venda

**Tela:** Intelipost → Webhook → Lista de webhooks · **Período:** 06/07 a 31/07/2026 · **Aba:** Todos envios

| Busca | Resultado |
|---|---|
| `74923` (Caminho 1) | **1 webhook** — 31/07 14:55:50, `Despachado`, regra 65461, **Sucesso** |
| `194280` (Caminho 2, **com NF**) | **Nenhum webhook encontrado** |

**Conclusões:**
1. A retenção de 30 dias não explica o vazio — 31/07 está na janela, e o registro do 74923 está lá.
2. Eventos de `Fonte: Embarcador` **disparam** webhook normalmente.
3. O embarque com a nota fiscal não gera webhook nenhum.
4. A única diferença estrutural é o `sales_channel` — e ele é condição ativa na regra 65461.

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

| Webhook Intelipost | Retorno | Escrita no histórico da Wake |
|---|---|---|
| 03/08 15:41:25 — `Despachado` | Sucesso | **nenhuma da integração Intelipost** |
| 03/08 17:00:11 — `Em trânsito` | Sucesso | **nenhuma** |
| 05/08 — `Entregue` | Sucesso | **05/08 12:51 — "Situação alterada através da Integração Intelipost (Jaimito)" → `Entregue`** ✅ |

A escrita de 03/08 15:41 (`Em Preparação`) tem assinatura **"Atualizado por: Tem Api via API"** — não é da integração Intelipost. A coincidência de minuto com o webhook `Despachado` foi coincidência.

**Conclusão:** três webhooks aceitos, **um único** produziu escrita de situação. O mapeamento é incompleto, e agora com prova documental, não inferência.

---

## 7. O mapeamento de status

Esta é a tabela central do problema, e ela **não existe documentada em lugar nenhum**.

### Situações cadastradas na Wake (levantamento na loja ABC Design)

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

**O vocabulário está completo.** Existem slots para enviado, trânsito, entregue e devolvido. Não falta nada.

### A hipótese do nome ambíguo

**Existem duas situações com o nome interno `Pedido Enviado`**, com IDs distintos e descrições distintas. `Entregue` é **único**.

Cruzando com o comportamento observado:

| Macro status | Nome interno alvo | Único? | Escreveu? |
|---|---|---|---|
| `Despachado` | `Pedido Enviado` | **não — 2 candidatas** | ❌ |
| `Em trânsito` | `Pedido Enviado` | **não — 2 candidatas** | ❌ |
| `Entregue` | `Entregue` | **sim** | ✅ |

**Se a integração resolve a situação por nome em vez de ID, ela não consegue decidir entre as duas `Pedido Enviado` e desiste.** Isso explica exatamente o padrão observado.

Isso é **hipótese**, não fato confirmado. Mas é a explicação mais econômica dos três resultados, e é testável.

> ⚠️ A tela de Situações permite editar apenas **Descrição** e **Observação**. O campo `Nome` não é editável pelo lojista. Se a hipótese estiver correta, resolver a ambiguidade exige ticket na Wake — mas com pergunta cirúrgica.

### Tabela a completar

**Passo 1:** obter os IDs reais pelo endpoint *"Retorna todas as situações de pedido da loja"*, **por loja** (o levantamento acima é da ABC Design; a Kikkaboo pode divergir).

**Passo 2:** testar cada macro status individualmente em um pedido de teste — alterar na Intelipost, conferir o histórico na Wake.

| Macro Intelipost | ID | Situação Wake resultante | ID situação | Status do teste |
|---|---|---|---|---|
| DESPACHADO | 9 | *(nenhuma)* | — | ❌ confirmado |
| EM TRÂNSITO | 12 | *(nenhuma)* | — | ❌ confirmado |
| SAIU PARA ENTREGA | 16 | ? | ? | a testar |
| FALHA NA ENTREGA | 13 | ? | ? | a testar |
| ENTREGUE | 14 | `Entregue` | ? | ✅ confirmado |

Cinco testes, dois cliques cada. Com a tabela preenchida, o ticket na Wake fica objetivo: *"destes cinco macro status, apenas ENTREGUE produz escrita de situação; os demais retornam Sucesso e não alteram o pedido."*

---

## 8. Hipóteses testadas e descartadas

Registradas para evitar relitígio. **Onze hipóteses caíram no processo**, todas por confronto com dado observado.

| Hipótese | Por que parecia certa | Como caiu |
|---|---|---|
| A cotação "rouba o lugar" do envio real | Status muda exatamente na cotação | Q4/Q5: dois shipment orders distintos, não sobrescrita |
| O campo `AD_*` se perde no faturamento | Padrão Sankhya: campos custom não propagam | Q7: `AD_PEDIDOMKTPLACE` presente nas duas linhas |
| O botão envia dois payloads num clique | Dois registros na Intelipost | Q5 + código: cada script faz um POST |
| A Tem Api nunca grava o ID Wake no Sankhya | Explicaria o uso do NUNOTA | Q7/Q8: preenchido em 96,5% |
| Os campos de retorno são só dicionário | `ORA-00904` em `AD_NUMEROUNICOPEDIDO` | Q6: os dez campos existem fisicamente |
| Taxa de falha do canal é ~92% | Q8: 154 de 2.573 | Q10: marketplaces não usam Intelipost. Taxa real 37% |
| A Tem Api cria o embarque do Caminho 1 | Era o integrador conhecido | Painel + doc Wake: integração **nativa** |
| Não existe webhook configurado | Status não avançava | Q13/Q14: webhook existe, dispara, retorna Sucesso |
| Eventos de `Fonte: Embarcador` não disparam webhook | Coincidência de horário no 75098 | Q13: o `Despachado` do 74923 disparou |
| A regra 64734 é o destino alternativo do embarque real | Sem filtro de canal, deveria pegar tudo | Q13: busca por `194280` retornou **nada** |
| `METODOENVIO` mistura IDs reais e índices | Valores `17155`, `1`, `2` | Código: grava sempre `delivery_method_id` |
| A barra dupla na URL é bug | `frete.fbits.net//api/...` | Instrução oficial do suporte Wake |
| A integração nativa só devolve rastreio, não status | Artigo do centro de atendimento | Fluxo oficial passo 6 + Q14: escreveu `Entregue` |
| A escrita de 15:41 veio do webhook | Coincidência de minuto | Q14: assinatura é "Tem Api via API", não "Integração Intelipost (Jaimito)" |
| A Wake cria embarque na aprovação do pagamento | Timing observado | Fluxo oficial passo 4: gatilho é atingir "Faturado" |

**Lição de método:** a resposta plausível não é a resposta verificada. Quando um fornecedor responder, a resposta provável será uma explicação plausível sem evidência. Este documento existe para permitir cobrar o dado.

---

## 9. Diagnóstico consolidado

| # | Defeito | Onde | Severidade |
|---|---|---|---|
| **D1** | `sales_channel` **ausente do payload** do script do Sankhya → embarque com NF não gera webhook | **Sankhya** | **Crítica** |
| **D2** | Mapeamento macro status → situação incompleto: `Despachado` e `Em trânsito` retornam Sucesso e não escrevem | **Wake** | **Crítica** |
| **D3** | `order_number = c.nunota` em vez de `AD_PEDIDOMKTPLACE` | **Sankhya** | **Crítica** |
| **D4** | Tem Api grava a situação de faturamento antes da NF existir → dispara criação de embarque pela Wake com dados de checkout | **Tem Api** | **Crítica** — passivo financeiro |
| **D5** | Duas situações com nome interno `Pedido Enviado`; descrição de uma renomeada para "Em Preparação" | **Wake / admin** | Alta |
| **D6** | Regra 64734 ativa apontando para página de vitrine, transmitindo credenciais Basic | **Intelipost** | Alta — segurança |
| **D7** | API key da Intelipost hardcoded nos dois scripts, idêntica à do painel Wake | **Sankhya** | Alta — segurança |
| **D8** | Sem trava de estado no botão: aceita pedido não faturado e permite duplo clique | **Sankhya** | Alta |
| **D9** | `JOIN AD_APIINTELI` ambíguo: casa múltiplas linhas quando há mais de uma sessão de cotação, sem `ORDER BY` | **Sankhya** | Alta |
| **D10** | Dados fiscais (número, série, chave, URL da NF) nunca gravados na Wake | Wake / Sankhya | Alta |
| **D11** | Canal de retorno Intelipost → Sankhya inativo: 0 de 1.207 com macro status ou rastreio | **Sankhya** | Alta — observabilidade |
| **D12** | `DESPACHADO` gravado com Fonte `Embarcador` na criação, sem despacho físico | Wake / Sankhya | Média |
| **D13** | Divergência de cubagem: 8,7 kg (checkout) vs. 15,2 kg (nota). Doc Wake exige peso **inteiro** | Cadastro | Média |
| **D14** | Script de cotação gera **um volume por linha de item** — infla o frete cotado | **Sankhya** | Média |
| **D15** | `AD_APIINTELI` sem coluna de data ou status de processamento | **Sankhya** | Média |
| **D16** | Ausência de log de eventos órfãos em qualquer ponto da cadeia | Wake / Tem Api | Alta |

---

## 10. Correções no Sankhya

Todas no script do botão **"Enviar para Intelipost"** (`/api/v1/shipment_order`), salvo indicação contrária.

### 10.1 — Localizar o botão

**Dicionário de Dados → `TGFCAB` → aba "Ações"**. Já sabemos que é `Script (JavaScript)` pelo código-fonte obtido — o que significa que **a correção é interna, sem fornecedor**. Confirme também se existe mais de uma ação com nome semelhante.

### 10.2 — [CRÍTICO] Enviar `sales_channel` e trocar `order_number`

O script já lê o `CODEMP` e mapeia para armazém. **Aproveite a mesma estrutura** para derivar o canal:

```javascript
var originWarehouseCode = null;
var salesChannel = null;

if (codemp === "1") {
    originWarehouseCode = "02";
    salesChannel = "Wake_kikkaboobrasil";
} else if (codemp === "2") {
    originWarehouseCode = "01";
    salesChannel = "Wake_abcdesignbrasil";   // ⚠️ NÃO confirmado
} else if (codemp === "3") {
    originWarehouseCode = "04";
    salesChannel = null;                      // ⚠️ definir
} else if (codemp === "4") {
    originWarehouseCode = "03";
    salesChannel = null;                      // ⚠️ definir
} else {
    mensagem = "CODEMP não reconhecido: " + codemp;
}
```

No `selectQuery`, substituir a primeira linha do `JSON_OBJECT`:

```javascript
// ANTES
"  'order_number' VALUE c.nunota, " +

// DEPOIS
"  'order_number' VALUE c.AD_PEDIDOMKTPLACE, " +
"  'sales_order_number' VALUE c.AD_PEDIDOMKTPLACE, " +
"  'sales_channel' VALUE '" + salesChannel + "', " +
"  'additional_information' VALUE JSON_OBJECT('nunota' VALUE c.nunota), " +
```

**Notas sobre esse patch:**

- Os nomes `sales_channel` e `sales_order_number` estão confirmados no SDK oficial da Intelipost.
- **Não se sabe qual dos dois campos o endpoint da Wake lê.** Por isso o ID Wake vai nos dois.
- O `NUNOTA` vai em `additional_information`, que o SDK documenta como aceitando pares chave-valor livres. A operação não perde a referência do ERP.
- O valor `Wake_kikkaboobrasil` está confirmado empiricamente: o embarque 74923 tem esse canal e comprovadamente disparou pela regra 65461. **Atenção ao case exato.**
- A documentação oficial da Wake instrui usar `FBITS` como canal. Seu setup usa nome por loja, provavelmente por ser multi-loja na mesma conta Intelipost. Vale confirmar com a Wake, mas o empírico prevalece.
- Os CODEMP 3 e 4 ficariam com `salesChannel = null` e reproduziriam o problema atual. Definir antes de aplicar, se houver vendas por essas empresas.

**Como descobrir o discriminador de loja:**

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

Pegue um `EXEMPLO_1` de cada CODEMP e procure o número no admin de cada loja. Onde o pedido existir, aquele CODEMP é daquela loja.

### 10.3 — [CRÍTICO] Trava de estado

Inserir **antes** do POST:

```javascript
var gate = getQuery("native");
gate.setParam("Pedido", Pedido);
gate.nativeSelect(
  "SELECT TIPMOV, NUMNOTA, CHAVENFE, AD_PEDIDOMKTPLACE, AD_IDINTELIPOST " +
  "FROM SANKHYA.TGFCAB WHERE NUNOTA = {Pedido}"
);

if (gate.next()) {
    if (String(gate.getString("TIPMOV")).trim() !== "V") {
        mensagem = "Envio bloqueado: documento não é nota de venda faturada.";
        return;
    }
    if (gate.getString("NUMNOTA") == null || gate.getString("CHAVENFE") == null) {
        mensagem = "Envio bloqueado: NF-e não emitida ou não autorizada.";
        return;
    }
    if (gate.getString("AD_PEDIDOMKTPLACE") == null) {
        mensagem = "Envio bloqueado: pedido sem ID de origem (Pedido Externo).";
        return;
    }
    if (gate.getString("AD_IDINTELIPOST") != null) {
        mensagem = "Envio bloqueado: embarque já criado (" +
                   gate.getString("AD_IDINTELIPOST") + ").";
        return;
    }
}
```

> Confirme os valores de `TIPMOV` e `STATUSNFE` na sua base — TOP e status são configurados por empresa:
> ```sql
> SELECT TIPMOV, CODTIPOPER, STATUSNFE, COUNT(*) AS QTD
> FROM SANKHYA.TGFCAB
> WHERE CODTIPOPER IN (1722, 1728) AND DTNEG >= DATE '2026-07-01'
> GROUP BY TIPMOV, CODTIPOPER, STATUSNFE ORDER BY 4 DESC
> ```

A trava anti-reenvio (`AD_IDINTELIPOST`) só funciona depois de 10.4.

### 10.4 — [ALTA] Gravar `AD_IDINTELIPOST` no retorno

Hoje a resposta da API cai em `mensagem` e é descartada. Extrair o ID do shipment order e gravar no documento.

Ganhos: join direto Sankhya ↔ Intelipost por SQL, base para a trava anti-reenvio, e a métrica M1 passa a ser confiável.

### 10.5 — [ALTA] Corrigir o `JOIN` ambíguo

```javascript
// ATUAL — pode casar múltiplas linhas
"JOIN AD_APIINTELI ai ON ai.NUMPEDIDO = '" + Pedido + "' AND ai.IDCOTACAO = '" + Cotacao + "' "
```

O filtro não inclui o ID da cotação Intelipost que está no `ID_MAIN`. Com duas sessões de cotação para o mesmo documento (caso 194280), `IDCOTACAO = 2` casa com `ID_KEY` 54778 **e** 54863. O `if (query.next())` pega a primeira, sem `ORDER BY`. **O frete enviado é arbitrário entre as sessões.**

Correção: incluir o `ID_MAIN` completo no filtro, ou ordenar por `ai.ID_KEY DESC` e usar a cotação mais recente.

### 10.6 — [MÉDIA] Revisar o mapeamento `originWarehouseCode`

O mapeamento cruza: `1→02`, `2→01`, `3→04`, `4→03`. Pode ser intencional (numerações diferentes) ou pode ser um par trocado. Confira contra a lista de armazéns na Intelipost — se estiver invertido, há embarques cotados a partir do CD errado, afetando frete e prazo.

### 10.7 — [MÉDIA] Volume por linha de item (script de cotação)

O `JSON_ARRAYAGG` sobre `TGFITE` gera um objeto de volume **por linha de item**. Um pedido com três produtos é cotado como três volumes, mesmo indo numa caixa só — o que infla o frete apresentado ao cliente. Verificar se é intencional.

### 10.8 — [MÉDIA] Unidade do peso

O script envia `pr.pesobruto * i.qtdneg` direto do `TGFPRO`, decimal em kg. A documentação da Wake exige peso **inteiro** (`235` correto, `0,235` erro). Candidato forte para a divergência 8,7 vs. 15,2 kg. Verificar a unidade em `TGFPRO.PESOBRUTO` e como o catálogo Wake está cadastrado.

### 10.9 — [MÉDIA] Colunas de auditoria na `AD_APIINTELI`

| Coluna | Tipo | Finalidade |
|---|---|---|
| `DHINCLUSAO` | `DATE` | quando a cotação foi registrada |
| `STATUSPROC` | `VARCHAR2(20)` | pendente / enviado / erro |
| `DHENVIO` | `DATE` | quando o embarque foi criado |
| `RETORNOAPI` | `VARCHAR2(4000)` | corpo da resposta da Intelipost |

Com `RETORNOAPI` preenchido, falhas futuras passam a ser diagnosticáveis sem ticket.

### 10.10 — [BAIXA] Investigar `AD_STATUSLOG`

```sql
SELECT AD_STATUSLOG, COUNT(*) AS QTD
FROM SANKHYA.TGFCAB
WHERE CODTIPOPER = 1728 AND TIPMOV = 'V'
GROUP BY AD_STATUSLOG ORDER BY 2 DESC
```

Único campo da família com valor. Se houver poucos valores distintos, é provável flag interno de "enviado" — e serve para identificar documentos enviados antes de 10.4 entrar.

### 10.11 — [BAIXA] Limpar campos órfãos do dicionário

`AD_CIDADE` · `AD_CNPJPARCEIRO` · `AD_CUBAGEMTOTAL` · `AD_DIFALPAGO` · `AD_NUMEROUNICOPEDIDO` · `AD_TIPPESSOA` · `AD_UF`. Sem urgência, mas se algum layout referenciar um deles, o usuário vê `ORA-00904` em tela.

### Alternativa arquitetural a considerar depois

A Intelipost expõe `POST /shipment_order/set_invoice`, `POST /shipment_order/set_tracking_data` e uma operação `ChangeDeliveryMethod`. Em vez de criar um segundo embarque, o Sankhya poderia **anexar a nota fiscal ao embarque que a Wake criou** e trocar a transportadora.

Vantagem: um único embarque, com canal e referência já corretos pela Wake.
Risco: a Intelipost pode não permitir troca de transportadora após geração de etiqueta.

Fica registrado como opção, não como recomendação imediata.

---

## 11. Correções na Wake

### 11.1 — [CRÍTICO, após validar §10.2] Desativar "Notificação de Cotações"

**Menu:** Fretes >> Integração Intelipost

O parâmetro `Intelipost - Ativar/Desativar notificação de cotações` está **ativo**. A documentação oficial descreve sua função: *"Ao ativar, faz o envio do pedido para a Intelipost."*

É ele que faz a Wake criar o embarque. Desativar elimina a duplicidade na origem.

> ⚠️ **Não desative antes de validar o patch do Sankhya.** Se a Wake parar de enviar e o script ainda estiver sem `sales_channel`, você fica sem nenhum embarque com canal válido — e perde até o rastreio que hoje funciona.

### 11.2 — [CRÍTICO] Ticket: mapeamento de macro status

Texto sugerido, a ser complementado com a tabela da §7:

> O endpoint `https://frete.fbits.net/api/notificacoes/intelipost/kikkaboobrasil` recebe eventos de macro status da Intelipost e responde com sucesso, mas apenas parte deles produz alteração de situação do pedido.
>
> **Evidência — pedido 75098.** Webhooks disparados pela Intelipost, todos com retorno de sucesso registrado no log da Intelipost:
> - 03/08/2026 15:41:25 — `Despachado` — **nenhuma alteração de situação**
> - 03/08/2026 17:00:11 — `Em trânsito` — **nenhuma alteração de situação**
> - 05/08/2026 — `Entregue` — situação alterada para `Entregue` às 12:51, com a mensagem "Situação alterada através da Integração Intelipost (Jaimito)"
>
> **Observação relevante.** Nossa loja possui **duas situações com o nome interno `Pedido Enviado`** (uma com descrição "Em Preparação", observação "Faturado - Nota fiscal emitida"; outra com descrição "Em trânsito"). A situação `Entregue` é única. Levantamos a hipótese de que a resolução da situação-alvo seja feita por nome, e que a ambiguidade impeça a escrita.
>
> Solicitamos: (a) a tabela de mapeamento entre macro status Intelipost e situações da plataforma; (b) confirmação de se a resolução é feita por ID ou por nome da situação; (c) se por nome, orientação sobre como resolver a duplicidade, já que o campo Nome não é editável pelo lojista; (d) onde consultamos o log de processamento desse endpoint.

### 11.3 — [ALTA] Corrigir a descrição de `Pedido Enviado`

A descrição "Em Preparação" contradiz a observação da própria linha ("Faturado - Nota fiscal emitida"). Corrigir para algo fiel.

> ⚠️ Essa descrição aparece na página do cliente, em e-mails transacionais (a coluna `Email cópia oculta` está preenchida nessa linha) e possivelmente em automações do Kommo. **Mapeie onde o rótulo é consumido antes de trocar** — todo cliente com pedido nessa situação vê a mudança imediatamente.

### 11.4 — [MÉDIA] Verificar parâmetros não observados

Confirme na tela Fretes >> Integração Intelipost o estado de:
- **Integra a URL de rastreamento fornecida pela Intelipost nos pedidos** — é o que faz o rastreio funcionar hoje
- **Enviar CNPJ para o campo `tax_id`** (taxas TDE e TDA)

Após desativar a "Notificação de Cotações" (§11.1), monitore se o rastreio continua sendo preenchido. A documentação diz *"se a sua integração enviar pedidos para a Intelipost"* — não está claro se "sua integração" inclui a criação pelo Sankhya. Se o rastreio parar, é pergunta para a Wake.

### 11.5 — [ALTA] Dados fiscais no pedido

Número, série, chave e URL da NF permanecem vazios (Q14). Definir quem os grava: o endpoint de rastreamento completo chamado pelo Sankhya/Tem Api, ou o endpoint de notificação recebendo da Intelipost.

---

## 12. Correções na Intelipost

### 12.1 — [ALTA, imediato] Desativar a regra 64734

Aponta para `abcdesignbrasil.com.br/checkout`, uma página de vitrine, e transmite credenciais Basic a cada evento. Resíduo de 12/05/2026, anterior às regras por loja. **Não há cenário em que deva continuar ativa.** Não depende de terceiro.

### 12.2 — [MÉDIA] Criar regra de retorno para o Sankhya

Pré-requisito para popular `AD_MACROSTATUS`, `AD_RASTREIO`, `AD_DATACOLETA`, `AD_DATACOLETAEXP` e `AD_ENTREGA` (D11). Nova regra, mesmo filtro de canal, webhook apontando para endpoint do Sankhya. É adição de configuração, risco baixo.

### 12.3 — [BAIXA] Explorar "Logs de Add/Events"

Aparece no dropdown de ações das regras de evento. Pode ser a trilha de auditoria que falta na cadeia.

### ⚠️ Cuidados ao editar regras de evento

1. **Clicar no botão de uma condição a DESMARCA** — não expande. Se clicar em "Canal de Vendas" por engano, saia **sem salvar**.
2. **O navegador faz autofill dos campos de autenticação** com `marketplace@bebaby.com.br` e senha. Salvar com isso preenchido **sobrescreve a credencial real do webhook e derruba a integração que hoje funciona.** Limpe os dois campos antes de salvar.
3. O dropdown "Adicionar ação" **cria** uma ação ao selecionar. Não selecione nada ao apenas inspecionar.

---

## 13. Segurança

| # | Item | Ação |
|---|---|---|
| S1 | **API key da Intelipost hardcoded** nos dois scripts do Sankhya (`894b08178ccdb...`), **idêntica** à do painel Wake | Rotacionar. Coordenar: rotação derruba Wake e Sankhya simultaneamente |
| S2 | A mesma key está legível na tela de parâmetros da Wake e em texto plano no Dicionário de Dados do Sankhya | Após rotação, mover para parâmetro do sistema em vez de literal no código |
| S3 | Regra 64734 transmite credenciais Basic para URL pública de vitrine a cada evento | Desativar (§12.1). Se o servidor da ABC Design registra headers, as credenciais estão em log |
| S4 | Autofill do navegador nos campos de autenticação das regras Intelipost | Limpar campos antes de qualquer salvamento |
| S5 | `INSERT` por concatenação de string no script de cotação | Risco baixo (parâmetro controlado), mas vale parametrizar |

**Consequência operacional do S1:** Wake e Sankhya usam a mesma credencial na Intelipost. Por isso **não foi possível distinguir os criadores dos embarques por token** — não há distinção a fazer.

---

## 14. Plano de execução

### Fase 0 — Imediato, sem depender de ninguém

| # | Ação | Onde | Ref. |
|---|---|---|---|
| 0.1 | Desativar a regra de evento 64734 | Intelipost | 12.1 |
| 0.2 | Rotacionar a API key da Intelipost (coordenado) | Sankhya + Wake | 13/S1 |
| 0.3 | Levantar e cancelar embarques indevidos abertos | Intelipost | D4 |
| 0.4 | Verificar com os Correios se PLPs não postadas geram cobrança | Correios | D4 |
| 0.5 | Verificar quais automações do Kommo dependem da situação na Wake | Kommo | 11.3 |

### Fase 1 — Descoberta (bloqueia a Fase 2)

| # | Ação | Ref. |
|---|---|---|
| 1.1 | Definir o discriminador de loja (`CODEMP` → loja) | 10.2 |
| 1.2 | Confirmar o `sales_channel` da ABC Design (abrir embarque criado pela Wake naquela loja) | 10.2 |
| 1.3 | Definir canal para CODEMP 3 e 4, se houver vendas | 10.2 |
| 1.4 | Confirmar valores de `TIPMOV` e `STATUSNFE` | 10.3 |
| 1.5 | Obter os IDs das situações, **por loja**, via API | 7 |
| 1.6 | Testar os macro status `SAIU PARA ENTREGA` e `FALHA NA ENTREGA` | 7 |

### Fase 2 — Patch no Sankhya

| # | Ação | Ref. |
|---|---|---|
| 2.1 | `sales_channel` + `order_number = AD_PEDIDOMKTPLACE` + `sales_order_number` + `additional_information` | 10.2 |
| 2.2 | Trava de estado | 10.3 |
| 2.3 | Gravar `AD_IDINTELIPOST` no retorno | 10.4 |
| 2.4 | Corrigir o `JOIN` ambíguo | 10.5 |

### Fase 3 — Validação (antes de desligar nada)

| # | Ação | O que confirmar |
|---|---|---|
| 3.1 | Faturar um pedido e clicar o botão | Embarque novo tem `Canal de Vendas` preenchido e `Pedido` = ID Wake |
| 3.2 | Buscar o ID Wake na Lista de webhooks da Intelipost | Aparece disparo pela regra 65461 com Sucesso |
| 3.3 | Conferir histórico do pedido na Wake | Escrita com assinatura "Integração Intelipost" |

> Entre as Fases 2 e 4 haverá **duplicidade momentânea**, com os dois embarques disparando webhook pelo mesmo pedido. É desconfortável mas controlado — e muito melhor que o cenário inverso.

### Fase 4 — Desligar a criação pela Wake

| # | Ação | Ref. |
|---|---|---|
| 4.1 | Desativar "Notificação de Cotações" | 11.1 |
| 4.2 | Monitorar se o rastreio continua sendo preenchido | 11.4 |

**Nunca inverta as Fases 2 e 4.**

### Fase 5 — Tickets externos

| # | Ação | Destino | Ref. |
|---|---|---|---|
| 5.1 | Mapeamento de macro status → situação | Wake | 11.2 |
| 5.2 | Tem Api parar de gravar situação de faturamento antes da NF | Tem Api | D4 |
| 5.3 | Definir gravação dos dados fiscais | Wake / Tem Api | 11.5 |

### Fase 6 — Observabilidade

| # | Ação | Ref. |
|---|---|---|
| 6.1 | Regra de retorno Intelipost → Sankhya | 12.2 |
| 6.2 | Popular `AD_MACROSTATUS`, `AD_RASTREIO`, datas | D11 |
| 6.3 | Colunas de auditoria na `AD_APIINTELI` | 10.9 |
| 6.4 | Log de eventos órfãos | D16 |
| 6.5 | Job de reconciliação diária Wake × Sankhya × Intelipost | — |

### Fase 7 — Limpeza

| # | Ação | Ref. |
|---|---|---|
| 7.1 | Corrigir descrição de `Pedido Enviado` | 11.3 |
| 7.2 | Revisar `originWarehouseCode` | 10.6 |
| 7.3 | Volume por linha de item | 10.7 |
| 7.4 | Unidade do peso / cubagem | 10.8 |
| 7.5 | Investigar `AD_STATUSLOG` | 10.10 |
| 7.6 | Limpar campos órfãos do dicionário | 10.11 |

---

## 15. Monitoramento

### M1 — Saúde do canal de retorno

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

**Linha de base: 1.207 / 0 / 0.** Meta após Fase 6: `PCT_STATUS` próximo de 100.

### M2 — Cobertura do embarque na loja própria

```sql
SELECT COUNT(*) AS NOTAS_LOJA,
       COUNT(AD_IDINTELIPOST) AS COM_EMBARQUE,
       ROUND(COUNT(AD_IDINTELIPOST) * 100 / NULLIF(COUNT(*), 0), 1) AS PCT
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND AD_CANAL_MKTPLACE IS NULL
  AND DTNEG >= DATE '2026-08-01'
```

**Linha de base: 37%.** Meta após Fase 2: ~100%.

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
  AND AD_PEDIDOMKTPLACE IS NULL
  AND DTNEG >= DATE '2026-06-01'
ORDER BY DTNEG DESC
```

Base: 90 de 2.573. Verificar se são B2B legítimos.

### M5 — Teste de webhook (Intelipost, sem SQL)

Intelipost → Webhook → Lista de webhooks, aba **Todos envios**, período ampliado. Registros ficam **30 dias**.

Buscar o `AD_PEDIDOMKTPLACE` e o `NUNOTA` do mesmo documento. **Após a Fase 4, deve haver um único embarque, disparando pela regra 65461.**

Para escolher documentos dentro da janela de retenção:

```sql
SELECT NUNOTA, NUMNOTA, DTNEG, AD_PEDIDOMKTPLACE, AD_IDINTELIPOST
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND AD_IDINTELIPOST IS NOT NULL
  AND DTNEG >= SYSDATE - 20
ORDER BY DTNEG DESC
```

### M6 — Pedidos travados na Wake (sem SQL)

Listagem de Pedidos, combinar filtros:
- **Histórico de Situações** contém "Em Preparação"
- **Situações** (atual) = "Em Preparação"

Exportar para acompanhar a redução.

### M7 — Auditoria de origem das escritas

No histórico de qualquer pedido, a mensagem identifica a origem. Use as assinaturas da §2 para distinguir integração Intelipost, Tem Api e gateway. É o método mais rápido para validar cada correção.

---

## 16. Pendências abertas

| # | Pendência | Como resolver | Bloqueia |
|---|---|---|---|
| **P1** | **CODEMP → loja** | Query da §10.2 | Fase 2 |
| **P2** | **`sales_channel` da ABC Design** | Abrir embarque criado pela Wake naquela loja | Fase 2 |
| **P3** | Canal para CODEMP 3 e 4 | Verificar se há vendas por essas empresas | Fase 2 |
| **P4** | Valores de `TIPMOV` e `STATUSNFE` | Query da §10.3 | Fase 2 |
| **P5** | **IDs das duas situações `Pedido Enviado`** | Endpoint "Retorna todas as situações", por loja | Ticket 11.2 |
| **P6** | Situações da loja Kikkaboo | Mesmo endpoint, token da Kikkaboo | Ticket 11.2 |
| **P7** | Mapeamento de `SAIU PARA ENTREGA` e `FALHA NA ENTREGA` | Teste manual, 2 cliques cada | Ticket 11.2 |
| **P8** | **Quem grava `AD_IDINTELIPOST`?** Nenhum dos dois scripts grava, e está em 1.207 documentos | Listar **todas** as ações da `TGFCAB`; investigar Tem Api | Entendimento da topologia |
| P9 | Por que a regra 64734, sem filtro de canal, não disparou para `194280`? | Hipótese: `Enviar para: Cliente` + "Notificações por" vazio | Nenhum — ponta solta |
| P10 | `originWarehouseCode` está correto? | Comparar com armazéns na Intelipost | Fase 7 |
| P11 | Significado de `AD_STATUSLOG` | Query da §10.10 | Fase 7 |
| P12 | Movimentação do rastreio `AP291459770BR` | Consulta Correios | Severidade do passivo |
| P13 | PLPs não postadas geram cobrança? | Correios / contrato | Passivo financeiro |
| P14 | TOP 1728 atende também B2B? | Cadastro de TOPs | Interpreta os 90 de M4 |
| P15 | O diagnóstico se aplica igual à abcdesignbrasil? | Repetir Q8–Q14 para a loja | Escopo dos tickets |
| P16 | Estado dos parâmetros "Integra URL de rastreamento" e "Enviar CNPJ para tax_id" | Tela Fretes >> Integração Intelipost | §11.4 |

---

## 17. Anexos

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
Lê `CODEMP` → `originWarehouseCode`. Monta `order_number` = `c.nunota` ❌, `customer_shipping_costs` = `ai.VLRFRETE`, `delivery_method_id` = `ai.METODOENVIO`, `end_customer` de `TGFPAR`/`TSICID`/`TSIEND`/`TSIBAI`, `shipment_order_volume_array` com `shipment_order_volume_invoice` (`serienota`, `numnota`, `chavenfe`, `dtfatur`, `vlrnota`).
Problemas: sem `sales_channel` ❌ · `order_number` errado ❌ · `JOIN AD_APIINTELI` ambíguo · sem trava de estado · não grava `AD_IDINTELIPOST` · API key hardcoded.
Tem tratamento de HTTP status (adicionado recentemente, conforme comentário no código).

### C — API Intelipost: campos e endpoints relevantes

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

**Macro status disponíveis (parciais, com IDs):** DESPACHADO 9 · EM TRÂNSITO 12 · FALHA NA ENTREGA 13 · ENTREGUE 14 · SAIU PARA ENTREGA 16 · FECHADO 15 · AGUARDANDO POSTAGEM 18 · AUTORIZAÇÃO CANCELADA 19 · CANCELADO 7 · MANTER STATUS ANTERIOR 30000

### D — Endpoints e documentação Wake

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
| Listar IDs das situações da loja | "Retorna todas as situações de pedido da loja" |
| Atualizar situação | `PUT /pedidos/{pedidoId}/status`, corpo `{"id": N}` |
| Histórico de situações | "Retorna o histórico de situações de um pedido" |
| Gravar rastreio + dados da NF | "Atualizando rastreamento completo (com os dados da N.F.)" |
| Gravar rastreio parcial | "Atualizando o rastreamento parcialmente" |
| Pedidos não integrados | "Consultando pedidos não integrados" |
| Marcar como integrado | "Setando um pedido como integrado" |

> **Situação e rastreamento/NF são famílias distintas de endpoint.** É o que se observa: o rastreio é gravado, os dados fiscais não.

> **"Reintegrar Pedido"** na tela de Situações provavelmente devolve o pedido à fila de não-integrados quando ele entra naquela situação, para o ERP buscá-lo de novo. **Não use como tentativa de conserto** — o sentido é oposto ao necessário, e há risco de duplicar documento no ERP. Todos os checkboxes estão desmarcados hoje, e é onde devem ficar.

---

*Documento consolidado a partir de análise em 03–05/08/2026 sobre a base de produção Sankhya (schema `SANKHYA`), painel Intelipost (conta 70552), painel administrativo e documentação oficial da Wake Commerce, código-fonte dos dois botões de ação da `TGFCAB`, e SDK oficial da Intelipost.*
