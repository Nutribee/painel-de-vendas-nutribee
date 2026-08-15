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

    // =========================================================
    // DATA DE HOJE - HORÁRIO DO BRASIL
    // =========================================================

    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());

    // =========================================================
    // BUSCAR TODOS OS PEDIDOS DO DIA
    // O BLING DEVOLVE ATÉ 100 POR PÁGINA
    // =========================================================

    async function buscarTodosPedidos() {
      const todosPedidos = [];

      let pagina = 1;
      const limite = 100;

      while (true) {
        const url = new URL(
          "https://api.bling.com.br/Api/v3/pedidos/vendas"
        );

        url.searchParams.set("pagina", pagina.toString());
        url.searchParams.set("limite", limite.toString());

        // Pedidos emitidos hoje
        url.searchParams.set("dataInicial", hoje);
        url.searchParams.set("dataFinal", hoje);

        const response = await fetch(url.toString(), {
          method: "GET",
          headers
        });

        const data = await response.json();

        if (!response.ok) {
          return {
            sucesso: false,
            status: response.status,
            erro: data
          };
        }

        const pedidosPagina = Array.isArray(data.data)
          ? data.data
          : [];

        todosPedidos.push(...pedidosPagina);

        // Se vieram menos de 100, chegamos ao fim
        if (pedidosPagina.length < limite) {
          break;
        }

        pagina++;

        // Segurança para evitar loop infinito
        if (pagina > 100) {
          break;
        }
      }

      return {
        sucesso: true,
        dados: todosPedidos
      };
    }

    // =========================================================
    // BUSCAR TODOS OS PRODUTOS
    // =========================================================

    async function buscarTodosProdutos() {
      const todosProdutos = [];

      let pagina = 1;
      const limite = 100;

      while (true) {
        const url = new URL(
          "https://api.bling.com.br/Api/v3/produtos"
        );

        url.searchParams.set("pagina", pagina.toString());
        url.searchParams.set("limite", limite.toString());

        const response = await fetch(url.toString(), {
          method: "GET",
          headers
        });

        const data = await response.json();

        if (!response.ok) {
          return {
            sucesso: false,
            status: response.status,
            erro: data
          };
        }

        const produtosPagina = Array.isArray(data.data)
          ? data.data
          : [];

        todosProdutos.push(...produtosPagina);

        if (produtosPagina.length < limite) {
          break;
        }

        pagina++;

        // Segurança para evitar loop infinito
        if (pagina > 1000) {
          break;
        }
      }

      return {
        sucesso: true,
        dados: todosProdutos
      };
    }

    // =========================================================
    // EXECUTAR AS DUAS BUSCAS
    // =========================================================

    const [resultadoPedidos, resultadoProdutos] =
      await Promise.all([
        buscarTodosPedidos(),
        buscarTodosProdutos()
      ]);

    // =========================================================
    // ERRO NOS PEDIDOS
    // =========================================================

    if (!resultadoPedidos.sucesso) {
      return res.status(resultadoPedidos.status || 500).json({
        success: false,
        error: JSON.stringify(resultadoPedidos.erro)
      });
    }

    // =========================================================
    // ERRO NOS PRODUTOS
    // =========================================================

    if (!resultadoProdutos.sucesso) {
      return res.status(resultadoProdutos.status || 500).json({
        success: false,
        error: JSON.stringify(resultadoProdutos.erro)
      });
    }

    // =========================================================
    // RETORNO FINAL
    // =========================================================

    return res.status(200).json({
      success: true,

      data: hoje,

      pedidos: resultadoPedidos.dados,

      produtos: resultadoProdutos.dados,

      totalPedidos: resultadoPedidos.dados.length,

      totalProdutos: resultadoProdutos.dados.length
    });

  } catch (error) {
    console.error("Erro ao buscar dados do Bling:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Erro interno ao buscar dados do Bling"
    });
  }
}
