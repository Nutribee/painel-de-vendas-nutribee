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

    // =====================================================
    // DATA DE HOJE - HORÁRIO DE BRASÍLIA
    // =====================================================

    const agora = new Date();

    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(agora);

    // =====================================================
    // BUSCAR PRODUTOS
    // =====================================================

    const produtosResponse = await fetch(
      "https://api.bling.com.br/Api/v3/produtos?pagina=1&limite=100",
      {
        headers
      }
    );

    const produtos = await produtosResponse.json();

    if (!produtosResponse.ok) {
      return res.status(produtosResponse.status).json({
        success: false,
        error: JSON.stringify(produtos)
      });
    }

    // =====================================================
    // BUSCAR TODOS OS PEDIDOS DO DIA
    // PAGINAÇÃO AUTOMÁTICA
    // =====================================================

    let todosPedidos = [];

    let pagina = 1;

    const limite = 100;

    while (true) {
      const url =
        "https://api.bling.com.br/Api/v3/pedidos/vendas" +
        `?pagina=${pagina}` +
        `&limite=${limite}` +
        `&dataInicial=${hoje}` +
        `&dataFinal=${hoje}`;

      const pedidosResponse = await fetch(url, {
        headers
      });

      const pedidos = await pedidosResponse.json();

      if (!pedidosResponse.ok) {
        return res.status(pedidosResponse.status).json({
          success: false,
          error: JSON.stringify(pedidos),
          pagina
        });
      }

      const pedidosDaPagina = pedidos.data || [];

      // Adiciona os pedidos encontrados
      todosPedidos.push(...pedidosDaPagina);

      // Se retornou menos de 100,
      // significa que chegamos à última página.
      if (pedidosDaPagina.length < limite) {
        break;
      }

      pagina++;

      // Segurança para evitar loop infinito.
      // 100 páginas = até 10.000 pedidos.
      if (pagina > 100) {
        break;
      }

      // Respeita o limite da API do Bling.
      // Espera aproximadamente 350ms entre requisições.
      await new Promise(resolve => setTimeout(resolve, 350));
    }

    // =====================================================
    // RETORNO
    // =====================================================

    return res.status(200).json({
      success: true,

      dataAtualizacao: hoje,

      totalPedidos: todosPedidos.length,

      totalProdutos: (produtos.data || []).length,

      paginasConsultadas: pagina,

      produtos: produtos.data || [],

      pedidos: todosPedidos
    });

  } catch (error) {

    console.error(
      "Erro ao buscar dados do Bling:",
      error
    );

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
