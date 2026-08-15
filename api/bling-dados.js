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

    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());

    const todosPedidos = [];

    let pagina = 1;

    const limite = 100;

    while (pagina <= 10) {

      const url =
        "https://api.bling.com.br/Api/v3/pedidos/vendas" +
        `?pagina=${pagina}` +
        `&limite=${limite}` +
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

      if (pedidos.length < limite) {
        break;
      }

      pagina++;

      await esperar(500);
    }

    const respostaProdutos = await buscarBling(
      "https://api.bling.com.br/Api/v3/produtos?pagina=1&limite=100"
    );

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

    // ==========================================
    // MARKETPLACES DA NUTRIBEE
    // ==========================================

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

        pedido?.marketplace?.id

      ];

      for (const id of possiveisIds) {

        const nome =
          mapaMarketplaces[String(id)];

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

        pedido?.numeroLoja

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

    // ==========================================
    // SOMAR FATURAMENTO
    // ==========================================

    const totais = {};

    for (const pedido of todosPedidos) {

      const nome =
        descobrirMarketplace(pedido);

      const valor =
        Number(pedido?.total || 0);

      if (!totais[nome]) {

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
        .filter((nome) => totais[nome])
        .map((nome) => totais[nome]);

    // ==========================================
    // RETORNO
    // ==========================================

    return res.status(200).json({

      success: true,

      data: todosPedidos,

      pedidos: todosPedidos,

      produtos,

      marketplaces,

      totalMarketplaces:
        marketplaces.reduce(
          (soma, item) =>
            soma + item.faturamento,
          0
        )

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
