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

    // =====================================================
    // CONFIGURAÇÕES
    // =====================================================

    const headers = {
      "Authorization": `Bearer ${access_token}`,
      "Accept": "application/json",
      "enable-jwt": "1"
    };

    // Quantidade máxima por página
    const limite = 100;

    // Intervalo normal entre requisições
    // 1000ms = 1 segundo
    const intervalo = 1000;

    // Número máximo de tentativas quando houver erro 429
    const maxTentativas = 5;

    // =====================================================
    // FUNÇÃO DE ESPERA
    // =====================================================

    const esperar = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    // =====================================================
    // FUNÇÃO SEGURA PARA CONSULTAR O BLING
    // =====================================================

    async function buscarBling(url) {
      let tentativa = 0;

      while (tentativa < maxTentativas) {
        tentativa++;

        try {
          const response = await fetch(url, {
            method: "GET",
            headers
          });

          const resultado = await response.json();

          // -------------------------------------------------
          // LIMITE DE REQUISIÇÕES DO BLING
          // -------------------------------------------------

          if (response.status === 429) {
            let tempoEspera = 2000;

            // Se o Bling informar Retry-After, respeita
            const retryAfter = response.headers.get("Retry-After");

            if (retryAfter) {
              const segundos = Number(retryAfter);

              if (!Number.isNaN(segundos) && segundos > 0) {
                tempoEspera = segundos * 1000;
              }
            }

            // Aumenta a espera a cada tentativa
            tempoEspera = Math.max(
              tempoEspera,
              tentativa * 2000
            );

            console.log(
              `Bling limitou a requisição. Tentativa ${tentativa}/${maxTentativas}. ` +
              `Aguardando ${tempoEspera}ms...`
            );

            await esperar(tempoEspera);

            continue;
          }

          // -------------------------------------------------
          // OUTROS ERROS
          // -------------------------------------------------

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
          console.error(
            `Erro na comunicação com Bling. Tentativa ${tentativa}:`,
            error
          );

          if (tentativa >= maxTentativas) {
            return {
              ok: false,
              status: 500,
              data: {
                error: error.message || "Erro de comunicação com o Bling"
              }
            };
          }

          await esperar(tentativa * 2000);
        }
      }

      return {
        ok: false,
        status: 429,
        data: {
          error: "Limite de requisições do Bling atingido após várias tentativas."
        }
      };
    }

    // =====================================================
    // DATA ATUAL - HORÁRIO DE SÃO PAULO
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

    while (true) {
      console.log(`Buscando pedidos - página ${pagina}`);

      const url =
        `https://api.bling.com.br/Api/v3/pedidos/vendas` +
        `?pagina=${pagina}` +
        `&limite=${limite}` +
        `&dataInicial=${hoje}` +
        `&dataFinal=${hoje}`;

      const resposta = await buscarBling(url);

      if (!resposta.ok) {
        return res.status(resposta.status).json({
          success: false,
          error: JSON.stringify(resposta.data),
          pagina
        });
      }

      const resultado = resposta.data;

      const pedidos = Array.isArray(resultado.data)
        ? resultado.data
        : [];

      todosPedidos.push(...pedidos);

      console.log(
        `Página ${pagina}: ${pedidos.length} pedidos encontrados.`
      );

      // Se vier menos que 100, chegamos ao final
      if (pedidos.length < limite) {
        break;
      }

      pagina++;

      // ---------------------------------------------------
      // ESPERA ENTRE REQUISIÇÕES
      // ---------------------------------------------------

      await esperar(intervalo);

      // Segurança contra loop infinito
      if (pagina > 100) {
        console.log(
          "Limite de segurança de páginas de pedidos atingido."
        );
        break;
      }
    }

    // =====================================================
    // ESPERA ANTES DE COMEÇAR OS PRODUTOS
    // =====================================================

    await esperar(intervalo);

    // =====================================================
    // PRODUTOS
    // =====================================================

    const todosProdutos = [];

    let paginaProdutos = 1;

    while (true) {
      console.log(
        `Buscando produtos - página ${paginaProdutos}`
      );

      const url =
        `https://api.bling.com.br/Api/v3/produtos` +
        `?pagina=${paginaProdutos}` +
        `&limite=${limite}`;

      const resposta = await buscarBling(url);

      if (!resposta.ok) {
        return res.status(resposta.status).json({
          success: false,
          error: JSON.stringify(resposta.data),
          pagina: paginaProdutos
        });
      }

      const resultado = resposta.data;

      const produtos = Array.isArray(resultado.data)
        ? resultado.data
        : [];

      todosProdutos.push(...produtos);

      console.log(
        `Página ${paginaProdutos}: ${produtos.length} produtos encontrados.`
      );

      // Se vier menos que 100, chegamos ao final
      if (produtos.length < limite) {
        break;
      }

      paginaProdutos++;

      // ---------------------------------------------------
      // ESPERA ENTRE REQUISIÇÕES
      // ---------------------------------------------------

      await esperar(intervalo);

      // Segurança contra loop infinito
      if (paginaProdutos > 1000) {
        console.log(
          "Limite de segurança de páginas de produtos atingido."
        );
        break;
      }
    }

    // =====================================================
    // RETORNO FINAL
    // =====================================================

    console.log(
      `Consulta concluída: ${todosPedidos.length} pedidos e ` +
      `${todosProdutos.length} produtos.`
    );

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
    console.error(
      "Erro geral ao buscar dados do Bling:",
      error
    );

    return res.status(500).json({
      success: false,
      error: error.message || "Erro interno"
    });
  }
}
