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

    const [produtosResponse, pedidosResponse] = await Promise.all([
      fetch(
        "https://api.bling.com.br/Api/v3/produtos?limite=100",
        { headers }
      ),
      fetch(
        "https://api.bling.com.br/Api/v3/pedidos/vendas?limite=100",
        { headers }
      )
    ]);

    const produtos = await produtosResponse.json();
    const pedidos = await pedidosResponse.json();

    if (!produtosResponse.ok) {
      return res.status(produtosResponse.status).json({
        success: false,
        error: JSON.stringify(produtos)
      });
    }

    if (!pedidosResponse.ok) {
      return res.status(pedidosResponse.status).json({
        success: false,
       error: JSON.stringify(pedidos)
      });
    }

    return res.status(200).json({
      success: true,
      produtos: produtos.data || [],
      pedidos: pedidos.data || []
    });

  } catch (error) {
    console.error("Erro ao buscar dados do Bling:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
