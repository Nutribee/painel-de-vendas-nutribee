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

    const esperar = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms));

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
    const limite = 100;

    while (true) {
      const url =
        `https://api.bling.com.br/Api/v3/pedidos/vendas` +
        `?pagina=${pagina}` +
        `&limite=${limite}` +
        `&dataInicial=${hoje}` +
        `&dataFinal=${hoje}`;

      const response = await fetch(url, {
        method: "GET",
        headers
      });

      const resultado = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: JSON.stringify(resultado),
          pagina
        });
      }

      const pedidos = Array.isArray(resultado.data)
        ? resultado.data
        : [];

      todosPedidos.push(...pedidos);

      if (pedidos.length < limite) {
        break;
      }

      pagina++;

      // Respeita o limite de requisições da API
      await esperar(500);

      // Segurança
      if (pagina > 100) {
        break;
      }
    }

    // =====================================================
    // PRODUTOS
    // =====================================================

    const todosProdutos = [];
    let paginaProdutos = 1;

    while (true) {
      const url =
        `https://api.bling.com.br/Api/v3/produtos` +
        `?pagina=${paginaProdutos}` +
        `&limite=${limite}`;

      const response = await fetch(url, {
        method: "GET",
        headers
      });

      const resultado = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: JSON.stringify(resultado),
          pagina: paginaProdutos
        });
      }

      const produtos = Array.isArray(resultado.data)
        ? resultado.data
        : [];

      todosProdutos.push(...produtos);

      if (produtos.length < limite) {
        break;
      }

      paginaProdutos++;

      await esperar(500);

      if (paginaProdutos > 1000) {
        break;
      }
    }

    // =====================================================
    // RETORNO
    // =====================================================

    return res.status(200).json({
      success: true,
      data: hoje,

      totalPedidos: todosPedidos.length,
      totalProdutos: todosProdutos.length,

      paginasPedidos: pagina,
      paginasProdutos: paginaProdutos,

      pedidos: todosPedidos,
      produtos: todosProdutos
    });

  } catch (error) {
    console.error("Erro ao buscar dados do Bling:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Erro interno"
    });
  }
}
