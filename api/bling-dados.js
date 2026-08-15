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
      Authorization: `Bearer ${access_token}`,
      Accept: "application/json",
      "enable-jwt": "1"
    };

    const esperar = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    function transformarErro(data, status) {
      if (typeof data === "string") {
        return data;
      }

      if (data?.error?.message) {
        return data.error.message;
      }

      if (data?.error?.description) {
        return data.error.description;
      }

      if (data?.message) {
        return data.message;
      }

      if (typeof data?.error === "string") {
        return data.error;
      }

      try {
        return `Erro do Bling (HTTP ${status}): ${JSON.stringify(data)}`;
      } catch {
        return `Erro do Bling (HTTP ${status})`;
      }
    }

    async function buscarBling(url, tentativa = 1) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers
        });

        const texto = await response.text();

        let data = {};

        try {
          data = texto ? JSON.parse(texto) : {};
        } catch {
          data = {
            error: texto || "Resposta inválida do Bling"
          };
        }

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

        if (response.status === 429) {
          if (tentativa >= 4) {
            return {
              ok: false,
              status: 429,
              data: {
                error:
                  "Limite de requisições do Bling atingido. Aguarde alguns segundos e tente novamente."
              }
            };
          }

          const retryAfter = Number(
            response.headers.get("Retry-After")
          );

          const espera =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : tentativa * 1500;

          await esperar(espera);

          return buscarBling(url, tentativa + 1);
        }

        if (!response.ok) {
          return {
            ok: false,
            status: response.status,
            data
          };
        }

        return {
          ok: true,
          status: response.status,
          data
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

        await esperar(tentativa * 1000);

        return buscarBling(url, tentativa + 1);
      }
    }

    // =====================================================
    // DATAS
    // =====================================================

    const hoje = new Date();

    function dataFormatada(data) {
      const ano = data.getFullYear();
      const mes = String(data.getMonth() + 1).padStart(2, "0");
      const dia = String(data.getDate()).padStart(2, "0");

      return `${ano}-${mes}-${dia}`;
    }

    const hojeStr = dataFormatada(hoje);

    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);

    const ontemStr = dataFormatada(ontem);

    const inicio7 = new Date(hoje);
    inicio7.setDate(inicio7.getDate() - 6);

    const inicio15 = new Date(hoje);
    inicio15.setDate(inicio15.getDate() - 14);

    const inicio30 = new Date(hoje);
    inicio30.setDate(inicio30.getDate() - 29);

    const inicio7Str = dataFormatada(inicio7);
    const inicio15Str = dataFormatada(inicio15);
    const inicio30Str = dataFormatada(inicio30);

    // =====================================================
    // PEDIDOS DOS ÚLTIMOS 30 DIAS
    // =====================================================

    const todosPedidos = [];

    const limite = 100;
    let pagina = 1;

    while (pagina <= 50) {
      const url =
        "https://api.bling.com.br/Api/v3/pedidos/vendas" +
        `?pagina=${pagina}` +
        `&limite=${limite}` +
        `&dataInicial=${inicio30Str}` +
        `&dataFinal=${hojeStr}`;

      const resposta = await buscarBling(url);

      if (!resposta.ok) {
        return res.status(resposta.status).json({
          success: false,
          error: transformarErro(
            resposta.data,
            resposta.status
          ),
          pagina
        });
      }

      const pedidos = Array.isArray(resposta.data?.data)
        ? resposta.data.data
        : [];

      todosPedidos.push(...pedidos);

      if (pedidos.length < limite) {
        break;
      }

      pagina++;

      // Pequena pausa para não estourar o limite do Bling
      await esperar(150);
    }

    // =====================================================
    // PRODUTOS
    // =====================================================

    let produtos = [];

    const respostaProdutos = await buscarBling(
      "https://api.bling.com.br/Api/v3/produtos?pagina=1&limite=100"
    );

    if (respostaProdutos.ok) {
      produtos = Array.isArray(respostaProdutos.data?.data)
        ? respostaProdutos.data.data
        : [];
    }

    // =====================================================
    // MARKETPLACES
    // =====================================================

    const mapaMarketplaces = {
      "204824338": "Mercado Livre",
      "205972730": "Shopee",
      "205413635": "TikTok Shop",
      "205227624": "Amazon"
    };

    function descobrirMarketplace(pedido) {
      const possiveisIds = [
        pedido?.loja?.id,
        pedido?.canalVenda?.id,
        pedido?.canal?.id,
        pedido?.marketplace?.id,
        pedido?.lojaId,
        pedido?.canalVendaId,
        pedido?.canalId,
        pedido?.marketplaceId
      ];

      for (const id of possiveisIds) {
        const nome = mapaMarketplaces[String(id)];

        if (nome) {
          return nome;
        }
      }

      const textos = [
        pedido?.loja?.nome,
        pedido?.loja?.descricao,
        pedido?.canalVenda?.nome,
        pedido?.canalVenda?.descricao,
        pedido?.canal?.nome,
        pedido?.canal?.descricao,
        pedido?.marketplace?.nome,
        pedido?.marketplace?.descricao,
        pedido?.numeroLoja,
        pedido?.numeroCanal
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (
        textos.includes("mercado livre") ||
        textos.includes("mercadolivre") ||
        textos.includes("meli")
      ) {
        return "Mercado Livre";
      }

      if (textos.includes("shopee")) {
        return "Shopee";
      }

      if (textos.includes("tiktok")) {
        return "TikTok Shop";
      }

      if (textos.includes("amazon")) {
        return "Amazon";
      }

      return "Outros";
    }

    // =====================================================
    // DATA DO PEDIDO
    // =====================================================

    function obterDataPedido(pedido) {
      return String(
        pedido?.data ||
        pedido?.dataPedido ||
        pedido?.dataEmissao ||
        pedido?.dataInclusao ||
        ""
      ).substring(0, 10);
    }

    // =====================================================
    // VALOR DO PEDIDO
    // =====================================================

    function obterValorPedido(pedido) {
      const valores = [
        pedido?.total,
        pedido?.valor,
        pedido?.valorTotal,
        pedido?.totalProdutos
      ];

      for (const valor of valores) {
        const numero = Number(valor);

        if (Number.isFinite(numero)) {
          return numero;
        }
      }

      return 0;
    }

    // =====================================================
    // CALCULAR PERÍODO
    // =====================================================

    function calcularPeriodo(dataInicial) {
      const resultado = {
        total: 0,
        pedidos: 0,
        marketplaces: {}
      };

      for (const pedido of todosPedidos) {
        const dataPedido = obterDataPedido(pedido);

        if (!dataPedido) {
          continue;
        }

        if (
          dataPedido < dataInicial ||
          dataPedido > hojeStr
        ) {
          continue;
        }

        const nome = descobrirMarketplace(pedido);
        const valor = obterValorPedido(pedido);

        resultado.total += valor;
        resultado.pedidos++;

        if (!resultado.marketplaces[nome]) {
          resultado.marketplaces[nome] = {
            nome,
            faturamento: 0,
            pedidos: 0
          };
        }

        resultado.marketplaces[nome].faturamento += valor;
        resultado.marketplaces[nome].pedidos++;
      }

      return resultado;
    }

    // =====================================================
    // PERÍODOS
    // =====================================================

    const periodoOntem = calcularPeriodo(ontemStr);
    const periodo7 = calcularPeriodo(inicio7Str);
    const periodo15 = calcularPeriodo(inicio15Str);
    const periodo30 = calcularPeriodo(inicio30Str);

    // =====================================================
    // FATURAMENTO DE HOJE
    // =====================================================

    const totaisHoje = {};

    let faturamentoHoje = 0;
    let pedidosHoje = 0;

    for (const pedido of todosPedidos) {
      const dataPedido = obterDataPedido(pedido);

      if (dataPedido !== hojeStr) {
        continue;
      }

      const nome = descobrirMarketplace(pedido);
      const valor = obterValorPedido(pedido);

      faturamentoHoje += valor;
      pedidosHoje++;

      if (!totaisHoje[nome]) {
        totaisHoje[nome] = {
          nome,
          faturamento: 0,
          pedidos: 0
        };
      }

      totaisHoje[nome].faturamento += valor;
      totaisHoje[nome].pedidos++;
    }

    // =====================================================
    // ORDEM DOS MARKETPLACES
    // =====================================================

    const ordem = [
      "Mercado Livre",
      "Shopee",
      "TikTok Shop",
      "Amazon",
      "Outros"
    ];

    const marketplaces = ordem
      .filter((nome) => totaisHoje[nome])
      .map((nome) => totaisHoje[nome]);

    const totalMarketplaces = marketplaces.reduce(
      (soma, item) => soma + item.faturamento,
      0
    );

    // =====================================================
    // TICKET MÉDIO
    // =====================================================

    const ticketMedio =
      pedidosHoje > 0
        ? faturamentoHoje / pedidosHoje
        : 0;

    // =====================================================
    // RETORNO
    // =====================================================

    return res.status(200).json({
      success: true,

      data: todosPedidos,

      pedidos: todosPedidos,

      produtos,

      faturamentoHoje,

      pedidosHoje,

      ticketMedio,

      marketplaces,

      totalMarketplaces,

      periodos: {
        ontem: periodoOntem,
        seteDias: periodo7,
        quinzeDias: periodo15,
        trintaDias: periodo30
      }
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Erro interno do servidor"
    });
  }
}
