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
      new Promise(resolve => setTimeout(resolve, ms));

    // =====================================================
    // CONSULTA SEGURA AO BLING
    // =====================================================

    async function buscarBling(url, tentativa = 1) {

      try {

        const response = await fetch(url, {
          method: "GET",
          headers
        });

        const texto = await response.text();

        let resultado;

        try {
          resultado = texto ? JSON.parse(texto) : {};
        } catch {
          resultado = {
            error: texto || "Resposta inválida do Bling"
          };
        }

        // TOKEN EXPIRADO
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

        // LIMITE DO BLING
        if (response.status === 429) {

          if (tentativa >= 5) {

            return {
              ok: false,
              status: 429,
              data: {
                error:
                  "Limite de requisições do Bling atingido. Aguarde alguns segundos e tente novamente."
              }
            };

          }

          const retryAfter =
            Number(response.headers.get("Retry-After"));

          const espera =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : tentativa * 2000;

          await esperar(espera);

          return buscarBling(url, tentativa + 1);
        }

        // OUTROS ERROS
        if (!response.ok) {

          return {
            ok: false,
            status: response.status,
            data: resultado
          };

        }

        return {
          ok: true,
          status: response.status,
          data: resultado
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
    // DATA ATUAL
    // =====================================================

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

    const limitePedidos = 100;

    const maxPaginasPedidos = 10;

    while (pagina <= maxPaginasPedidos) {

      const url =
        `https://api.bling.com.br/Api/v3/pedidos/vendas` +
        `?pagina=${pagina}` +
        `&limite=${limitePedidos}` +
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

      // Chegou ao final
      if (pedidos.length < limitePedidos) {
        break;
      }

      pagina++;

      // Respeita limite do Bling
      await esperar(500);
    }

    // =====================================================
    // PRODUTOS
    // =====================================================
    // NÃO vamos mais baixar todo o catálogo.
    // Apenas 100 produtos para o painel não travar.

    await esperar(500);

    const urlProdutos =
      "https://api.bling.com.br/Api/v3/produtos?pagina=1&limite=100";

    const respostaProdutos =
      await buscarBling(urlProdutos);

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

    // =====================================================
    // RETORNO
    // =====================================================

    return res.status(200).json({

      success: true,

      data: hoje,

      totalPedidos: todosPedidos.length,

      totalProdutos: produtos.length,

      paginasPedidos: pagina,

      pedidos: todosPedidos,

      produtos: produtos

    });

  } catch (error) {

    console.error(
      "Erro geral ao buscar dados do Bling:",
      error
    );

    return res.status(500).json({

      success: false,

      error:
        error.message ||
        "Erro interno no servidor"

    });

  }

}
