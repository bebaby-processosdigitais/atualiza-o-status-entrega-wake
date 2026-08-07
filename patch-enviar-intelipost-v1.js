// ============================================================================
// Botão de Ação: ENVIAR PARA INTELIPOST
// Tabela: TGFCAB
// ----------------------------------------------------------------------------
// PATCH v2 — 07/08/2026
//
// Correções em relação ao script original:
//   1. Envia 'sales_channel' (antes ausente) -> destrava o webhook da regra 65461
//   2. 'order_number' passa a usar AD_PEDIDOMKTPLACE (ID Wake) em vez de NUNOTA
//   3. Adiciona 'sales_order_number' com o mesmo ID Wake
//   4. NUNOTA passa a viajar em 'additional_information'
//   5. Trava de estado: TIPMOV='V', NUMNOTA, CHAVENFE, STATUSNFE='A', anti-reenvio
//   6. Corrige JOIN ambíguo na AD_APIINTELI (usa a cotação mais recente)
//   7. Grava AD_IDINTELIPOST com o ID do embarque retornado
//   8. Corrige o 'var mensagem = null' que apagava mensagens de erro anteriores
//
// Novo na v2, para espelhar o payload que a Wake envia:
//   9. FILTRA OS SKUs DE KP do array de volumes. Eles são linha de precificação,
//      não caixa física. No log do pedido 194704 o KP1 (sku 2310) foi enviado
//      como um segundo volume, com 0,1 cm de cubagem e R$ 29,90 declarados.
//  10. Envia 'quote_id', extraído do ID_MAIN da AD_APIINTELI. É o que faz a
//      Intelipost calcular o estimated_delivery_date, que hoje volta null.
//  11. Envia 'scheduled', 'products_nature' e 'products_quantity'
//  12. Completa o end_customer com shipping_state, shipping_country e
//      shipping_additional
//  13. Corrige net_weight: NVL só troca nulo, e o cadastro tem pesoliq = 0.
//      Agora usa NULLIF para tratar zero também.
//  14. 'name' do volume passa a ser o SKU, como a Wake faz
//
// Nota de implementação: não usa 'return' no nível superior, porque em botão de
// ação do Sankhya o script pode rodar fora de uma função. Usa o flag
// 'podeEnviar', que funciona nos dois casos.
// ============================================================================

// ----------------------------------------------------------------------------
// CONFIGURAÇÃO
// ----------------------------------------------------------------------------
// Canal de vendas por loja. O valor precisa ser IDÊNTICO ao filtrado na
// condição "Canal de Vendas" das regras de evento da Intelipost (65461/65462),
// incluindo maiúsculas e minúsculas.
//
// Kikkaboo: confirmado no log de API do embarque 695890707, criado pela Wake.
// ABC Design: NÃO CONFIRMADO. Deixe null até copiar o valor de um embarque
//             criado pela Wake numa venda da ABC (ID de 6 dígitos, sem NF).
//             Com null, o envio é bloqueado com mensagem clara em vez de criar
//             embarque com canal errado, que geraria webhook órfão.

var CANAL_KIKKABOO   = "Wake_kikkaboobrasil";
var CANAL_ABCDESIGN  = null;   // <-- preencher após confirmar na Intelipost

// Faixas de ID do pedido na Wake, por loja.
// CODEMP NÃO identifica a loja: as duas lojas faturam pelas duas empresas.
// A faixa numérica do AD_PEDIDOMKTPLACE identifica.
//
// Observado em 06/08/2026:
//   5 dígitos  -> Kikkaboo   (48918 a 75362, 620 documentos em 2026)
//   6 dígitos  -> ABC Design (642197 em diante, 557 documentos em 2026)
//   14 e 16    -> marketplace (5 documentos), bloqueados
//
// Faixa numérica em vez de contagem de dígitos porque a Kikkaboo cresce ~90/mês
// e ao passar de 99999 viraria 6 dígitos, mandando o embarque para o canal da
// ABC em silêncio. O corte em 600000 dá folga de décadas.

var FAIXA_KIKKABOO_MIN = 40000;
var FAIXA_KIKKABOO_MAX = 599999;
var FAIXA_ABC_MIN      = 600000;
var FAIXA_ABC_MAX      = 999999;

