export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido"
    });
  }

  try {
    const { action, access_token } = req.body || {};

    if (!access_token) {
      return res.status(400).json({
        success: false,
        error: "Access token não informado"
      });
    }

    let url;

    if (action === "produtos") {
      url = "https://api.bling.com.br/Api/v3/produtos";
    } else if (action === "pedidos") {
      url = "https://api.bling.com.br/Api/v3/pedidos/vendas";
    } else {
      return res.status(400).json({
        success: false,
        error: "Ação inválida. Use produtos ou pedidos."
      });
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Accept": "application/json"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data
      });
    }

    return res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error("Erro na API Bling:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
