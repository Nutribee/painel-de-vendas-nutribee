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
      Accept: "application/json"
    };

    // =====================================================
    // FUNÇÕES
    // =====================================================

    async function buscar(url) {
      const response = await fetch(url, {
        method: "GET",
        headers
      });

      const texto = await response.text();

      let data;

      try {
        data = texto ? JSON.parse(texto) : {};
      } catch {
        data = {
          error: texto || "Resposta inválida do Bling"
        };
      }

      if (!response.ok) {
        let mensagem = "Erro ao consultar o Bling";

        if (data?.error?.message) {
          mensagem = data.error.message;
        } else if (data?.message) {
          mensagem = data.message;
        } else if (typeof data?.error === "string") {
          mensagem = data.error;
        }

        throw new Error(
          `HTTP ${response.status}: ${mensagem}`
        );
      }

      return data;
    }

    function dataFormatada(data) {
      const ano = data.getFullYear();

      const mes = String(
        data.getMonth() + 1
      ).padStart(2, "0");

      const dia = String(
        data.getDate()
      ).padStart(2, "0");

      return `${ano}-${mes}-${dia}`;
    }

    function obterDataPedido(pedido) {
      return String(
        pedido?.data ||
        pedido?.dataPedido ||
        pedido?.dataEmissao ||
        pedido?.dataInclusao ||
        ""
      ).substring(0, 10);
    }

    function obterValorPedido(pedido) {
      const valor = Number(
        pedido?.total ??
        pedido?.valor ??
        pedido?.valorTotal ??
        pedido?.totalProdutos ??
        0
      );

      return Number.isFinite(valor)
        ? valor
        : 0;
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

      const ids = [
        pedido?.loja?.id,
        pedido?.canalVenda?.id,
        pedido?.canal?.id,
        pedido?.marketplace?.id,
        pedido?.lojaId,
        pedido?.canalVendaId,
        pedido?.canalId,
        pedido?.marketplaceId
      ];

      for (const id of ids) {

        const nome =
          mapaMarketplaces[String(id)];

        if (nome) {
          return nome;
        }
      }

      const texto = [
        pedido?.loja?.nome,
        pedido?.loja?.descricao,
        pedido?.canalVenda?.nome,
        pedido?.canalVenda?.descricao,
        pedido?.canal?.nome,
        pedido?.canal?.descricao,
        pedido?.marketplace?.nome,
        pedido?.marketplace?.descricao
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (
        texto.includes("mercado livre") ||
        texto.includes("mercadolivre") ||
        texto.includes("meli")
      ) {
        return "Mercado Livre";
      }

      if (texto.includes("shopee")) {
        return "Shopee";
      }

      if (texto.includes("tiktok")) {
        return "TikTok Shop";
      }

      if (texto.includes("amazon")) {
        return "Amazon";
      }

      return "Outros";
    }

    // =====================================================
    // DATAS
    // =====================================================

    const hoje = new Date();

    const hojeStr =
      dataFormatada(hoje);

    const ontem = new Date(hoje);

    ontem.setDate(
      ontem.getDate() - 1
    );

    const ontemStr =
      dataFormatada(ontem);

    const inicio7 = new Date(hoje);

    inicio7.setDate(
      inicio7.getDate() - 6
    );

    const inicio15 = new Date(hoje);

    inicio15.setDate(
      inicio15.getDate() - 14
    );

    const inicio30 = new Date(hoje);

    inicio30.setDate(
      inicio30.getDate() - 29
    );

    const inicio7Str =
      dataFormatada(inicio7);

    const inicio15Str =
      dataFormatada(inicio15);

    const inicio30Str =
      dataFormatada(inicio30);

    // =====================================================
    // PEDIDOS
    // =====================================================

    const todosPedidos = [];

    const limite = 100;

    let pagina = 1;

    /*
      Mantemos até 50 páginas porque você informou
      que pode ter quase 1.000 pedidos por dia.

      Mas não fazemos pausas artificiais entre páginas.
      Isso deixa a consulta muito mais rápida.
    */

    while (pagina <= 50) {

      const url =
        "https://api.bling.com.br/Api/v3/pedidos/vendas" +
        `?pagina=${pagina}` +
        `&limite=${limite}` +
        `&dataInicial=${inicio30Str}` +
        `&dataFinal=${hojeStr}`;

      const resposta =
        await buscar(url);

      const pedidos =
        Array.isArray(
          resposta?.data
        )
          ? resposta.data
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
    }

    // =====================================================
    // PRODUTOS
    // =====================================================

    /*
      Não vamos buscar produtos agora.
      O painel de vendas não precisa dessa consulta
      para calcular os períodos.

      Mantemos um array para não quebrar o index.html.
    */

    const produtos = [];

    // =====================================================
    // RESUMO DE UM PERÍODO
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
          obterDataPedido(
            pedido
          );

        if (
          !dataPedido
        ) {
          continue;
        }

        if (
          dataPedido < dataInicial ||
          dataPedido > hojeStr
        ) {
          continue;
        }

        const marketplace =
          descobrirMarketplace(
            pedido
          );

        const valor =
          obterValorPedido(
            pedido
          );

        resultado.total +=
          valor;

        resultado.pedidos++;

        if (
          !resultado.marketplaces[
            marketplace
          ]
        ) {

          resultado.marketplaces[
            marketplace
          ] = {

            nome: marketplace,

            faturamento: 0,

            pedidos: 0

          };

        }

        resultado.marketplaces[
          marketplace
        ].faturamento +=
          valor;

        resultado.marketplaces[
          marketplace
        ].pedidos++;

      }

      return resultado;
    }

    // =====================================================
    // PERÍODOS
    // =====================================================

    const periodoOntem =
      calcularPeriodo(
        ontemStr
      );

    const periodo7 =
      calcularPeriodo(
        inicio7Str
      );

    const periodo15 =
      calcularPeriodo(
        inicio15Str
      );

    const periodo30 =
      calcularPeriodo(
        inicio30Str
      );

    // =====================================================
    // HOJE
    // =====================================================

    const hojeResumo = {

      total: 0,

      pedidos: 0,

      marketplaces: {}

    };

    for (
      const pedido of todosPedidos
    ) {

      const dataPedido =
        obterDataPedido(
          pedido
        );

      if (
        dataPedido !== hojeStr
      ) {
        continue;
      }

      const marketplace =
        descobrirMarketplace(
          pedido
        );

      const valor =
        obterValorPedido(
          pedido
        );

      hojeResumo.total +=
        valor;

      hojeResumo.pedidos++;

      if (
        !hojeResumo.marketplaces[
          marketplace
        ]
      ) {

        hojeResumo.marketplaces[
          marketplace
        ] = {

          nome: marketplace,

          faturamento: 0,

          pedidos: 0

        };

      }

      hojeResumo.marketplaces[
        marketplace
      ].faturamento +=
        valor;

      hojeResumo.marketplaces[
        marketplace
      ].pedidos++;

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

    const marketplaces =
      ordem
        .filter(
          nome =>
            hojeResumo.marketplaces[
              nome
            ]
        )
        .map(
          nome =>
            hojeResumo.marketplaces[
              nome
            ]
        );

    const totalMarketplaces =
      marketplaces.reduce(
        (total, item) =>
          total +
          Number(
            item.faturamento || 0
          ),
        0
      );

    // =====================================================
    // TICKET MÉDIO
    // =====================================================

    const ticketMedio =
      hojeResumo.pedidos > 0

        ? hojeResumo.total /
          hojeResumo.pedidos

        : 0;

    // =====================================================
    // RESPOSTA
    // =====================================================

    return res.status(200).json({

      success: true,

      data: todosPedidos,

      pedidos: todosPedidos,

      produtos,

      faturamentoHoje:
        hojeResumo.total,

      pedidosHoje:
        hojeResumo.pedidos,

      ticketMedio,

      marketplaces,

      totalMarketplaces,

      periodos: {

        ontem:
          periodoOntem,

        seteDias:
          periodo7,

        quinzeDias:
          periodo15,

        trintaDias:
          periodo30

      }

    });

  } catch (error) {

    console.error(
      "Erro Bling:",
      error
    );

    return res.status(500).json({

      success: false,

      error:
        error?.message ||
        "Erro ao consultar o Bling."

    });

  }
}