// SKUs de KP (precificação de kit). São linha de nota, não volume físico.
// Se existirem outros SKUs de serviço, acréscimo ou brinde, incluir aqui.
var SKU_KP_MIN = 2310;
var SKU_KP_MAX = 2316;

// ----------------------------------------------------------------------------
// PARÂMETROS
// ----------------------------------------------------------------------------
var query = getQuery();

var Pedido  = getParam("Pedido");
var Cotacao = getParam("Cotacao");
var Empresa = getParam("Empresa");   // não utilizado, mantido por compatibilidade

query.setParam("Pedido", Pedido);
query.setParam("Cotacao", Cotacao);
query.setParam("Empresa", Empresa);

var mensagem   = null;
var podeEnviar = true;

// ----------------------------------------------------------------------------
// 1. LEITURA DO DOCUMENTO + TRAVA DE ESTADO
// ----------------------------------------------------------------------------
var codemp         = null;
var idWake         = null;
var tipmov         = null;
var numnota        = null;
var chavenfe       = null;
var statusnfe      = null;
var idIntelipostJa = null;

var docQuery = getQuery("native");
docQuery.setParam("Pedido", Pedido);
docQuery.nativeSelect(
    "SELECT CODEMP, TIPMOV, NUMNOTA, CHAVENFE, STATUSNFE, " +
    "       AD_PEDIDOMKTPLACE, AD_IDINTELIPOST " +
    "FROM TGFCAB WHERE NUNOTA = {Pedido}"
);

if (docQuery.next()) {
    codemp         = docQuery.getString("CODEMP");
    tipmov         = docQuery.getString("TIPMOV");
    numnota        = docQuery.getString("NUMNOTA");
    chavenfe       = docQuery.getString("CHAVENFE");
    statusnfe      = docQuery.getString("STATUSNFE");
    idWake         = docQuery.getString("AD_PEDIDOMKTPLACE");
    idIntelipostJa = docQuery.getString("AD_IDINTELIPOST");

    codemp    = (codemp    == null) ? null : String(codemp).trim();
    tipmov    = (tipmov    == null) ? ""   : String(tipmov).trim();
    statusnfe = (statusnfe == null) ? ""   : String(statusnfe).trim();
    idWake    = (idWake    == null) ? ""   : String(idWake).trim();
} else {
    mensagem   = "Envio bloqueado: documento " + Pedido + " nao encontrado.";
    podeEnviar = false;
}

// Trava 1: precisa ser nota de venda faturada.
// ATENCAO: confirme o valor de TIPMOV na sua base.
// Observado: 'V' = venda faturada (TOP 1728), 'P' = pedido (TOP 1722).
if (podeEnviar && tipmov !== "V") {
    mensagem   = "Envio bloqueado: documento nao e nota de venda faturada (TIPMOV=" + tipmov + ").";
    podeEnviar = false;
}

// Trava 2: NF-e precisa existir.
if (podeEnviar && (numnota == null || chavenfe == null || String(chavenfe).trim() === "")) {
    mensagem   = "Envio bloqueado: NF-e nao emitida ou sem chave de acesso.";
    podeEnviar = false;
}

// Trava 3: NF-e precisa estar aprovada.
// STATUSNFE = 'A' (Aprovado) confirmado pela Tem Api, que usa o mesmo critério
// na view ATUA_STATUS_ECOMMERCE.
if (podeEnviar && statusnfe !== "A") {
    mensagem   = "Envio bloqueado: NF-e nao aprovada (STATUSNFE=" + statusnfe + ").";
    podeEnviar = false;
}

// Trava 4: precisa ter o ID do pedido de origem.
if (podeEnviar && idWake === "") {
    mensagem   = "Envio bloqueado: documento sem Pedido Externo (AD_PEDIDOMKTPLACE).";
    podeEnviar = false;
}

// Trava 5: anti-reenvio. Evita duplicar embarque em duplo clique.
// ATENCAO: existe um mecanismo nao identificado que ja grava este campo em
// parte dos documentos (1.207 registros historicos). Confirme a origem dele
// antes de confiar nesta trava, senao envios legitimos podem ser bloqueados.
if (podeEnviar && idIntelipostJa != null && String(idIntelipostJa).trim() !== "") {
    mensagem   = "Envio bloqueado: embarque ja criado na Intelipost (ID " +
                 String(idIntelipostJa).trim() + ").";
    podeEnviar = false;
}

