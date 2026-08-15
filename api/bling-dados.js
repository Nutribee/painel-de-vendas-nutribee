export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido"
    });
  }

  try {

    const { access_token } = req.body || {};

    if (!access_token) {
      return res.status(400).json({
        success: false,
        error: "Access token não informado"
      });
    }

    const headers = {
      "Authorization": `Bearer ${access_token}`,
      "Accept": "application/json",
      "enable-jwt": "1"
    };


    // =====================================================
    // ESPERA
    // =====================================================

    const esperar = (ms) =>
      new Promise(resolve => setTimeout(resolve, ms));


    // =====================================================
    // CONSULTA SEGURA AO BLING
    // =====================================================

    async function buscarBling(url, tentativa = 1) {

      try {

        const response = await fetch(url, {
          method: "GET",
          headers
        });

        const texto = await response.text();

        let resultado;

        try {
          resultado = texto ? JSON.parse(texto) : {};
        } catch {
          resultado = {
            error: texto || "Resposta inválida do Bling"
          };
        }


        // =================================================
        // TOKEN
        // =================================================

        if (response.status === 401) {

          return {
            ok: false,
            status: 401,
            data: {
              error:
                "Access token inválido ou expirado. Conecte o Bling novamente."
            }
          };

        }


        // =================================================
        // LIMITE DE REQUISIÇÕES
        // =================================================

        if (response.status === 429) {

          if (tentativa >= 6) {

            return {
              ok: false,
              status: 429,
              data: {
                error:
                  "Limite de requisições do Bling atingido. Aguarde alguns segundos e tente novamente."
              }
            };

          }

          const retryAfter =
            Number(response.headers.get("Retry-After"));

          const espera =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : tentativa * 2500;

          await esperar(espera);

          return buscarBling(url, tentativa + 1);

        }


        // =================================================
        // OUTROS ERROS
        // =================================================

        if (!response.ok) {

          return {
            ok: false,
            status: response.status,
            data: resultado
          };

        }


        return {
          ok: true,
          status: response.status,
          data: resultado
        };

      } catch (error) {

        if (tentativa >= 3) {

          return {
            ok: false,
            status: 502,
            data: {
              error:
                `Falha de comunicação com o Bling: ${
                  error.message || "erro desconhecido"
                }`
            }
          };

        }

        await esperar(tentativa * 1500);

        return buscarBling(url, tentativa + 1);

      }

    }


    // =====================================================
    // DATA ATUAL
    // =====================================================

    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());


    // =====================================================
    // PEDIDOS DO DIA
    // =====================================================

    const todosPedidos = [];

    let pagina = 1;

    const limitePedidos = 100;

    const maxPaginasPedidos = 10;


    while (pagina <= maxPaginasPedidos) {

      const url =
        `https://api.bling.com.br/Api/v3/pedidos/vendas` +
        `?pagina=${pagina}` +
        `&limite=${limitePedidos}` +
        `&dataInicial=${hoje}` +
        `&dataFinal=${hoje}`;


      const resposta = await buscarBling(url);


      if (!resposta.ok) {

        return res.status(resposta.status).json({
          success: false,
          error: resposta.data,
          pagina
        });

      }


      const pedidos =
        Array.isArray(resposta.data?.data)
          ? resposta.data.data
          : [];


      todosPedidos.push(...pedidos);


      if (pedidos.length < limitePedidos) {
        break;
      }


      pagina++;

      await esperar(700);

    }


    // =====================================================
    // PRODUTOS
    // =====================================================

    await esperar(700);


    const urlProdutos =
      "https://api.bling.com.br/Api/v3/produtos?pagina=1&limite=100";


    const respostaProdutos =
      await buscarBling(urlProdutos);


    if (!respostaProdutos.ok) {

      return res.status(respostaProdutos.status).json({
        success: false,
        error: respostaProdutos.data
      });

    }


    const produtos =
      Array.isArray(respostaProdutos.data?.data)
        ? respostaProdutos.data.data
        : [];


    // =====================================================
    // IDENTIFICAR AS LOJAS
    // =====================================================

    const idsLojas = [
      ...new Set(

        todosPedidos
          .map(pedido => pedido?.loja?.id)
          .filter(id => id !== undefined && id !== null)
          .map(id => String(id))

      )
    ];


    // =====================================================
    // IDENTIFICAR CANAIS DE VENDA
    // =====================================================

    const canais = {};


    // -----------------------------------------------------
    // PRIMEIRO: canalVenda que já veio no pedido
    // -----------------------------------------------------

    for (const pedido of todosPedidos) {

      const canal =
        pedido?.canalVenda ||
        pedido?.canal ||
        pedido?.marketplace;

      if (canal?.id) {

        const idCanal = String(canal.id);

        if (!canais[idCanal]) {

          canais[idCanal] = {
            id: idCanal,

            nome:
              canal.nome ||
              canal.descricao ||
              canal.nomeCanal ||
              canal.nomeIntegracao ||
              null
          };

        }

      }

    }


    // =====================================================
    // SEGUNDO: CONSULTA A LISTA DE CANAIS DO BLING
    // =====================================================

    await esperar(700);


    const respostaCanais =
      await buscarBling(
        "https://api.bling.com.br/Api/v3/canais-venda?pagina=1&limite=100"
      );


    if (respostaCanais.ok) {

      const listaCanais =
        Array.isArray(respostaCanais.data?.data)
          ? respostaCanais.data.data
          : [];


      for (const canal of listaCanais) {

        if (!canal?.id) {
          continue;
        }


        const idCanal = String(canal.id);


        const nome =
          canal.nome ||
          canal.descricao ||
          canal.nomeCanal ||
          canal.nomeIntegracao ||
          canal.integracao?.nome ||
          null;


        if (!canais[idCanal]) {

          canais[idCanal] = {
            id: idCanal,
            nome
          };

        } else if (!canais[idCanal].nome && nome) {

          canais[idCanal].nome = nome;

        }

      }

    }


    // =====================================================
    // TERCEIRO: BUSCAR DETALHES DE ALGUNS PEDIDOS
    // =====================================================

    const lojasComPedido = {};

    for (const pedido of todosPedidos) {

      const lojaId = pedido?.loja?.id;

      if (
        lojaId !== undefined &&
        lojaId !== null &&
        !lojasComPedido[String(lojaId)]
      ) {

        lojasComPedido[String(lojaId)] = pedido;

      }

    }


    const detalhesPorLoja = {};


    for (const lojaId of Object.keys(lojasComPedido)) {

      const pedido = lojasComPedido[lojaId];

      if (!pedido?.id) {
        continue;
      }


      await esperar(700);


      const respostaDetalhe =
        await buscarBling(
          `https://api.bling.com.br/Api/v3/pedidos/vendas/${encodeURIComponent(pedido.id)}`
        );


      if (!respostaDetalhe.ok) {
        continue;
      }


      const detalhe =
        respostaDetalhe.data?.data || {};


      detalhesPorLoja[lojaId] = detalhe;


      // -----------------------------------------------
      // CanalVenda no pedido detalhado
      // -----------------------------------------------

      const canal =
        detalhe?.canalVenda ||
        detalhe?.canal ||
        detalhe?.marketplace;


      if (canal?.id) {

        const idCanal =
          String(canal.id);


        const nome =
          canal.nome ||
          canal.descricao ||
          canal.nomeCanal ||
          canal.nomeIntegracao ||
          canal.integracao?.nome ||
          null;


        canais[idCanal] = {

          id: idCanal,

          nome:
            nome ||
            canais[idCanal]?.nome ||
            null

        };

      }


      // -----------------------------------------------
      // Nome da própria loja
      // -----------------------------------------------

      if (detalhe?.loja?.id) {

        const idLoja =
          String(detalhe.loja.id);


        const nomeLoja =
          detalhe.loja.nome ||
          detalhe.loja.descricao ||
          null;


        if (nomeLoja) {

          canais[`loja_${idLoja}`] = {

            id: idLoja,

            nome: nomeLoja

          };

        }

      }

    }


    // =====================================================
    // QUARTO: CONSULTAR CANAL INDIVIDUAL
    // =====================================================

    const idsCanaisParaConsultar = [
      ...new Set(

        todosPedidos
          .map(pedido =>
            pedido?.canalVenda?.id ||
            pedido?.canal?.id ||
            pedido?.marketplace?.id
          )
          .filter(id => id !== undefined && id !== null)
          .map(id => String(id))

      )
    ];


    for (const idCanal of idsCanaisParaConsultar) {

      if (canais[idCanal]?.nome) {
        continue;
      }


      await esperar(700);


      const respostaCanal =
        await buscarBling(
          `https://api.bling.com.br/Api/v3/canais-venda/${encodeURIComponent(idCanal)}`
        );


      if (respostaCanal.ok) {

        const canal =
          respostaCanal.data?.data || {};


        canais[idCanal] = {

          id: idCanal,

          nome:
            canal.nome ||
            canal.descricao ||
            canal.nomeCanal ||
            canal.nomeIntegracao ||
            canal.integracao?.nome ||
            `Canal ${idCanal}`

        };

      }

    }


    // =====================================================
    // FUNÇÃO PARA DESCOBRIR O MARKETPLACE
    // =====================================================

    function descobrirMarketplace(pedido) {

      // =================================================
      // MAPA FIXO DOS MARKETPLACES DA NUTRIBEE
      // =================================================

      const mapaMarketplaces = {

        "204824338": "Mercado Livre",

        "205972730": "Shopee",

        "205413635": "TikTok Shop",

        "205227624": "Amazon"

      };


      // =================================================
      // PRIMEIRO: verifica o ID DA LOJA
      // =================================================

      const idLoja =
        pedido?.loja?.id;

      if (
        idLoja !== undefined &&
        idLoja !== null
      ) {

        const id =
          String(idLoja);

        if (mapaMarketplaces[id]) {

          return mapaMarketplaces[id];

        }

      }


      // =================================================
      // SEGUNDO: verifica o ID DO CANAL
      // =================================================

      const canal =
        pedido?.canalVenda ||
        pedido?.canal ||
        pedido?.marketplace;


      if (canal) {

        const idCanal =
          canal?.id !== undefined &&
          canal?.id !== null
            ? String(canal.id)
            : null;


        // Verifica o mapa fixo
        if (
          idCanal &&
          mapaMarketplaces[idCanal]
        ) {

          return mapaMarketplaces[idCanal];

        }


        const nomeCanal =
          canal.nome ||
          canal.descricao ||
          canal.nomeCanal ||
          canal.nomeIntegracao ||
          canal.integracao?.nome;


        if (nomeCanal) {
          return nomeCanal;
        }


        if (
          idCanal &&
          canais[idCanal]?.nome
        ) {

          return canais[idCanal].nome;

        }

      }


      // =================================================
      // TERCEIRO: NOME DA LOJA
      // =================================================

      const loja =
        pedido?.loja;


      if (loja) {

        const nomeLoja =
          loja.nome ||
          loja.descricao ||
          loja.nomeLoja ||
          loja.integracao?.nome;


        if (nomeLoja) {
          return nomeLoja;
        }


        if (loja.id) {

          const id =
            String(loja.id);


          if (
            canais[`loja_${id}`]?.nome
          ) {

            return canais[`loja_${id}`].nome;

          }

        }

      }


      // =================================================
      // QUARTO: numeroLoja
      // =================================================

      if (pedido?.numeroLoja) {

        const numero =
          String(pedido.numeroLoja).toLowerCase();


        if (
          numero.includes("mercado") ||
          numero.includes("mercadolivre") ||
          numero.includes("mercado livre") ||
          numero.includes("meli")
        ) {

          return "Mercado Livre";

        }


        if (
          numero.includes("tiktok") ||
          numero.includes("tik tok")
        ) {

          return "TikTok Shop";

        }


        if (
          numero.includes("shopee")
        ) {

          return "Shopee";

        }


        if (
          numero.includes("amazon")
        ) {

          return "Amazon";

        }

      }


      // =================================================
      // QUINTO: DETALHE DO PEDIDO
      // =================================================

      if (
        idLoja !== undefined &&
        idLoja !== null
      ) {

        const detalhe =
          detalhesPorLoja[String(idLoja)];


        if (detalhe) {

          const canalDetalhe =
            detalhe?.canalVenda ||
            detalhe?.canal ||
            detalhe?.marketplace;


          if (canalDetalhe) {

            const idCanalDetalhe =
              canalDetalhe?.id !== undefined &&
              canalDetalhe?.id !== null
                ? String(canalDetalhe.id)
                : null;


            if (
              idCanalDetalhe &&
              mapaMarketplaces[idCanalDetalhe]
            ) {

              return mapaMarketplaces[idCanalDetalhe];

            }


            const nome =
              canalDetalhe.nome ||
              canalDetalhe.descricao ||
              canalDetalhe.nomeCanal ||
              canalDetalhe.nomeIntegracao ||
              canalDetalhe.integracao?.nome;


            if (nome) {
              return nome;
            }


            if (
              idCanalDetalhe &&
              canais[idCanalDetalhe]?.nome
            ) {

              return canais[idCanalDetalhe].nome;

            }

          }

        }

      }


      // =================================================
      // ÚLTIMO RECURSO
      // =================================================

      if (
        idLoja !== undefined &&
        idLoja !== null
      ) {

        return `Canal ${idLoja}`;

      }


      return "Sem marketplace";

    }


    // =====================================================
    // FATURAMENTO POR MARKETPLACE
    // =====================================================

    const faturamentoPorMarketplace = {};


    for (const pedido of todosPedidos) {

      const nomeMarketplace =
        descobrirMarketplace(pedido);


      const valor =
        Number(pedido?.total) || 0;


      const chave =
        nomeMarketplace.trim().toLowerCase();


      if (!faturamentoPorMarketplace[chave]) {

        faturamentoPorMarketplace[chave] = {

          id: chave,

          nome: nomeMarketplace,

          faturamento: 0,

          pedidos: 0

        };

      }


      faturamentoPorMarketplace[chave].faturamento += valor;

      faturamentoPorMarketplace[chave].pedidos += 1;

    }


    // =====================================================
    // CONVERTER MARKETPLACES PARA ARRAY
    // =====================================================

    const marketplaces =
      Object.values(faturamentoPorMarketplace);


    marketplaces.sort(
      (a, b) =>
        b.faturamento - a.faturamento
    );


    // =====================================================
    // FATURAMENTO TOTAL
    // =====================================================

    const faturamentoTotal =
      todosPedidos.reduce(
        (total, pedido) =>
          total +
          (Number(pedido?.total) || 0),
        0
      );


    // =====================================================
    // TICKET MÉDIO
    // =====================================================

    const ticketMedio =
      todosPedidos.length > 0
        ? faturamentoTotal /
          todosPedidos.length
        : 0;


    // =====================================================
    // RETORNO
    // =====================================================

    return res.status(200).json({

      success: true,

      data: hoje,

      totalPedidos:
        todosPedidos.length,

      totalProdutos:
        produtos.length,

      faturamentoTotal,

      ticketMedio,

      paginasPedidos:
        pagina,

      pedidos:
        todosPedidos,

      produtos,

      canais,

      marketplaces

    });


  } catch (error) {

    console.error(
      "Erro geral ao buscar dados do Bling:",
      error
    );


    return res.status(500).json({

      success: false,

      error:
        error.message ||
        "Erro interno no servidor"

    });

  }

}
