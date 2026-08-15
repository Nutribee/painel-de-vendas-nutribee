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

      if (data?.error && typeof data.error === "string") {
        return data.error;
      }

      try {
        return `Erro do Bling (HTTP ${status}): ${JSON.stringify(data)}`;
      } catch {
        return `Erro do Bling (HTTP ${status}).`;
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
          if (tentativa >= 6) {
            return {
              ok: false,
              status: 429,
              data: {
                error:
                  "Limite de requisições do Bling atingido. Aguarde e tente novamente."
              }
            };
          }

          const retryAfter = Number(
            response.headers.get("Retry-After")
          );

          const espera =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : tentativa * 2000;

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

        await esperar(tentativa * 1500);

        return buscarBling(url, tentativa + 1);
      }
    }

    // =====================================================
    // DATA DE HOJE - BRASIL
    // =====================================================

    const hoje = new Date();

    const dataFormatada = (data) => {
      const ano = data.getFullYear();
      const mes = String(data.getMonth() + 1).padStart(2, "0");
      const dia = String(data.getDate()).padStart(2, "0");

      return `${ano}-${mes}-${dia}`;
    };

    const hojeStr = dataFormatada(hoje);

    // =====================================================
    // DATA INICIAL = 30 DIAS ATRÁS
    // =====================================================

    const inicio30 = new Date(hoje);

    inicio30.setDate(
      inicio30.getDate() - 29
    );

    const inicio30Str =
      dataFormatada(inicio30);

    // =====================================================
    // BUSCAR TODOS OS PEDIDOS DOS ÚLTIMOS 30 DIAS
    // =====================================================

    const todosPedidos = [];

    let pagina = 1;

    const limite = 100;

    while (pagina <= 50) {

      const url =
        "https://api.bling.com.br/Api/v3/pedidos/vendas" +
        `?pagina=${pagina}` +
        `&limite=${limite}` +
        `&dataInicial=${inicio30Str}` +
        `&dataFinal=${hojeStr}`;

      const resposta =
        await buscarBling(url);

      if (!resposta.ok) {
        return res.status(
          resposta.status
        ).json({

          success: false,

          error:
            transformarErro(
              resposta.data,
              resposta.status
            ),

          pagina

        });
      }

      const pedidos =
        Array.isArray(
          resposta.data?.data
        )
          ? resposta.data.data
          : [];

      todosPedidos.push(
        ...pedidos
      );

      if (
        pedidos.length < limite
      ) {
        break;
      }

      pagina++;

      await esperar(500);
    }

    // =====================================================
    // PRODUTOS
    // =====================================================

    let produtos = [];

    const respostaProdutos =
      await buscarBling(
        "https://api.bling.com.br/Api/v3/produtos?pagina=1&limite=100"
      );

    if (respostaProdutos.ok) {
      produtos =
        Array.isArray(
          respostaProdutos.data?.data
        )
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

    function descobrirMarketplace(
      pedido
    ) {

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

      for (
        const id of possiveisIds
      ) {

        const nome =
          mapaMarketplaces[
            String(id)
          ];

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
        textos.includes(
          "mercado livre"
        ) ||
        textos.includes(
          "mercadolivre"
        ) ||
        textos.includes("meli")
      ) {
        return "Mercado Livre";
      }

      if (
        textos.includes("shopee")
      ) {
        return "Shopee";
      }

      if (
        textos.includes("tiktok")
      ) {
        return "TikTok Shop";
      }

      if (
        textos.includes("amazon")
      ) {
        return "Amazon";
      }

      return "Outros";
    }

    // =====================================================
    // CRIAR RESUMO DE UM PERÍODO
    // =====================================================

    function calcularPeriodo(
      dataInicial
    ) {

      const resultado = {

        total: 0,

        pedidos: 0,

        marketplaces: {}

      };

      for (
        const pedido of todosPedidos
      ) {

        const dataPedido =
          String(
            pedido?.data ||
            pedido?.dataPedido ||
            ""
          ).substring(0, 10);

        if (
          !dataPedido ||
          dataPedido < dataInicial ||
          dataPedido > hojeStr
        ) {
          continue;
        }

        const nome =
          descobrirMarketplace(
            pedido
          );

        const valor =
          Number(
            pedido?.total || 0
          );

        const valorSeguro =
          Number.isFinite(valor)
            ? valor
            : 0;

        resultado.total +=
          valorSeguro;

        resultado.pedidos++;

        if (
          !resultado.marketplaces[
            nome
          ]
        ) {

          resultado.marketplaces[
            nome
          ] = {

            nome,

            faturamento: 0,

            pedidos: 0

          };

        }

        resultado.marketplaces[
          nome
        ].faturamento +=
          valorSeguro;

        resultado.marketplaces[
          nome
        ].pedidos++;

      }

      return resultado;
    }

    // =====================================================
    // CALCULAR ONTEM
    // =====================================================

    const ontem =
      new Date(hoje);

    ontem.setDate(
      ontem.getDate() - 1
    );

    const ontemStr =
      dataFormatada(ontem);

    // =====================================================
    // CALCULAR OS PERÍODOS
    // =====================================================

    const periodoOntem =
      calcularPeriodo(
        ontemStr
      );

    const inicio7 =
      new Date(hoje);

    inicio7.setDate(
      inicio7.getDate() - 6
    );

    const periodo7 =
      calcularPeriodo(
        dataFormatada(inicio7)
      );

    const inicio15 =
      new Date(hoje);

    inicio15.setDate(
      inicio15.getDate() - 14
    );

    const periodo15 =
      calcularPeriodo(
        dataFormatada(inicio15)
      );

    const periodo30 =
      calcularPeriodo(
        inicio30Str
      );

    // =====================================================
    // RESUMO ATUAL DOS MARKETPLACES
    // =====================================================

    const totais = {};

    for (
      const pedido of todosPedidos
    ) {

      const dataPedido =
        String(
          pedido?.data ||
          pedido?.dataPedido ||
          ""
        ).substring(0, 10);

      if (
        dataPedido !== hojeStr
      ) {
        continue;
      }

      const nome =
        descobrirMarketplace(
          pedido
        );

      const valor =
        Number(
          pedido?.total || 0
        );

      if (
        !totais[nome]
      ) {

        totais[nome] = {

          nome,

          faturamento: 0,

          pedidos: 0

        };

      }

      totais[nome].faturamento +=
        Number.isFinite(valor)
          ? valor
          : 0;

      totais[nome].pedidos++;

    }

    const ordem = [

      "Mercado Livre",

      "Shopee",

      "TikTok Shop",

      "Amazon",

      "Outros"

    ];

    const marketplaces =
      ordem
        .filter(
          nome => totais[nome]
        )
        .map(
          nome => totais[nome]
        );

    const totalMarketplaces =
      marketplaces.reduce(
        (soma, item) =>
          soma +
          item.faturamento,
        0
      );

    // =====================================================
    // RETORNO
    // =====================================================

    return res.status(200).json({

      success: true,

      data: todosPedidos,

      pedidos: todosPedidos,

      produtos,

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
        error.message ||
        "Erro interno do servidor"

    });

  }
}
