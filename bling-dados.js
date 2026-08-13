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

    const produtosResponse = await fetch(
      "https://api.bling.com.br/Api/v3/produtos?pagina=1&limite=100",
      {
        method: "GET",
        headers
      }
    );

    const produtosData = await produtosResponse.json();

    if (!produtosResponse.ok) {
      return res.status(produtosResponse.status).json({
        success: false,
        etapa: "produtos",
        error: produtosData
      });
    }

    const pedidosResponse = await fetch(
      "https://api.bling.com.br/Api/v3/pedidos/vendas?pagina=1&limite=100",
      {
        method: "GET",
        headers
      }
    );

    const pedidosData = await pedidosResponse.json();

    if (!pedidosResponse.ok) {
      return res.status(pedidosResponse.status).json({
        success: false,
        etapa: "pedidos",
        error: pedidosData
      });
    }

    return res.status(200).json({
      success: true,
      produtos: produtosData.data || [],
      pedidos: pedidosData.data || [],
      quantidade_produtos: (produtosData.data || []).length,
      quantidade_pedidos: (pedidosData.data || []).length
    });

  } catch (error) {
    console.error("Erro ao buscar dados do Bling:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
