# Diagnóstico da Integração Wake ↔ Sankhya ↔ Intelipost

**BeBaby Group Importação** — Lojas: kikkaboobrasil e abcdesignbrasil (Wake Commerce)
**Conta Intelipost:** ID 70552
**Data da análise:** 03–04/08/2026
**Versão:** 2 (consolidada — substitui integralmente a v1)

**Objetivo:** identificar por que a situação do pedido na Wake não reflete os eventos logísticos da Intelipost, e definir o que corrigir, em cada sistema, para que passe a refletir.

---

## Índice

1. [Sumário executivo](#1-sumário-executivo)
2. [Topologia real](#2-topologia-real)
3. [O caso de referência](#3-o-caso-de-referência)
4. [Evidências no banco Sankhya](#4-evidências-no-banco-sankhya)
5. [Evidências nos webhooks Intelipost](#5-evidências-nos-webhooks-intelipost)
6. [Hipóteses testadas e descartadas](#6-hipóteses-testadas-e-descartadas)
7. [Diagnóstico consolidado](#7-diagnóstico-consolidado)
8. [**O que corrigir no Sankhya**](#8-o-que-corrigir-no-sankhya)
9. [O que corrigir na Intelipost](#9-o-que-corrigir-na-intelipost)
10. [O que corrigir na Wake](#10-o-que-corrigir-na-wake)
11. [Arquitetura alvo](#11-arquitetura-alvo)
12. [Plano de execução](#12-plano-de-execução)
13. [Queries de monitoramento](#13-queries-de-monitoramento)
14. [Pendências abertas](#14-pendências-abertas)
15. [Anexos](#15-anexos)

---

## 1. Sumário executivo

A situação do pedido na Wake congela em **"Em Preparação"** e nunca avança. A causa não é uma falha, são **duas falhas independentes**, cada uma atingindo um caminho diferente — e é essa combinação que fez o problema resistir a todos os testes intermediários.

Cada venda da loja própria gera **dois embarques** na Intelipost:

**Caminho 1 — embarque criado pela Wake** (integração nativa, na aprovação do pagamento)
Carrega `Canal de Vendas = Wake_kikkaboobrasil` e o ID do pedido Wake como referência. Não tem nota fiscal. O webhook **dispara e chega** com sucesso em `frete.fbits.net`. A Wake grava o código e a URL de rastreamento — e **não altera a situação do pedido**.

**Caminho 2 — embarque criado pelo Sankhya** (botão "Enviar para Intelipost", no faturamento)
Carrega a NF-e, o peso e a cubagem reais. Mas vem com `Canal de Vendas` **vazio** e usa o `NUNOTA` como referência. A regra de webhook da Intelipost filtra por Canal de Vendas, então **nenhum webhook é disparado**. Os eventos deste embarque nunca saem da Intelipost.

> **Resultado:** o embarque que chega na Wake é o que não tem nota fiscal, e não move o status. O embarque que tem a nota fiscal nunca chega. Por isso nada avança.

**Correção mínima para o objetivo declarado:** três ações, sendo duas na sua mão.

| # | Ação | Onde | Depende de terceiro? |
|---|---|---|---|
| 1 | Preencher `Canal de Vendas` e usar `AD_PEDIDOMKTPLACE` como referência no envio | **Sankhya** | Talvez — depende do tipo do botão |
| 2 | Desativar a regra de evento 64734 | **Intelipost** | Não |
| 3 | Endpoint `api/notificacoes/intelipost/{loja}` passar a alterar a situação do pedido | **Wake** | Sim — ticket na Wake |

---

## 2. Topologia real

A v1 deste relatório atribuiu o Caminho 1 à Tem Api. **Isso estava errado.** A Wake possui integração **nativa** com a Intelipost, confirmada no painel de parâmetros da loja.

### Quem faz o quê

| Sistema | Papel real | Identificador |
|---|---|---|
| **Wake Commerce** | Loja B2C. **Cota E cria embarque** na Intelipost via integração nativa. Recebe webhooks da Intelipost | ID do pedido (ex. `74923`, `75098`) |
| **Tem Api** | Traz o pedido Wake → Sankhya. Grava a situação "Em Preparação" **uma única vez** | — |
| **Sankhya** | Revisão, cotação, faturamento. Cria o embarque real via botão | `NUNOTA` (ex. `194260` pedido, `194280` nota) |
| **Intelipost** | Cotação, embarques, disparo de webhooks por regra de evento | `ID Intelipost` (ex. `695250186`) |

### Parâmetros da integração nativa Wake ↔ Intelipost

Localizados no painel da Wake, em Configurações → parâmetros (buscar por "Intelipost"):

| Parâmetro | Valor |
|---|---|
| Apresentação de Cotações da Intelipost | **Ativo** |
| Validar promoção de Frete Grátis | **Ativo** |
| Ativar/Desativar notificação de cotações | **Ativo** |
| Centros de Distribuição | `25,1032` |
| Token de Autenticação | *preenchido* |
| URL de integração | `https://api.intelipost.com.br/api/v1/quote_...` |
| Tempo Máximo de Busca de Cotações | `3` |
| Tipo de prioridade para cálculo de fretes | `2` |
| Acréscimo de dias no prazo de envio | `0` |

> ⚠️ **Segurança:** o Token de Autenticação da Intelipost fica legível nessa tela. Se um print dela circular em ticket ou e-mail, rotacione o token depois.

### O canal de retorno

```
Intelipost ──webhook──► https://frete.fbits.net//api/notificacoes/intelipost/kikkaboobrasil
```

Endpoint **nativo da Wake**, com o nome da loja no path. A Tem Api **não participa** deste fluxo. Existe endpoint equivalente para a loja abcdesignbrasil.

---

## 3. O caso de referência

**Cliente:** NILTON JOSE DE ALMEIDA COSTA JUNIIR — CPF 01499644396 — Belo Horizonte/MG — CEP 30320-080

| Sistema | Identificador |
|---|---|
| Wake | pedido `74923`, loja `Wake_kikkaboobrasil` |
| Sankhya — pedido | `NUNOTA 194260`, `TIPMOV P`, TOP `1722` |
| Sankhya — nota | `NUNOTA 194280`, `TIPMOV V`, TOP `1728`, `NUMNOTA 48122` |
| NF-e | 48122, série 1, R$ 1.979,10 |

### Os dois embarques, lado a lado

| | **Caminho 1 — criado pela Wake** | **Caminho 2 — criado pelo Sankhya** |
|---|---|---|
| Referência enviada | `74923` (ID Wake) ✅ | `194280` (NUNOTA) ❌ |
| **Canal de Vendas** | `Wake_kikkaboobrasil` ✅ | **vazio** ❌ |
| ID Intelipost | 695225333 | 695250186 |
| Cotação | 935450548146119 | — |
| Transportadora | Correios PAC | Rodonaves (Geral) Sorocaba |
| Volume | `2252` | `BOX` |
| Peso | 8,7 kg (catálogo Wake) | 15,2 kg (real) |
| Dimensões | 52 × 88 × 14 cm | 30 × 53 × 92 cm |
| PLP | 179315307 | 179344156 |
| Rastreio | `AP291459770BR` | — |
| **Nota fiscal** | **ausente** ❌ | **48122, série 1** ✅ |
| Custo de envio | R$ 69,67 | — |
| Frete cobrado | R$ 0,00 (frete grátis) | R$ 150,99 |
| Prazo | 9 dias úteis | 2 dias úteis |
| **Webhook disparado?** | **SIM** ✅ | **NÃO** ❌ |

### Timeline

**Caminho 1**
```
31/07 13:30  Embarcador   CRIADO
31/07 14:55  Intelipost   Pedido criado na transportadora com sucesso
31/07 14:55  Embarcador   DESPACHADO
31/07 14:55:50            ► webhook regra 65461 → frete.fbits.net → SUCESSO
```

**Caminho 2**
```
31/07 16:03  Embarcador   CRIADO
31/07 16:03  Embarcador   ETIQUETA CRIADA
31/07 16:30  Intelipost   Pedido criado na transportadora com sucesso
31/07 16:30  Embarcador   DESPACHADO
                          ► nenhum webhook
```

**Lado Wake** — uma única escrita: `Situação: Em Preparação — Atualizado por: Tem Api via API`

> Note que os eventos `DESPACHADO` em ambos têm Fonte = `Embarcador`, gravados na criação, sem despacho físico.

---

## 4. Evidências no banco Sankhya

> **Atenção ao schema.** A instância Oracle possui `SANKHYA` e `TESTE` espelhados. Qualifique sempre `SANKHYA.` — sem isso os resultados voltam duplicados e há risco de analisar o ambiente de teste.

---

### Q1 — Existe lógica de Intelipost no banco?

```sql
SELECT NAME, TYPE, LINE, TEXT
FROM ALL_SOURCE
WHERE UPPER(TEXT) LIKE '%INTELIPOST%'
ORDER BY NAME, LINE
```

**Resultado:** apenas `AD_APIINTELI_TRG` — trigger `BEFORE INSERT ON AD_APIINTELI` que preenche `ID_KEY` por sequence.

**Mostra que:** nenhuma stored procedure conversa com a Intelipost. O botão **não é** do tipo "Rotina no Banco de Dados" — é `Script (JavaScript)` ou `Rotina Java`. Revelou a tabela `AD_APIINTELI`.

---

### Q2 — Estrutura da AD_APIINTELI

```sql
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM ALL_TAB_COLUMNS
WHERE TABLE_NAME = 'AD_APIINTELI' AND OWNER = 'SANKHYA'
ORDER BY COLUMN_ID
```

**Resultado:** 6 colunas — `ID_KEY` (NUMBER), `ID_MAIN` (VARCHAR2 100), `VLRFRETE` (FLOAT), `NUMPEDIDO` (VARCHAR2 100), `METODOENVIO` (NUMBER), `IDCOTACAO` (NUMBER).

**Mostra que:**
- **Não há coluna de data, hora ou status de processamento.** A tabela é rascunho de payload, não trilha de auditoria. O único proxy temporal é o `ID_KEY` sequencial.
- `NUMPEDIDO` é texto livre sem constraint nem FK. **Nada no modelo impede que ali entre o ID Wake numa hora e o NUNOTA na outra.**

---

### Q3 — Quem lê ou escreve nessa tabela?

```sql
SELECT NAME, TYPE, LINE, TEXT
FROM ALL_SOURCE
WHERE UPPER(TEXT) LIKE '%AD_APIINTELI%'
ORDER BY NAME, LINE
```

**Resultado:** apenas o trigger de sequence. Confirma que a lógica está na camada de aplicação.

---

### Q4 — Os dados do caso na tabela de cotações

```sql
SELECT * FROM SANKHYA.AD_APIINTELI
WHERE NUMPEDIDO IN ('74923', '194280')
ORDER BY ID_KEY
```

**Resultado:** 6 linhas, **todas com `NUMPEDIDO = 194280`**. Nenhuma com `74923`.

| ID_KEY | ID_MAIN | VLRFRETE | METODOENVIO | IDCOTACAO |
|---|---|---|---|---|
| 54777 | `194280,998485357346617` | 123,71 | 1 | 1 |
| 54778 | `194280,998485357346617` | **150,99** | **17155** | 2 |
| 54779 | `194280,998485357346617` | 306,81 | 2 | 3 |
| 54862 | `194280,263001126033235` | 123,71 | 1 | 1 |
| 54863 | `194280,263001126033235` | **150,99** | **17155** | 2 |
| 54864 | `194280,263001126033235` | 306,81 | 2 | 3 |

**Mostra que:**
- É **cache de opções de cotação**, não fila de envio. Três linhas por lote = as três opções devolvidas.
- `ID_MAIN` é composto: `NUNOTA,ID_cotação_Intelipost`.
- Duas sessões de cotação para a mesma carga. Gap de 83 no `ID_KEY` entre os lotes indica sessões separadas, não duplo clique.
- `VLRFRETE 150,99` / `METODOENVIO 17155` corresponde ao frete cobrado do Caminho 2 — **confirma que o embarque do Sankhya saiu daqui**.
- **O lado Sankhya nunca usou o ID da Wake como referência.**
- `METODOENVIO` mistura `17155` (ID real de método) com `1` e `2` (índices). Possível mapeamento incompleto de transportadoras.

---

### Q5 — A cotação do Caminho 1 passou pelo Sankhya?

```sql
SELECT * FROM SANKHYA.AD_APIINTELI
WHERE ID_MAIN LIKE '%935450548146119%'
```

**Resultado:** **vazio.**

**Mostra que** o embarque do Caminho 1 não passou pelo ERP. Somado às demais evidências:

| Indício | Leitura |
|---|---|
| Cotação `935450548146119` inexistente no ERP | não passou pelo Sankhya |
| Custo R$ 69,67 não consta em nenhuma cotação do ERP | valor de outra fonte |
| `Canal de Vendas = Wake_kikkaboobrasil` | nomeado pela Wake |
| Referência = ID Wake | numeração nativa da Wake |
| Frete cobrado R$ 0,00 | regra de frete grátis da Wake (parâmetro ativo) |
| Peso 8,7 kg | cubagem do catálogo Wake |

**Conclusão:** criado pela **integração nativa da Wake**, a partir de dados do checkout.

---

### Q6 — Campos da TGFCAB: dicionário vs. realidade física

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

**Campos que EXISTEM fisicamente e formam o canal de retorno logístico:**

| Campo | Rótulo |
|---|---|
| `AD_PEDIDOMKTPLACE` | [Pedido Externo] — **guarda o ID Wake** |
| `AD_IDINTELIPOST` | Id Intelipost |
| `AD_MACROSTATUS` | Macro Status |
| `AD_STATUSLOG` | Status Logística |
| `AD_RASTREIO` | Código de Rastreio |
| `AD_DATACOLETA` | Data da Coleta |
| `AD_DATACOLETAEXP` | Data da Expedição |
| `AD_ENTREGA` | Entrega |
| `AD_VALORFRETE` | Valor do Frete |
| `AD_CANAL_MKTPLACE` | [Canal Marketplace] |

**Órfãos — só no dicionário, dão `ORA-00904`:**
`AD_CIDADE` · `AD_CNPJPARCEIRO` · `AD_CUBAGEMTOTAL` · `AD_DIFALPAGO` · `AD_NUMEROUNICOPEDIDO` · `AD_TIPPESSOA` · `AD_UF`

**Mostra que:**
- **"Macro Status" é vocabulário próprio da Intelipost.** Esses campos foram criados para receber o retorno logístico dessa plataforma. O projeto previa integração bidirecional completa.
- Há uma família VTEX (`AD_CODRASTREIOVTEX`, `AD_DTENTREGAVTEX`, `AD_URLRASTREIOVTEX`, `AD_VTEXMODALIDADE`, `AD_ORDERIDVTEXB2C`). A customização nasceu na era VTEX e foi adaptada para a Wake — provável explicação para a rotina desconhecer o campo do pedido Wake.

---

### Q7 — O caso: pedido e nota lado a lado

```sql
SELECT C.NUNOTA, C.NUMNOTA, C.TIPMOV, C.CODTIPOPER,
       C.AD_PEDIDOMKTPLACE, C.AD_IDINTELIPOST, C.AD_MACROSTATUS,
       C.AD_STATUSLOG, C.AD_RASTREIO, C.AD_VALORFRETE
FROM SANKHYA.TGFCAB C
WHERE C.NUNOTA = 194280
   OR C.NUNOTA IN (SELECT V.NUNOTAORIG FROM SANKHYA.TGFVAR V WHERE V.NUNOTA = 194280)
```

**Resultado:**

| NUNOTA | NUMNOTA | TIPMOV | TOP | `AD_PEDIDOMKTPLACE` | `AD_IDINTELIPOST` | `AD_MACROSTATUS` | `AD_STATUSLOG` | `AD_RASTREIO` | `AD_VALORFRETE` |
|---|---|---|---|---|---|---|---|---|---|
| 194280 | 48122 | V | 1728 | **74923** | *(vazio)* | *(vazio)* | 2 | *(vazio)* | 150,99 |
| 194260 | 32766 | P | 1722 | **74923** | *(vazio)* | *(vazio)* | *(vazio)* | *(vazio)* | 150,99 |

**Mostra que:**
- **`AD_PEDIDOMKTPLACE = 74923` nas duas linhas.** O ID Wake está no pedido **e** propaga corretamente para a nota. **A rotina tinha a chave disponível e optou por enviar o NUNOTA.** É defeito de implementação puro.
- `AD_IDINTELIPOST` vazio apesar de dois embarques criados.
- `AD_MACROSTATUS` e `AD_RASTREIO` vazios apesar de rastreio emitido.
- `AD_STATUSLOG = 2` só na nota — algo escreve nele. Provável flag interno de "enviado".
- `AD_VALORFRETE = 150,99` nas duas, enquanto a Wake cobrou R$ 0,00. O Sankhya conhece o custo real do frete.

---

### Q8 — Volume: preenchimento por campo

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
| 2.573 | 2.483 | 154 | **0** | **0** |

**Mostra que** a chave Wake está em 96,5% dos documentos, e que macro status e rastreio são **zero absoluto**. Os 90 sem chave provavelmente são vendas não-ecommerce (verificar se a TOP 1728 atende B2B).

---

### Q9 — Evolução mensal do `AD_IDINTELIPOST`

```sql
SELECT TO_CHAR(DTNEG, 'YYYY-MM') AS MES,
       COUNT(*) AS NOTAS,
       COUNT(AD_IDINTELIPOST) AS COM_ID_INTELIPOST
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND DTNEG >= DATE '2025-01-01'
GROUP BY TO_CHAR(DTNEG, 'YYYY-MM') ORDER BY 1
```

| Período | Notas | Com ID Intelipost |
|---|---|---|
| 2025-01 a 2025-05 | 787 / 651 / 778 / 860 / 962 | **0** em todos |
| 2025-06 a 2025-12 | 793 / 751 / 948 / 1.373 / 1.777 / 2.218 / 1.297 | 31 / 58 / 90 / 96 / 107 / 191 / 84 |
| 2026-01 a 2026-07 | 764 / 799 / 777 / 1.005 / 865 / 1.038 / 1.464 | 63 / 67 / 87 / 97 / 82 / 62 / 83 |
| 2026-08 (parcial) | 71 | 9 |

**Mostra que** o preenchimento começa em **junho/2025** e opera em faixa estável de 5–13% por 14 meses, sem tendência. Não é regressão — nunca funcionou plenamente. Note que as regras de webhook são de **maio/junho de 2026** — implantações de fases distintas, o que confirma que a integração foi montada em camadas por gente diferente ao longo de mais de um ano.

---

### Q10 — Recorte por canal de venda

```sql
SELECT NVL(AD_CANAL_MKTPLACE, 'SEM CANAL') AS CANAL,
       COUNT(*) AS NOTAS,
       COUNT(AD_IDINTELIPOST) AS COM_ID_INTELIPOST
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND DTNEG >= DATE '2026-01-01'
GROUP BY NVL(AD_CANAL_MKTPLACE, 'SEM CANAL') ORDER BY 2 DESC
```

| Canal | Notas | Com ID Intelipost |
|---|---|---|
| SHOPEE | 3.498 | 0 |
| MERCADO_LIVRE | 1.617 | 0 |
| **SEM CANAL** (loja própria) | **1.482** | **550** |
| AMAZON_GLOBAL | 171 | 0 |
| MAGALU / MAGAZINE_LUIZA / MELI / SHPS | 7 / 5 / 2 / 1 | 0 |

**Mostra que** marketplaces expedem por logística própria e **não transitam pela Intelipost** — zero é correto para eles. A taxa real relevante é da loja própria: **550 de 1.482 = 37%**, não os ~8% do total. **Qualquer métrica que misture marketplace subestima gravemente a taxa e é facilmente contestável.**

> ⚠️ Note que `AD_CANAL_MKTPLACE` é **NULL** para a loja própria. Isso é relevante para a correção (ver seção 8.1): esse campo **não serve** para determinar qual loja é a origem.

---

### Q11 — O número decisivo

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

O denominador é composto **exclusivamente** por documentos que a própria integração marcou como tendo gerado embarque. Não depende de mix de canal nem de interpretação.

> **Em 100% dos documentos que comprovadamente geraram embarque na Intelipost, ao longo de 14 meses, o retorno de macro status e código de rastreio nunca foi gravado no Sankhya. Nenhuma exceção em 1.207 casos.**

Dos 1.207: 550 de 2026, 657 de 2025.

---

## 5. Evidências nos webhooks Intelipost

### Q12 — Teste controlado no pedido 75098

**Caso:** pedido Wake `75098` (Maria Luiza Mendes, São José/SC), criado 02/08/2026 19:17. Embarque Correios PAC, frete R$ 16,20, **referenciado pelo ID Wake** — corretamente correlacionado.

**Campos na Wake** (modal "Dados de rastreio e NF-e do Pedido"):

| Campo | Valor |
|---|---|
| Cód. Rastreamento | `AP301250997BR` ✅ |
| Url Rastreamento | `https://status.ondeestameupedido.com/tracking/de598276...` ✅ |
| Nota fiscal / Chave / Série / Url NFE | *(todos vazios)* ❌ |
| Data de envio | *(vazio)* ❌ |
| CFOP | `0` |

**Webhooks disparados** (regra 65461, ambos com **Sucesso**):
```
03.08.2026 15:41:25   Despachado
03.08.2026 17:00:11   Em trânsito
```

**Situação na Wake ao longo de tudo isso:** `Em Preparação`. Nunca mudou.

**Mostra que:**
- **Rastreio É gravado** pelo endpoint da Wake. Corrige o D5 da v1: o que falta são exclusivamente os dados fiscais.
- **A Wake recebe eventos de status, responde 200, e não converte em situação do pedido.** Esta é a falha do Caminho 1, e é uma falha de produto da Wake.
- A URL de rastreamento gravada aponta para a página da Intelipost, que **atualiza ao vivo**. O cliente vê "Em Preparação" na loja e "Pedido em trânsito" ao clicar no rastreio — informação contraditória na mesma jornada.
- Qualquer automação ancorada na situação da Wake (fluxos de CRM, disparos de WhatsApp por status, régua de pós-venda) nunca recebe os eventos de envio e entrega.

---

### Q13 — Teste comparativo: os dois embarques da mesma venda

**Tela:** Intelipost → Módulo de Comunicação → Webhook → Lista de webhooks
**Período:** `06/07/2026 a 31/07/2026` · **Aba:** `Todos envios`

| Busca | Resultado |
|---|---|
| `74923` (Caminho 1, canal preenchido, sem NF) | **1 webhook** — 31.07.2026 14:55:50, status `Despachado`, regra `65461`, **Sucesso**, URL `https://frete.fbits.net//api/notificacoes/intelipost/kikkaboobrasil` |
| `194280` (Caminho 2, canal vazio, **com NF 48122**) | **Nenhum webhook encontrado** |

**Mostra que — esta é a evidência central do diagnóstico:**

1. A retenção de 30 dias **não** explica o vazio: 31/07 está na janela, e o registro do 74923 está lá.
2. Eventos de `Fonte: Embarcador` **disparam** webhook normalmente. O `DESPACHADO` das 14:55 gerou disparo.
3. O embarque com a nota fiscal **não gera webhook nenhum**.
4. A única diferença estrutural entre os dois registros é o **`Canal de Vendas`** — e ele é uma **condição ativa** na regra 65461, a única que aponta para a Wake.

> **O webhook funciona corretamente, e entrega o embarque errado.**

---

### Q14 — Regras de evento configuradas na Intelipost

**Tela:** Webhook → Regras de evento

| Prior. | ID | Nome | Criado | Ativo |
|---|---|---|---|---|
| 1 | 60190 | Não altera status Entregue | 07/03/2025 | não |
| 2 | 60745 | Re-calcular previsão de entrega | 01/05/2025 | não |
| 3–8 | 60184–60189 | E-mail: Criado, Despachado, Em Trânsito, Saiu para Entrega, Entregue, Cancelado | 07/03/2025 | não |
| 9 | **64734** | **Webhook Wake** | 12/05/2026 | **SIM** ⚠️ |
| 10 | **65461** | **Webhook Wake_kikkaboobrasil** | 22/06/2026 | **SIM** |
| 11 | **65462** | **Webhook Wake_abcdesignbrasil** | 22/06/2026 | **SIM** |

**Configuração da 65461 (correta):**
- Condições ativas: `Evento Entrando` + **`Canal de Vendas`**
- Ação única: `Notificação por #Webhook-0` → `https` · `frete.fbits.net/` · `api/notificacoes/intelipost/kikkabo...` · Basic
- `Enviar por Pedido` · Destino `Avançado`

**Configuração da 64734 (incorreta):**
- Condição ativa: **apenas** `Evento Entrando` — **sem** filtro de Canal de Vendas
- Ação: `Notificação por #Webhook-0` → `https` · **`abcdesignbrasil.com.br`** · **`/checkout`** · Basic
- `Enviar para: Cliente`

**Mostra que:**
- **As regras de evento não alteram status.** O dropdown de ações oferece `Não alterar status`, `Substituição de status`, `Adicionar prazo de entrega`, `Re-calcular previsão de entrega`, `Notificações` (E-mail, SMS, WhatsApp, Webhook), `Ajustar Data/Horário`, `Logs de Add/Events`. A 65461 usa **apenas** Notificação por Webhook. **Toda a conversão de evento em situação do pedido é responsabilidade do endpoint da Wake.**
- A regra **64734 aponta para a página de checkout de uma vitrine**, não para um endpoint de API. É resíduo de 12/05/2026, anterior às regras por loja de 22/06, e nunca foi limpa.
- Enquanto a 64734 estiver ativa, **credenciais Basic são transmitidas a cada evento para uma URL pública de vitrine**. Se aquele servidor registrar headers, as credenciais estão em log.
- O filtro `Canal de Vendas` na 65461 é **legítimo** — existe para rotear cada loja ao seu endpoint. A correção **não** é remover o filtro.

**Detalhe técnico:** o Host da 65461 termina com barra (`frete.fbits.net/`) e o Path começa sem barra, produzindo o `//` duplo no log. Correção de um caractere. Os retornos são Sucesso, então não é a causa do problema — mas convém corrigir antes que a Wake use isso como contra-argumento.

---

## 6. Hipóteses testadas e descartadas

Documentadas para evitar relitígio. Cada uma parecia plausível e foi refutada por dado.

| Hipótese | Por que parecia certa | Como foi refutada |
|---|---|---|
| A cotação "rouba o lugar" do envio real | O status muda exatamente na cotação | Q4/Q5: são dois shipment orders distintos, não sobrescrita |
| O campo `AD_*` se perde no faturamento | Padrão do Sankhya: campos customizados não propagam automaticamente | Q7: `AD_PEDIDOMKTPLACE = 74923` nas duas linhas. Propaga corretamente |
| O botão envia dois payloads num clique | Dois registros na Intelipost | Q5: a cotação do Caminho 1 não existe no ERP |
| A Tem Api nunca grava o ID Wake no Sankhya | Explicaria a rotina usar NUNOTA | Q7/Q8: campo preenchido em 96,5% dos documentos |
| Os campos de retorno são só dicionário | `ORA-00904` em `AD_NUMEROUNICOPEDIDO` revelou órfãos | Q6: os dez campos do canal de retorno existem fisicamente |
| Taxa de falha do canal é ~92% | Q8 mostrava 154 de 2.573 | Q10: marketplaces não usam Intelipost. Taxa real da loja própria é 37% |
| **A Tem Api cria o embarque do Caminho 1** | Era o integrador conhecido | Painel Wake: integração **nativa** com Intelipost, ativa. Todos os dados do Caminho 1 são nativos da Wake |
| **Não existe webhook configurado** | Status não avançava com nenhum evento | Q12/Q13: webhook existe, dispara e retorna Sucesso |
| **Eventos de `Fonte: Embarcador` não disparam webhook** | Os webhooks do 75098 coincidiram com alteração manual | Q13: o `DESPACHADO` de fonte Embarcador do 74923 disparou às 14:55:50 |
| **A regra 64734 é o destino alternativo do embarque real** | Não tem filtro de canal, deveria pegar tudo | Q13: a busca por `194280` não retornou **nenhum** webhook, nem da 64734 |

**Lição de método:** a resposta plausível não é a resposta verificada. Seis conclusões deste relatório foram revistas ao longo da investigação, todas por confronto com dado observado. Quando um fornecedor responder ao ticket, a resposta provável será uma explicação plausível sem evidência — este documento existe para permitir cobrar o dado.

---

## 7. Diagnóstico consolidado

| # | Defeito | Onde corrigir | Severidade |
|---|---|---|---|
| **D1** | `Canal de Vendas` vazio no embarque criado pelo Sankhya → **nenhum webhook é disparado** para o embarque que tem a NF | **Sankhya** | **Crítica — causa raiz do Caminho 2** |
| **D2** | Endpoint `api/notificacoes/intelipost/{loja}` da Wake recebe eventos de status, responde 200, grava rastreio e **não altera a situação do pedido** | **Wake** | **Crítica — causa raiz do Caminho 1** |
| **D3** | Rotina do Sankhya envia `NUNOTA` como referência, tendo `AD_PEDIDOMKTPLACE` preenchido no mesmo registro | **Sankhya** | Crítica — impede conciliação após D1 |
| **D4** | Integração nativa da Wake cria embarque **real** na aprovação do pagamento, gerando PLP, etiqueta e ordem na transportadora para mercadoria não faturada | **Wake** | Crítica — passivo financeiro |
| **D5** | Regra 64734 ativa, apontando para `abcdesignbrasil.com.br/checkout`, transmitindo credenciais Basic para URL pública | **Intelipost** | Alta — segurança |
| **D6** | `DESPACHADO` gravado com Fonte = `Embarcador` na criação, sem despacho físico | Wake / Sankhya | Alta |
| **D7** | Dados fiscais (número, série, chave, URL da NF) nunca gravados na Wake | Wake / Sankhya | Alta |
| **D8** | Canal de retorno Intelipost → Sankhya inativo: 0 de 1.207 com macro status ou rastreio | **Sankhya** | Alta — observabilidade |
| **D9** | Divergência de cubagem: 8,7 kg no checkout vs. 15,2 kg na carga faturada | Wake / cadastro | Média — margem |
| **D10** | `AD_APIINTELI` sem coluna de data ou status de processamento — auditoria impossível | **Sankhya** | Média |
| **D11** | Barra dupla na URL do webhook (`frete.fbits.net/` + path sem barra) | **Intelipost** | Baixa |
| **D12** | Ausência de log de eventos órfãos em qualquer ponto da cadeia | Wake / Tem Api | Alta |

---

## 8. O que corrigir no Sankhya

Esta é a seção operacional. Todas as correções abaixo estão no payload ou na lógica do botão **"Enviar para Intelipost"**.

### 8.0 — Primeiro: localizar o botão

**Dicionário de Dados → localizar `TGFCAB` → aba "Ações"**. Verifique o campo **Tipo**:

| Tipo | Implicação |
|---|---|
| `Script (JavaScript)` | Código visível e editável na própria configuração. **Vocês corrigem internamente.** Melhor cenário |
| `Rotina Java` | Aponta para classe compilada. Exige fonte e redeploy |
| Não aparece no Dicionário | Criado via Add-on/Studio com `@ActionButton`, vive no código do servidor. Exige fonte e redeploy |

Q1 e Q3 já eliminaram `Rotina no Banco de Dados`. Verifique também se existe **mais de uma** ação com nome semelhante.

---

### 8.1 — [CRÍTICO] Preencher o `Canal de Vendas` no payload

**Esta é a correção que destrava o Caminho 2.** Sem ela, o embarque com a NF continua invisível para a Wake.

O payload enviado à Intelipost deve incluir o campo de canal de vendas com o valor que a regra 65461 espera — presumivelmente `Wake_kikkaboobrasil` para a Kikkaboo e o equivalente para a ABC Design.

**⚠️ Problema a resolver antes:** como o botão descobre de qual loja o pedido é?

`AD_CANAL_MKTPLACE` **não serve** — Q10 mostrou que ele é `NULL` justamente para a loja própria, que é o caso que nos interessa. É preciso outro discriminador. Query exploratória:

```sql
SELECT C.CODEMP,
       C.AD_CODPROJML,
       C.AD_CODPROJVTEX,
       COUNT(*) AS NOTAS
FROM SANKHYA.TGFCAB C
WHERE C.TIPMOV = 'V' AND C.CODTIPOPER = 1728
  AND C.AD_CANAL_MKTPLACE IS NULL
  AND C.DTNEG >= DATE '2026-07-01'
GROUP BY C.CODEMP, C.AD_CODPROJML, C.AD_CODPROJVTEX
ORDER BY 4 DESC
```

Se `CODEMP` diferir entre as duas lojas, ele é o discriminador natural. Se não, verifique projeto (`CODPROJ`), série da nota, ou algum outro campo `AD_` de origem. **Definir isso é pré-requisito da correção.**

**Como confirmar o valor exato esperado:** na regra 65461 da Intelipost, a condição "Canal de Vendas" contém o valor filtrado. Cuidado ao abrir — clicar no botão da condição **desmarca** ela; saia sem salvar. Alternativamente, compare com o valor que aparece nos embarques criados pela Wake (`Wake_kikkaboobrasil`), que comprovadamente passam no filtro.

---

### 8.2 — [CRÍTICO] Usar `AD_PEDIDOMKTPLACE` como referência

Trocar o valor enviado no campo de referência do pedido (`order_number` / `sales_order_number` / "Pedido de Venda") de `NUNOTA` para **`AD_PEDIDOMKTPLACE`**.

O `NUNOTA` deve permanecer no payload como **campo secundário**, para a operação conseguir localizar o documento no ERP.

**Por que 8.1 e 8.2 devem entrar juntas:** corrigir só o canal faz o webhook disparar, mas com referência `194280`, que a Wake não resolve — o evento chega e é descartado. Corrigir só a referência não faz o webhook disparar. As duas são necessárias e nenhuma é suficiente.

---

### 8.3 — [CRÍTICO] Trava de estado no botão

O botão só deve permitir envio quando o documento for a **nota faturada com NF-e autorizada**:

```sql
SELECT NUNOTA, NUMNOTA, SERIENOTA, TIPMOV, CODTIPOPER, STATUSNFE,
       AD_PEDIDOMKTPLACE, AD_IDINTELIPOST
FROM SANKHYA.TGFCAB
WHERE NUNOTA = :NUNOTA
```

**Condições de elegibilidade:**

| Campo | Valor exigido |
|---|---|
| `TIPMOV` | `'V'` (venda) — bloquear `'P'` (pedido) |
| `CODTIPOPER` | `1728` — bloquear `1722` |
| `NUMNOTA` | não nulo |
| `STATUSNFE` | indicando autorizada |
| `AD_PEDIDOMKTPLACE` | não nulo |
| `AD_IDINTELIPOST` | **nulo** — evita reenvio duplicado |

> **Confirme os valores de `TIPMOV`, `CODTIPOPER` e `STATUSNFE` na sua base.** TOP e status são configurados por empresa; os valores acima vêm do caso analisado.

A condição `AD_IDINTELIPOST IS NULL` só funciona depois de 8.4.

---

### 8.4 — [ALTA] Popular `AD_IDINTELIPOST` no retorno da chamada

Ao criar o embarque, a API da Intelipost retorna o ID do shipment order. Gravar esse valor em `AD_IDINTELIPOST` no documento.

Ganhos: join direto Sankhya ↔ Intelipost por SQL, base para a trava anti-reenvio de 8.3, e a métrica M1 passa a ser confiável.

---

### 8.5 — [ALTA] Receber o retorno de status nos campos existentes

Os campos abaixo existem fisicamente e estão vazios em 1.207 de 1.207 documentos. Precisam ser populados a partir dos eventos da Intelipost:

| Campo | Conteúdo |
|---|---|
| `AD_MACROSTATUS` | macro status atual do embarque |
| `AD_RASTREIO` | código de rastreio |
| `AD_DATACOLETA` | data da coleta |
| `AD_DATACOLETAEXP` | data da expedição |
| `AD_ENTREGA` | data/confirmação de entrega |

**Como:** criar uma **quarta regra de evento** na Intelipost, com webhook apontando para um endpoint do Sankhya (ou para um serviço intermediário), com o mesmo filtro de canal. Isso é adição de configuração, não alteração das regras existentes — risco baixo.

Isso transforma o Sankhya em fonte de auditoria consultável por SQL, e vocês deixam de depender de fornecedor para diagnosticar.

---

### 8.6 — [MÉDIA] Adicionar colunas de auditoria à `AD_APIINTELI`

A tabela tem 6 colunas e nenhuma de tempo ou status. Sugestão de acréscimo:

| Coluna | Tipo | Finalidade |
|---|---|---|
| `DHINCLUSAO` | `DATE` | quando a cotação foi registrada |
| `STATUSPROC` | `VARCHAR2(20)` | pendente / enviado / erro |
| `DHENVIO` | `DATE` | quando o embarque foi criado |
| `RETORNOAPI` | `VARCHAR2(4000)` | corpo da resposta da Intelipost |

Com `RETORNOAPI` preenchido, qualquer falha futura de envio passa a ser diagnosticável sem abrir ticket.

---

### 8.7 — [MÉDIA] Revisar o mapeamento de `METODOENVIO`

Q4 mostrou valores misturados: `17155` (aparente ID real de método Intelipost) ao lado de `1` e `2` (aparentes índices internos). Comparar com os métodos de envio cadastrados na Intelipost e corrigir o mapeamento onde estiver incompleto.

---

### 8.8 — [BAIXA] Investigar `AD_STATUSLOG`

É o único campo da família com algum valor (`2` na nota do caso). Algo escreve nele.

```sql
SELECT AD_STATUSLOG, COUNT(*) AS QTD
FROM SANKHYA.TGFCAB
WHERE CODTIPOPER = 1728 AND TIPMOV = 'V'
GROUP BY AD_STATUSLOG
ORDER BY 2 DESC
```

Se houver apenas dois ou três valores distintos, é provável flag interno de "enviado para Intelipost" — e vocês ganham um jeito de identificar quais documentos foram enviados, mesmo antes de 8.4 entrar.

---

### 8.9 — [BAIXA] Limpar os campos órfãos do dicionário

`AD_CIDADE` · `AD_CNPJPARCEIRO` · `AD_CUBAGEMTOTAL` · `AD_DIFALPAGO` · `AD_NUMEROUNICOPEDIDO` · `AD_TIPPESSOA` · `AD_UF`

Existem no dicionário e não na tabela. Não bloqueiam nada hoje, mas se algum layout ou regra referenciar um deles, o usuário vê `ORA-00904` em tela. Sem urgência.

---

## 9. O que corrigir na Intelipost

### 9.1 — [ALTA, imediato] Desativar a regra de evento 64734

Aponta para `abcdesignbrasil.com.br/checkout`, uma página de vitrine, e transmite credenciais Basic a cada evento. É resíduo de 12/05/2026, anterior às regras por loja. **Não há cenário em que deva continuar ativa.**

Não depende de terceiro e pode ser feito hoje.

### 9.2 — [BAIXA] Corrigir a barra dupla na 65461

Host `frete.fbits.net/` com barra final + Path `api/...` sem barra inicial = `//` na URL. Remover uma das duas.

### 9.3 — [MÉDIA] Verificar a cobertura de `Evento Entrando` na 65461

Confirmado que `Despachado` e `Em trânsito` estão incluídos. **Verificar se `Entregue`, `Saiu para Entrega` e status de exceção (problema, devolvido, cancelado) também estão.** Se não, há uma segunda lacuna esperando depois que D2 for corrigido.

### 9.4 — [MÉDIA] Criar a regra de retorno para o Sankhya

Pré-requisito de 8.5. Nova regra, mesmo filtro de canal, webhook apontando para endpoint do Sankhya.

### 9.5 — [BAIXA] Explorar a ação "Logs de Add/Events"

Aparece no dropdown de ações das regras de evento. Pode ser a trilha de auditoria que falta na cadeia. Vale investigar depois que o urgente estiver resolvido.

### ⚠️ Cuidados ao editar regras de evento

1. **Clicar no botão de uma condição a DESMARCA** — não expande. Se clicar em "Canal de Vendas" por engano, saia da tela **sem salvar**.
2. **O navegador faz autofill dos campos de autenticação** com `marketplace@bebaby.com.br` e senha. Salvar com isso preenchido **sobrescreve a credencial real do webhook e derruba a integração que hoje funciona parcialmente.** Limpe os dois campos antes de salvar qualquer alteração, ou confirme com a Intelipost qual credencial deveria estar ali.
3. O dropdown "Adicionar ação" **cria** uma ação nova ao selecionar. Não selecione nada ao apenas inspecionar.
4. Rotacione o Token de Autenticação da Intelipost se prints do painel da Wake circularem.

---

## 10. O que corrigir na Wake

Estes dois itens exigem ticket na Wake. **O D2 é o único bloqueio real que não está na sua mão.**

### 10.1 — [CRÍTICO] Endpoint de notificação não altera a situação do pedido

**Texto sugerido para o ticket:**

> O endpoint `https://frete.fbits.net/api/notificacoes/intelipost/kikkaboobrasil` recebe eventos de macro status da Intelipost, responde com sucesso e grava o código e a URL de rastreamento no pedido — mas **não altera a situação do pedido**.
>
> **Evidência.** Pedido 75098. Webhooks disparados pela Intelipost, ambos com retorno de sucesso registrado no log da Intelipost:
> - 03/08/2026 15:41:25 — status `Despachado`
> - 03/08/2026 17:00:11 — status `Em trânsito`
>
> A situação do pedido permaneceu em "Em Preparação" durante e após ambos os eventos. O histórico de situações registra uma única escrita externa, de outra origem.
>
> Solicitamos: (a) confirmação de quais macro status da Intelipost o endpoint converte em situação de pedido, se algum; (b) onde consultamos o log de processamento desse endpoint; (c) qual o comportamento esperado quando o evento chega com uma referência que não corresponde a nenhum pedido da loja.

### 10.2 — [CRÍTICO] Integração nativa cria embarque real antes do faturamento

A integração nativa Wake ↔ Intelipost está criando shipment order completo (com PLP, etiqueta e ordem na transportadora) na aprovação do pagamento, para mercadoria ainda não faturada.

**Solicitar:** parâmetro ou configuração que limite a integração nativa a **cotação apenas**, sem criação de embarque.

Se a Wake não oferecer essa opção, a alternativa é inverter o desenho: manter o embarque da Wake como único e fazer o Sankhya **atualizar** esse embarque no faturamento em vez de criar outro. Isso tem risco — a Intelipost pode não permitir troca de transportadora após geração de etiqueta —, então a primeira opção é preferível.

### 10.3 — [ALTA] Dados fiscais no pedido

Os campos Nota fiscal, Chave de Acesso, Série e Url da NFE permanecem vazios (Q12). Definir quem os grava: se via endpoint de rastreamento completo chamado pelo Sankhya/Tem Api, ou se o endpoint de notificação deveria recebê-los da Intelipost.

---

## 11. Arquitetura alvo

### Princípios

1. **Uma única chave de correlação** — o ID do pedido Wake atravessa os três sistemas. O `NUNOTA` trafega apenas como campo secundário.
2. **Um único embarque por venda**, criado no faturamento, quando peso, valor e cubagem são definitivos.
3. **Canal de Vendas sempre preenchido** — é o que roteia o evento ao endpoint correto.
4. **Status reflete fato, não intenção** — `DESPACHADO` vem do evento da transportadora, não do embarcador na criação.

### Fluxo correto

| Etapa | Ação | Situação na Wake |
|---|---|---|
| 1 | Checkout — cotação de frete (somente cotação, nada criado) | *sem escrita* |
| 2 | Pedido criado na Wake | Aguardando pagamento |
| 3 | Pagamento aprovado (gateway) | Pago |
| 4 | Tem Api baixa o pedido, grava ID Wake em `AD_PEDIDOMKTPLACE` | Em separação |
| 5 | Logística cota frete no Sankhya (somente cotação) | *sem escrita* |
| 6 | Faturamento, NF-e autorizada → cria **1** embarque com canal + `AD_PEDIDOMKTPLACE` | Faturado + NF + rastreio |
| 7 | Transportadora despacha → webhook regra 65461 → endpoint Wake | Enviado |
| 8 | Trânsito e entrega → webhook | Entregue |

### A cadeia de status, elo por elo

```
Intelipost: evento de macro status
    │
    │  regra 65461 avalia: Evento Entrando + Canal de Vendas
    │  ┌──────────────────────────────────────────────┐
    │  │ ELO 1 — Canal de Vendas preenchido?          │  ← D1, corrigir no Sankhya
    │  └──────────────────────────────────────────────┘
    ▼
POST https://frete.fbits.net/api/notificacoes/intelipost/{loja}
    │  ┌──────────────────────────────────────────────┐
    │  │ ELO 2 — referência resolve para um pedido?   │  ← D3, corrigir no Sankhya
    │  └──────────────────────────────────────────────┘
    │  ┌──────────────────────────────────────────────┐
    │  │ ELO 3 — endpoint converte em situação?       │  ← D2, ticket na Wake
    │  └──────────────────────────────────────────────┘
    ▼
Situação do pedido atualizada + rastreio + NF
```

Hoje o Caminho 1 quebra no **Elo 3**. O Caminho 2 quebra no **Elo 1**. Os três elos precisam existir simultaneamente.

### Requisitos não funcionais

- **Idempotência** — escritas seguras para repetir; retry de rede não duplica efeito.
- **Não-regressão de status** — definir precedência entre situações; "Entregue" não volta para "Em trânsito".
- **Log de eventos órfãos** — referência não resolvida vai para fila visível e alertável. **Sua ausência é o que permitiu 14 meses de falha silenciosa.**
- **Reconciliação diária** — job comparando Wake × Sankhya × Intelipost. Rede de segurança para webhook perdido.

---

## 12. Plano de execução

### Fase 0 — Imediato, sem depender de ninguém

| # | Ação | Onde | Ref. |
|---|---|---|---|
| 0.1 | **Desativar a regra de evento 64734** | Intelipost | 9.1 |
| 0.2 | Rotacionar o Token de Autenticação da Intelipost se prints circularam | Intelipost / Wake | §2 |
| 0.3 | Levantar e cancelar embarques indevidos abertos | Intelipost | D4 |
| 0.4 | Verificar com os Correios se PLPs não postadas geram cobrança | Correios | D4 |
| 0.5 | Confirmar se embarques fantasma têm notificação ao destinatário ativa | Intelipost | D4 |
| 0.6 | Verificar quais automações de CRM/WhatsApp dependem da situação na Wake | Kommo | Q12 |

### Fase 1 — Descoberta (bloqueia a Fase 2)

| # | Ação | Ref. |
|---|---|---|
| 1.1 | Identificar o **Tipo** do botão no Dicionário de Dados | 8.0 |
| 1.2 | Definir o discriminador de loja (`CODEMP`? projeto?) | 8.1 |
| 1.3 | Confirmar o valor exato esperado no filtro Canal de Vendas | 8.1 |
| 1.4 | Confirmar valores de `TIPMOV`, `CODTIPOPER`, `STATUSNFE` na base | 8.3 |

### Fase 2 — As correções que destravam o Caminho 2 (entram juntas)

| # | Ação | Ref. |
|---|---|---|
| 2.1 | Preencher `Canal de Vendas` no payload | 8.1 |
| 2.2 | Usar `AD_PEDIDOMKTPLACE` como referência | 8.2 |
| 2.3 | Trava de estado no botão | 8.3 |
| 2.4 | Popular `AD_IDINTELIPOST` no retorno | 8.4 |

> Após esta fase, o embarque com a NF passa a gerar webhook e a chegar na Wake com referência resolvível. O status só avança de fato quando o D2 (Fase 3) também estiver corrigido.

### Fase 3 — Ticket na Wake (bloqueio externo)

| # | Ação | Ref. |
|---|---|---|
| 3.1 | Endpoint de notificação passar a alterar a situação do pedido | 10.1 |
| 3.2 | Limitar a integração nativa a cotação apenas | 10.2 |
| 3.3 | Definir a gravação dos dados fiscais | 10.3 |

### Fase 4 — Observabilidade

| # | Ação | Ref. |
|---|---|---|
| 4.1 | Criar regra de evento de retorno para o Sankhya | 9.4 |
| 4.2 | Popular `AD_MACROSTATUS`, `AD_RASTREIO`, datas | 8.5 |
| 4.3 | Colunas de auditoria na `AD_APIINTELI` | 8.6 |
| 4.4 | Log de eventos órfãos | D12 |
| 4.5 | Job de reconciliação diária | §11 |

### Fase 5 — Limpeza

| # | Ação | Ref. |
|---|---|---|
| 5.1 | Corrigir barra dupla na 65461 | 9.2 |
| 5.2 | Verificar cobertura de status na 65461 | 9.3 |
| 5.3 | Revisar mapeamento de `METODOENVIO` | 8.7 |
| 5.4 | Investigar `AD_STATUSLOG` | 8.8 |
| 5.5 | Alinhar cubagem checkout × faturamento | D9 |
| 5.6 | Limpar campos órfãos do dicionário | 8.9 |

---

## 13. Queries de monitoramento

### M1 — Saúde do canal de retorno (métrica principal)

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

**Linha de base: 1.207 / 0 / 0.** Meta após Fase 4: `PCT_STATUS` próximo de 100.

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

**Linha de base: 37%** (550 de 1.482 em 2026). Meta: ~100%.

### M3 — Detectar cotação repetida (proxy de embarque duplicado)

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
SELECT NUNOTA, NUMNOTA, DTNEG, AD_CANAL_MKTPLACE
FROM SANKHYA.TGFCAB
WHERE TIPMOV = 'V' AND CODTIPOPER = 1728
  AND AD_PEDIDOMKTPLACE IS NULL
  AND DTNEG >= DATE '2026-06-01'
ORDER BY DTNEG DESC
```

Base: 90 de 2.573. Verificar se são B2B legítimos ou falha de gravação.

### M5 — Teste de webhook (Intelipost, sem SQL)

Intelipost → Webhook → Lista de webhooks, aba **"Todos envios"**, período ampliado.

Buscar o `AD_PEDIDOMKTPLACE` e o `NUNOTA` do mesmo documento. **Após a Fase 2, ambos devem convergir para um único embarque, disparando pela regra 65461.**

Registros ficam disponíveis **30 dias** — para casos antigos, escolher documentos recentes:

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

Retorna todos os pedidos que entraram em preparação e nunca saíram. Exportar para acompanhar a redução.

---

## 14. Pendências abertas

| # | Pendência | Como resolver | Bloqueia |
|---|---|---|---|
| **P1** | **Tipo do botão "Enviar para Intelipost"** | Dicionário de Dados → TGFCAB → aba Ações | Define se a Fase 2 é interna ou de fornecedor |
| **P2** | **Discriminador de loja no Sankhya** | Query de 8.1 (`CODEMP`, projeto) | Pré-requisito de 8.1 |
| **P3** | **Valor exato no filtro Canal de Vendas da regra 65461** | Inspecionar sem salvar, ou espelhar `Wake_kikkaboobrasil` | Pré-requisito de 8.1 |
| P4 | Por que a regra 64734, sem filtro de canal, também não disparou para `194280`? | Hipótese: `Enviar para: Cliente` + campo "Notificações por" vazio no embarque. Verificar | Nenhum — não muda a correção, mas é ponta solta |
| P5 | `Evento Entrando` da 65461 cobre `Entregue` e exceções? | Inspecionar a condição | Fase 5.2 |
| P6 | Significado dos valores de `AD_STATUSLOG` | Query de 8.8 | Fase 5.4 |
| P7 | Movimentação do rastreio `AP291459770BR` | Consulta Correios | Severidade do passivo |
| P8 | PLPs não postadas geram cobrança? | Correios / contrato | Dimensiona o passivo financeiro |
| P9 | Valores de `TIPMOV`, `CODTIPOPER`, `STATUSNFE` na base | Cadastro de TOPs | Fase 2.3 |
| P10 | TOP 1728 atende também B2B? | Cadastro de TOPs | Interpreta os 90 de M4 |
| P11 | O mesmo diagnóstico se aplica a abcdesignbrasil? | Repetir Q8–Q13 para a loja | Escopo dos tickets |
| P12 | A ação "Logs de Add/Events" da Intelipost serve como trilha? | Explorar na regra | Fase 4.4 |

---

## 15. Anexos

### A — Campos da TGFCAB

**Canal de retorno logístico (existem fisicamente):**

| Campo | Rótulo | Populado? |
|---|---|---|
| `AD_PEDIDOMKTPLACE` | [Pedido Externo] — ID Wake | **sim, 96,5%** |
| `AD_IDINTELIPOST` | Id Intelipost | parcial, 37% na loja própria |
| `AD_MACROSTATUS` | Macro Status | **não — 0 de 1.207** |
| `AD_RASTREIO` | Código de Rastreio | **não — 0 de 1.207** |
| `AD_STATUSLOG` | Status Logística | parcial, valores a investigar |
| `AD_DATACOLETA` | Data da Coleta | não verificado |
| `AD_DATACOLETAEXP` | Data da Expedição | não verificado |
| `AD_ENTREGA` | Entrega | não verificado |
| `AD_VALORFRETE` | Valor do Frete | sim |
| `AD_CANAL_MKTPLACE` | [Canal Marketplace] | sim, mas **NULL na loja própria** |

**Órfãos de dicionário (`ORA-00904`):**
`AD_CIDADE` · `AD_CNPJPARCEIRO` · `AD_CUBAGEMTOTAL` · `AD_DIFALPAGO` · `AD_NUMEROUNICOPEDIDO` · `AD_TIPPESSOA` · `AD_UF`

**Herança VTEX:**
`AD_CODRASTREIOVTEX` · `AD_DTENTREGAVTEX` · `AD_DTENVIORVTEX` · `AD_URLRASTREIOVTEX` · `AD_VTEXMODALIDADE` · `AD_MKTCAMPANHAVTEX` · `AD_MKTMIDIAVTEX` · `AD_MKTORIGEMVTEX` · `AD_ORDERIDVTEXB2C` · `AD_CODPROJVTEX`

### B — Endpoints e acessos Wake

| Recurso | URL |
|---|---|
| Swagger / API Explorer | `https://api.fbits.net/swagger` |
| Portal do desenvolvedor | `https://wakecommerce.readme.io/` |
| Documentação de situação de pedido | `https://api.fbits.net/Documentacao/SituacaoPedido` |
| Documentação de gestão de pedidos | `https://api.fbits.net/Documentacao/GestaoPedidos` |
| Endpoint de notificação Intelipost (kikkaboo) | `https://frete.fbits.net/api/notificacoes/intelipost/kikkaboobrasil` |

Menu do portal: **Referências de API → API Pública**. Limite: **120 requisições/minuto por token e por grupo de endpoints**.

**Endpoints relevantes:**

| Finalidade | Endpoint |
|---|---|
| Listar IDs das situações da loja | "Retorna todas as situações de pedido da loja" |
| Atualizar situação | `PUT /pedidos/{pedidoId}/status`, corpo `{"id": N}` |
| Histórico de situações | "Retorna o histórico de situações de um pedido" |
| Gravar rastreio + dados da NF | "Atualizando rastreamento completo (com os dados da N.F.)" |
| Gravar rastreio parcial | "Atualizando o rastreamento parcialmente" |
| Pedidos não integrados | "Consultando pedidos não integrados" |
| Marcar como integrado | "Setando um pedido como integrado" |

> **Situação e rastreamento/NF são famílias distintas de endpoint.** Gravar situação não grava NF nem rastreio, e vice-versa. É exatamente isso que se observa hoje: o rastreio é gravado, a situação não.

### C — Regras de evento Intelipost (estado em 04/08/2026)

| Prior. | ID | Nome | Criado | Ativo | Destino |
|---|---|---|---|---|---|
| 1 | 60190 | Não altera status Entregue | 07/03/2025 | não | — |
| 2 | 60745 | Re-calcular previsão de entrega | 01/05/2025 | não | — |
| 3 | 60184 | E-mail - Criado | 07/03/2025 | não | — |
| 4 | 60185 | E-mail - Despachado | 07/03/2025 | não | — |
| 5 | 60186 | E-mail - Em Trânsito | 07/03/2025 | não | — |
| 6 | 60187 | E-mail - Saiu para Entrega | 07/03/2025 | não | — |
| 7 | 60188 | E-mail - Entregue | 07/03/2025 | não | — |
| 8 | 60189 | E-mail - Cancelado | 07/03/2025 | não | — |
| 9 | 64734 | Webhook Wake | 12/05/2026 | **SIM** ⚠️ | `abcdesignbrasil.com.br/checkout` |
| 10 | 65461 | Webhook Wake_kikkaboobrasil | 22/06/2026 | **SIM** | `frete.fbits.net//api/notificacoes/intelipost/kikkaboobrasil` |
| 11 | 65462 | Webhook Wake_abcdesignbrasil | 22/06/2026 | **SIM** | *(presumido equivalente)* |

**Ações disponíveis nas regras de evento:** Não alterar status · Adicionar prazo de entrega · Re-calcular previsão de entrega · Substituição de status · Notificações (E-mail, SMS, WhatsApp, Webhook) · Ajustar Data/Horário · Logs de Add/Events

**Condições disponíveis:** Métodos de Envio · Evento Entrando · Contém no Histórico · Evento Anterior do Evento Entrando · Evento Anterior ao Evento Base Entrando · Região de Destino · Canal de Vendas · Diferença Horário Evento Entrando/Ocorrência · Diferença Horário Evento Entrando/Evento Anterior · Diferença Ocorrência Evento Entrando/Evento Anterior · Repetição Evento Entrando · Diferença Evento Entrando/Data Específica · Histórico do Pedido

---

*Documento consolidado a partir de análise em 03–04/08/2026 sobre a base de produção Sankhya (schema `SANKHYA`), painel Intelipost (conta 70552), painel de parâmetros e admin da Wake Commerce, lojas kikkaboobrasil e abcdesignbrasil.*
