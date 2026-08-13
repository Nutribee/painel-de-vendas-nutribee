export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido"
    });
  }

  try {
    const body = req.body || {};

    const code = body.code;
    const accessToken = body.access_token;
    const action = body.action;

    /*
     * =====================================================
     * 1. CONEXÃO / OAUTH DO BLING
     * =====================================================
     */

    if (code) {
      const clientId = process.env.BLING_CLIENT_ID;
      const clientSecret = process.env.BLING_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(500).json({
          success: false,
          error: "BLING_CLIENT_ID ou BLING_CLIENT_SECRET não configurado"
        });
      }

      const credentials = Buffer.from(
        `${clientId}:${clientSecret}`
      ).toString("base64");

      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        code: code
      });

      const response = await fetch(
        "https://api.bling.com.br/Api/v3/oauth/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "Authorization": `Basic ${credentials}`,
            "enable-jwt": "1"
          },
          body: tokenBody.toString()
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Erro OAuth Bling:", data);

        return res.status(response.status).json({
          success: false,
          error: data
        });
      }

      return res.status(200).json({
        success: true,
        message: "Bling conectado com sucesso!",
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in
      });
    }

    /*
     * =====================================================
     * 2. CONSULTAR DADOS DO BLING
     * =====================================================
     */

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: "Código de autorização ou access token não informado"
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
        error: "Informe uma ação válida: produtos ou pedidos"
      });
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro API Bling:", data);

      return res.status(response.status).json({
        success: false,
        error: data
      });
    }

    return res.status(200).json({
      success: true,
      data
    });

  } catch (error) {
    console.error("Erro geral Bling:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
