// ============================================================================
// Botão de Ação: ENVIAR PARA INTELIPOST
// Tabela: TGFCAB
// ----------------------------------------------------------------------------
// PATCH aplicado em 06/08/2026:
//   1. Envia 'sales_channel' (antes ausente) -> destrava o webhook da regra 65461
//   2. 'order_number' passa a usar AD_PEDIDOMKTPLACE (ID Wake) em vez de NUNOTA
//   3. Adiciona 'sales_order_number' com o mesmo ID Wake
//   4. NUNOTA passa a viajar em 'additional_information'
//   5. Trava de estado: só envia nota faturada, com NF-e e sem embarque prévio
//   6. Corrige JOIN ambíguo na AD_APIINTELI (usa a cotação mais recente)
//   7. Grava AD_IDINTELIPOST com o ID do embarque retornado
// ============================================================================

// ----------------------------------------------------------------------------
// CONFIGURAÇÃO
// ----------------------------------------------------------------------------
// Canal de vendas por loja. O valor precisa ser IDÊNTICO ao filtrado na
// condição "Canal de Vendas" das regras de evento da Intelipost (65461/65462),
// incluindo maiúsculas e minúsculas.
//
// Kikkaboo: confirmado no embarque 695225333, que dispara webhook com sucesso.
// ABC Design: NÃO CONFIRMADO. Deixe null até copiar o valor de um embarque
//             criado pela Wake numa venda da ABC. Com null, o envio é bloqueado
//             em vez de criar embarque com canal errado.

var CANAL_KIKKABOO   = "Wake_kikkaboobrasil";
var CANAL_ABCDESIGN  = null;   // <-- preencher após confirmar na Intelipost

// Faixas de ID do pedido na Wake por loja.
// Observado em 06/08/2026: Kikkaboo 48918-75362 (5 dígitos),
// ABC Design 642197-6xxxxx (6 dígitos). Sem sobreposição.
// IDs de 14 e 16 caracteres pertencem a marketplaces e são bloqueados.

var FAIXA_KIKKABOO_MIN = 40000;
var FAIXA_KIKKABOO_MAX = 599999;
var FAIXA_ABC_MIN      = 600000;
var FAIXA_ABC_MAX      = 999999;

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
var codemp        = null;
var idWake        = null;
var tipmov        = null;
var numnota       = null;
var chavenfe      = null;
var idIntelipostJa = null;

var docQuery = getQuery("native");
docQuery.setParam("Pedido", Pedido);
docQuery.nativeSelect(
    "SELECT CODEMP, TIPMOV, NUMNOTA, CHAVENFE, " +
    "       AD_PEDIDOMKTPLACE, AD_IDINTELIPOST " +
    "FROM TGFCAB WHERE NUNOTA = {Pedido}"
);

if (docQuery.next()) {
    codemp         = docQuery.getString("CODEMP");
    tipmov         = docQuery.getString("TIPMOV");
    numnota        = docQuery.getString("NUMNOTA");
    chavenfe       = docQuery.getString("CHAVENFE");
    idWake         = docQuery.getString("AD_PEDIDOMKTPLACE");
    idIntelipostJa = docQuery.getString("AD_IDINTELIPOST");

    codemp = (codemp == null) ? null : String(codemp).trim();
    tipmov = (tipmov == null) ? "" : String(tipmov).trim();
    idWake = (idWake == null) ? "" : String(idWake).trim();
} else {
    mensagem   = "Envio bloqueado: documento " + Pedido + " nao encontrado.";
    podeEnviar = false;
}

// Trava 1: precisa ser nota de venda faturada.
// ATENCAO: confirme o valor de TIPMOV na sua base antes de confiar nisso.
// Observado: 'V' = venda faturada (TOP 1728), 'P' = pedido (TOP 1722).
if (podeEnviar && tipmov !== "V") {
    mensagem   = "Envio bloqueado: documento nao e nota de venda faturada (TIPMOV=" + tipmov + ").";
    podeEnviar = false;
}

// Trava 2: NF-e precisa existir. A chave só é gerada após a emissão.
// Opcional: adicionar STATUSNFE ao SELECT e validar aqui, quando o valor
// de "autorizada" for confirmado no cadastro de vocês.
if (podeEnviar && (numnota == null || chavenfe == null || String(chavenfe).trim() === "")) {
    mensagem   = "Envio bloqueado: NF-e nao emitida ou sem chave de acesso.";
    podeEnviar = false;
}

// Trava 3: precisa ter o ID do pedido de origem.
if (podeEnviar && idWake === "") {
    mensagem   = "Envio bloqueado: documento sem Pedido Externo (AD_PEDIDOMKTPLACE).";
    podeEnviar = false;
}

// Trava 4: anti-reenvio. Evita duplicar embarque em duplo clique.
if (podeEnviar && idIntelipostJa != null && String(idIntelipostJa).trim() !== "") {
    mensagem   = "Envio bloqueado: embarque ja criado na Intelipost (ID " +
                 String(idIntelipostJa).trim() + ").";
    podeEnviar = false;
}

// ----------------------------------------------------------------------------
// 2. ARMAZÉM DE ORIGEM (por empresa)
// ----------------------------------------------------------------------------
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
// As duas lojas faturam pelas duas empresas, então CODEMP não identifica a
// loja. A faixa numérica do ID do pedido identifica.
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
    "      'shipping_address' VALUE e.nomeend, " +
    "      'shipping_number' VALUE p.numend, " +
    "      'shipping_quarter' VALUE b.nomebai, " +
    "      'shipping_reference' VALUE p.complemento, " +
    "      'shipping_zip_code' VALUE p.cep" +
    "  ), " +
    "  'shipment_order_volume_array' VALUE (" +
    "      SELECT JSON_ARRAYAGG(" +
    "          JSON_OBJECT(" +
    "              'name' VALUE 'BOX', " +
    "              'shipment_order_volume_number' VALUE i.sequencia, " +
    "              'weight' VALUE pr.pesobruto * i.qtdneg, " +
    "              'gross_weight' VALUE pr.pesobruto * i.qtdneg, " +
    "              'net_weight' VALUE NVL(pr.pesoliq, pr.pesobruto) * i.qtdneg, " +
    "              'declared_value' VALUE i.vlrunit * i.qtdneg, " +
    "              'volume_type_code' VALUE 'BOX', " +
    "              'width' VALUE pr.largura, " +
    "              'height' VALUE pr.altura, " +
    "              'length' VALUE pr.espessura, " +
    "              'products' VALUE JSON_ARRAY(" +
    "                  JSON_OBJECT(" +
    "                      'sku' VALUE i.codprod, " +
    "                      'description' VALUE pr.descrprod, " +
    "                      'quantity' VALUE i.qtdneg, " +
    "                      'price' VALUE i.vlrunit, " +
    "                      'total_price' VALUE i.vlrunit * i.qtdneg, " +
    "                      'weight' VALUE pr.pesobruto" +
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
    "      WHERE i.nunota = c.nunota" +
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
        // TODO: mover a chave para parametro do sistema. Hoje fica legivel
        // para qualquer usuario com acesso ao Dicionario de Dados.
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
            // ATENCAO: o caminho do ID no JSON de retorno precisa ser
            // confirmado no primeiro envio. A mensagem abaixo exibe o corpo
            // completo da resposta justamente para isso. Se o ID nao estiver
            // em content.id, ajuste a linha marcada.
            var idGravado = null;
            try {
                var jsonResp = new org.json.JSONObject(response);
                var content  = jsonResp.getJSONObject("content");
                idGravado    = String(content.get("id"));   // <-- ajustar se necessario

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