// ----------------------------------------------------------------------------
// 2. ARMAZÉM DE ORIGEM (por empresa)
// ----------------------------------------------------------------------------
// CODEMP 1 -> "02" CONFIRMADO: nos logs de API, tanto o embarque da Wake
// (que envia origin_zip_code) quanto o do Sankhya (que envia
// origin_warehouse_code "02") resolveram para warehouse_address_id 68243.
// Os demais mapeamentos seguem sem confirmação.
var originWarehouseCode = null;

if (podeEnviar) {
    if (codemp === "1") {
        originWarehouseCode = "02";
    } else if (codemp === "2") {
        originWarehouseCode = "01";
    } else if (codemp === "3") {
        originWarehouseCode = "04";
    } else if (codemp === "4") {
        originWarehouseCode = "03";
    } else {
        mensagem   = "Envio bloqueado: CODEMP nao reconhecido: " + codemp;
        podeEnviar = false;
    }
}

// ----------------------------------------------------------------------------
// 3. CANAL DE VENDAS (pela faixa do ID Wake, não pela empresa)
// ----------------------------------------------------------------------------
var salesChannel = null;

if (podeEnviar) {
    if (!/^[0-9]+$/.test(idWake)) {
        mensagem   = "Envio bloqueado: Pedido Externo nao numerico (" + idWake +
                     "). Provavel pedido de marketplace.";
        podeEnviar = false;
    } else if (idWake.length > 7) {
        mensagem   = "Envio bloqueado: Pedido Externo com " + idWake.length +
                     " digitos (" + idWake + "). Fora do padrao de loja propria.";
        podeEnviar = false;
    } else {
        var idNum = parseInt(idWake, 10);

        if (idNum >= FAIXA_KIKKABOO_MIN && idNum <= FAIXA_KIKKABOO_MAX) {
            salesChannel = CANAL_KIKKABOO;
        } else if (idNum >= FAIXA_ABC_MIN && idNum <= FAIXA_ABC_MAX) {
            salesChannel = CANAL_ABCDESIGN;
        }

        if (salesChannel == null) {
            mensagem   = "Envio bloqueado: canal de vendas nao definido para o " +
                         "Pedido Externo " + idWake + ". Verifique as faixas de ID " +
                         "e se o canal da loja ja foi confirmado na Intelipost.";
            podeEnviar = false;
        }
    }
}

// ----------------------------------------------------------------------------
// 4. MONTAGEM DO PAYLOAD
// ----------------------------------------------------------------------------
var jsonResult = null;

