export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método não permitido"
    });
  }

  try {
    const { code } = req.body || {};

    if (!code) {
      return res.status(400).json({
        success: false,
        error: "Authorization code não informado"
      });
    }

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

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: code
    });

    const response = await fetch(
      "https://api.bling.com.br/Api/v3/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "1.0",
          "Authorization": `Basic ${credentials}`,
          "enable-jwt": "1"
        },
        body: body.toString()
      }
    );

    const data = await response.json();

    if (!response.ok) {
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

  } catch (error) {
    console.error("Erro na conexão com Bling:", error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