if (podeEnviar) {

    var selectQuery =
    "SELECT JSON_OBJECT(" +
    "  'order_number' VALUE c.AD_PEDIDOMKTPLACE, " +
    "  'sales_order_number' VALUE c.AD_PEDIDOMKTPLACE, " +
    "  'sales_channel' VALUE '" + salesChannel + "', " +
    // quote_id: extraido do ID_MAIN, formato 'NUNOTA,IDCOTACAO_INTELIPOST'.
    // O CASE evita pegar o NUNOTA inteiro caso nao exista virgula.
    // Se o POST falhar com erro relacionado a cotacao, este e o primeiro campo
    // a remover para isolar o problema.
    "  'quote_id' VALUE CASE WHEN INSTR(ai.ID_MAIN, ',') > 0 " +
    "                        THEN TO_NUMBER(SUBSTR(ai.ID_MAIN, INSTR(ai.ID_MAIN, ',') + 1)) " +
    "                        ELSE NULL END, " +
    // 'scheduled' precisa sair como booleano, nao string. FORMAT JSON faz o
    // Oracle tratar o literal como JSON bruto. Requer Oracle 12.2+.
    "  'scheduled' VALUE 'false' FORMAT JSON, " +
    "  'customer_shipping_costs' VALUE ai.VLRFRETE, " +
    "  'delivery_method_id' VALUE ai.METODOENVIO, " +
    "  'origin_warehouse_code' VALUE '" + originWarehouseCode + "', " +
    "  'additional_information' VALUE JSON_OBJECT(" +
    "      'nunota' VALUE TO_CHAR(c.nunota), " +
    "      'numnota' VALUE TO_CHAR(c.numnota)" +
    "  ), " +
    "  'end_customer' VALUE JSON_OBJECT(" +
    "      'first_name' VALUE p.nomeparc, " +
    "      'email' VALUE p.email, " +
    "      'phone' VALUE p.telefone, " +
    "      'cellphone' VALUE p.fax, " +
    "      'federal_tax_payer_id' VALUE p.cgc_cpf, " +
    "      'shipping_city' VALUE ci.nomecid, " +
    // ATENCAO: confirme se a TSICID da sua base tem a coluna UF.
    // Em algumas versoes e CODUF, apontando para TSIUFS.
    "      'shipping_state' VALUE ci.uf, " +
    "      'shipping_country' VALUE 'Brasil', " +
    "      'shipping_address' VALUE e.nomeend, " +
    "      'shipping_number' VALUE p.numend, " +
    "      'shipping_quarter' VALUE b.nomebai, " +
    "      'shipping_additional' VALUE p.complemento, " +
    "      'shipping_reference' VALUE p.complemento, " +
    "      'shipping_zip_code' VALUE p.cep" +
    "  ), " +
    "  'shipment_order_volume_array' VALUE (" +
    "      SELECT JSON_ARRAYAGG(" +
    "          JSON_OBJECT(" +
    "              'name' VALUE TO_CHAR(i.codprod), " +
    "              'shipment_order_volume_number' VALUE i.sequencia, " +
    "              'weight' VALUE pr.pesobruto * i.qtdneg, " +
    "              'gross_weight' VALUE pr.pesobruto * i.qtdneg, " +
    "              'net_weight' VALUE NVL(NULLIF(pr.pesoliq, 0), pr.pesobruto) * i.qtdneg, " +
    "              'declared_value' VALUE i.vlrunit * i.qtdneg, " +
    "              'volume_type_code' VALUE 'BOX', " +
    "              'width' VALUE pr.largura, " +
    "              'height' VALUE pr.altura, " +
    "              'length' VALUE pr.espessura, " +
    "              'products_nature' VALUE 'products', " +
    "              'products_quantity' VALUE i.qtdneg, " +
    "              'products' VALUE JSON_ARRAY(" +
    "                  JSON_OBJECT(" +
    "                      'sku' VALUE i.codprod, " +
    "                      'description' VALUE pr.descrprod, " +
    "                      'quantity' VALUE i.qtdneg, " +
    "                      'price' VALUE i.vlrunit, " +
    "                      'total_price' VALUE i.vlrunit * i.qtdneg, " +
    "                      'weight' VALUE pr.pesobruto, " +
    "                      'width' VALUE pr.largura, " +
    "                      'height' VALUE pr.altura, " +
    "                      'length' VALUE pr.espessura" +
    "                  )" +
    "              ), " +
    "              'shipment_order_volume_invoice' VALUE JSON_OBJECT(" +
    "                  'invoice_series' VALUE c.serienota, " +
    "                  'invoice_number' VALUE c.numnota, " +
    "                  'invoice_key' VALUE c.chavenfe, " +
    "                  'invoice_date' VALUE TO_CHAR(c.dtfatur, 'YYYY-MM-DD\"T\"HH24:MI:SS'), " +
    "                  'invoice_total_value' VALUE c.vlrnota, " +
    "                  'invoice_products_value' VALUE c.vlrnota" +
    "              )" +
    "          )" +
    "      ) " +
    "      FROM tgfite i " +
    "      JOIN tgfpro pr ON pr.codprod = i.codprod " +
    "      WHERE i.nunota = c.nunota " +
    // Exclui os SKUs de KP, que sao linha de precificacao e nao volume fisico.
    "        AND i.codprod NOT BETWEEN " + SKU_KP_MIN + " AND " + SKU_KP_MAX +
    "  ) " +
    ") AS JSON_RESULT " +
    "FROM tgfcab c " +
    "JOIN tgfpar p ON c.codparc = p.codparc " +
    "LEFT JOIN tsicid ci ON p.codcid = ci.codcid " +
    "LEFT JOIN tsiend e ON p.codend = e.codend " +
    "LEFT JOIN tsibai b ON p.codbai = b.codbai " +
    // JOIN corrigido: quando existe mais de uma sessao de cotacao para o mesmo
    // documento, o par (NUMPEDIDO, IDCOTACAO) casa com varias linhas. Sem
    // ORDER BY o frete enviado era arbitrario. Agora usa a cotacao mais recente.
    "JOIN (SELECT * FROM (" +
    "        SELECT ai2.* FROM AD_APIINTELI ai2 " +
    "        WHERE ai2.NUMPEDIDO = '" + Pedido + "' " +
    "          AND ai2.IDCOTACAO = '" + Cotacao + "' " +
    "        ORDER BY ai2.ID_KEY DESC" +
    "      ) WHERE ROWNUM = 1) ai ON 1 = 1 " +
    "WHERE c.nunota = '" + Pedido + "'";

    query.nativeSelect(selectQuery);

    if (query.next()) {
        jsonResult = query.getString("JSON_RESULT");
    }

    if (jsonResult == null) {
        mensagem   = "Envio bloqueado: nao foi possivel montar o payload. " +
                     "Verifique se existe cotacao registrada para o pedido " +
                     Pedido + " com IDCOTACAO " + Cotacao + ".";
        podeEnviar = false;
    }
}

// ----------------------------------------------------------------------------
// 5. ENVIO
// ----------------------------------------------------------------------------
if (podeEnviar) {
    try {
        var url  = new java.net.URL("https://api.intelipost.com.br/api/v1/shipment_order");
        var conn = url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json");
        // TODO: mover a chave para parametro do sistema. Hoje fica legivel para
        // qualquer usuario com acesso ao Dicionario de Dados, e e a mesma chave
        // usada no painel da Wake. Rotacao derruba os dois sistemas ao mesmo
        // tempo, entao precisa de janela combinada.
        conn.setRequestProperty("Authorization", "Bearer 894b08178ccdb69d8cf9672b2056924bcbf18f065c93736259add0b27e761955");
        conn.setRequestProperty("api-key", "894b08178ccdb69d8cf9672b2056924bcbf18f065c93736259add0b27e761955");
        conn.setDoOutput(true);

        var outputStream = conn.getOutputStream();
        var writer = new java.io.OutputStreamWriter(outputStream, "UTF-8");
        writer.write(jsonResult);
        writer.flush();
        writer.close();

        var responseCode = conn.getResponseCode();
        var responseStream = (responseCode >= 200 && responseCode < 300)
            ? conn.getInputStream()
            : conn.getErrorStream();

        var response = "";
        if (responseStream != null) {
            var sc = new java.util.Scanner(responseStream, "UTF-8").useDelimiter("\\A");
            response = sc.hasNext() ? sc.next() : "";
            sc.close();
            responseStream.close();
        }

        if (responseCode >= 200 && responseCode < 300) {

            // ----------------------------------------------------------------
            // 6. GRAVA O ID DO EMBARQUE NA TGFCAB
            // ----------------------------------------------------------------
            // O caminho content.id foi CONFIRMADO nos logs de API da Intelipost:
            // response_body.content.id = 695891294 no embarque do pedido 194704.
            var idGravado = null;
            try {
                var jsonResp = new org.json.JSONObject(response);
                var content  = jsonResp.getJSONObject("content");
                idGravado    = String(content.get("id"));

                var upd = getQuery("native");
                upd.setParam("Pedido", Pedido);
                upd.setParam("IdInteli", idGravado);
                upd.update(
                    "UPDATE TGFCAB SET AD_IDINTELIPOST = {IdInteli} " +
                    "WHERE NUNOTA = {Pedido}"
                );
            } catch (eGrava) {
                idGravado = null;
            }

            mensagem = "Pedido enviado com sucesso. HTTP " + responseCode +
                       " | Canal: " + salesChannel +
                       " | order_number: " + idWake +
                       (idGravado != null
                            ? " | ID Intelipost gravado: " + idGravado
                            : " | ATENCAO: nao foi possivel gravar o AD_IDINTELIPOST, confira o retorno") +
                       (response ? " | Retorno: " + response : "");
        } else {
            mensagem = "Falha no envio. HTTP " + responseCode +
                       " - Retorno: " + (response ? response : "(sem corpo)") +
                       " | JSON enviado: " + jsonResult;
        }

    } catch (e) {
        mensagem = "Erro ao enviar requisicao: " + e.message;
    }
}
