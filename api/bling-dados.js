// ============================================================
// PAINEL DE VENDAS NUTRIBEE - BLING
// Versão otimizada
//
// - Busca pedidos dos últimos 30 dias
// - Identifica marketplaces automaticamente
// - Não depende de IDs fixos de marketplace
// - Consulta o canal de venda quando necessário
// - Cache para evitar chamadas desnecessárias
// - Controle de requisições para evitar HTTP 429
// ============================================================


const CACHE_TTL = 2 * 60 * 1000;

const cache =
  globalThis.__blingCache ||
  new Map();

globalThis.__blingCache = cache;


// ============================================================
// HANDLER
// ============================================================

export default async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      success: false,
      error: "Método não permitido"
    });

  }


  try {

    const {
      access_token,
      forceRefresh = false
    } = req.body || {};


    // ========================================================
    // TOKEN
    // ========================================================

    if (!access_token) {

      return res.status(400).json({
        success: false,
        error: "Access token não informado"
      });

    }


    // ========================================================
    // CACHE
    // ========================================================

    const cacheKey =
      access_token.slice(-32);

    const cacheAtual =
      cache.get(cacheKey);


    if (
      !forceRefresh &&
      cacheAtual &&
      Date.now() - cacheAtual.timestamp <
        CACHE_TTL
    ) {

      return res.status(200).json({
        ...cacheAtual.data,
        cache: true
      });

    }


    // ========================================================
    // CONFIGURAÇÃO
    // ========================================================

    const headers = {

      Authorization:
        `Bearer ${access_token}`,

      Accept:
        "application/json",

      "Content-Type":
        "application/json",

      "enable-jwt":
        "1"

    };


    // ========================================================
    // CONTROLE DE REQUISIÇÕES
    //
    // Bling permite até 3 requisições por segundo.
    // Usamos 400ms entre requisições.
    // ========================================================

    const INTERVALO = 400;

    let ultimaRequisicao = 0;


    function esperar(ms) {

      return new Promise(
        resolve =>
          setTimeout(resolve, ms)
      );

    }


    async function controlarRequisicao() {

      const agora =
        Date.now();

      const espera =
        INTERVALO -
        (agora - ultimaRequisicao);


      if (espera > 0) {

        await esperar(espera);

      }


      ultimaRequisicao =
        Date.now();

    }


    // ========================================================
    // REQUISIÇÃO AO BLING
    // ========================================================

    async function buscarBling(
      url,
      tentativa = 1
    ) {

      await controlarRequisicao();


      try {

        const response =
          await fetch(
            url,
            {
              method: "GET",
              headers
            }
          );


        const texto =
          await response.text();


        let data = {};


        try {

          data =
            texto
              ? JSON.parse(texto)
              : {};

        } catch {

          data = {

            error:
              texto ||
              "Resposta inválida do Bling"

          };

        }


        // ====================================================
        // TOKEN EXPIRADO
        // ====================================================

        if (
          response.status === 401
        ) {

          return {

            ok: false,

            status: 401,

            data: {

              error:
                "Access token inválido ou expirado. Conecte o Bling novamente."

            }

          };

        }


        // ====================================================
        // LIMITE 429
        // ====================================================

        if (
          response.status === 429
        ) {

          if (
            tentativa >= 4
          ) {

            return {

              ok: false,

              status: 429,

              data: {

                error:
                  "O Bling atingiu o limite de requisições. Aguarde alguns segundos e tente novamente."

              }

            };

          }


          const retryAfter =
            Number(
              response.headers.get(
                "Retry-After"
              )
            );


          const espera =
            Number.isFinite(
              retryAfter
            ) &&
            retryAfter > 0

              ? retryAfter * 1000

              : 2500 * tentativa;


          await esperar(
            espera
          );


          return buscarBling(
            url,
            tentativa + 1
          );

        }


        // ====================================================
        // OUTROS ERROS
        // ====================================================

        if (
          !response.ok
        ) {

          return {

            ok: false,

            status:
              response.status,

            data

          };

        }


        return {

          ok: true,

          status:
            response.status,

          data

        };


      } catch (error) {

        if (
          tentativa >= 3
        ) {

          return {

            ok: false,

            status: 502,

            data: {

              error:
                `Falha de comunicação com o Bling: ${
                  error?.message ||
                  "erro desconhecido"
                }`

            }

          };

        }


        await esperar(
          1500 * tentativa
        );


        return buscarBling(
          url,
          tentativa + 1
        );

      }

    }


    // ========================================================
    // ERRO LEGÍVEL
    // ========================================================

    function transformarErro(
      data,
      status
    ) {

      if (
        typeof data === "string"
      ) {

        return data;

      }


      if (
        data?.error?.message
      ) {

        return data.error.message;

      }


      if (
        data?.error?.description
      ) {

        return data.error.description;

      }


      if (
        data?.message
      ) {

        return data.message;

      }


      if (
        typeof data?.error ===
        "string"
      ) {

        return data.error;

      }


      return `Erro do Bling (HTTP ${status})`;

    }


    // ========================================================
    // DATA DO BRASIL
    // ========================================================

    function hojeBrasil() {

      return new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone:
            "America/Sao_Paulo",

          year:
            "numeric",

          month:
            "2-digit",

          day:
            "2-digit"
        }
      ).format(
        new Date()
      );

    }


    const hojeStr =
      hojeBrasil();


    function diminuirDias(
      dataStr,
      quantidade
    ) {

      const data =
        new Date(
          `${dataStr}T12:00:00-03:00`
        );


      data.setDate(
        data.getDate() -
        quantidade
      );


      return data
        .toISOString()
        .substring(
          0,
          10
        );

    }


    const ontemStr =
      diminuirDias(
        hojeStr,
        1
      );


    const inicio7Str =
      diminuirDias(
        hojeStr,
        6
      );


    const inicio15Str =
      diminuirDias(
        hojeStr,
        14
      );


    const inicio30Str =
      diminuirDias(
        hojeStr,
        29
      );


    // ========================================================
    // PEDIDOS
    // ========================================================

    const todosPedidos = [];

    const limite = 100;

    const MAX_PAGINAS = 50;


    for (
      let pagina = 1;
      pagina <= MAX_PAGINAS;
      pagina++
    ) {

      const url =
        "https://api.bling.com.br/Api/v3/pedidos/vendas" +

        `?pagina=${pagina}` +

        `&limite=${limite}` +

        `&dataInicial=${inicio30Str}` +

        `&dataFinal=${hojeStr}`;


      const resposta =
        await buscarBling(
          url
        );


      if (
        !resposta.ok
      ) {

        return res.status(
          resposta.status
        ).json({

          success: false,

          error:
            transformarErro(
              resposta.data,
              resposta.status
            ),

          pagina

        });

      }


      const pedidos =
        Array.isArray(
          resposta.data?.data
        )

          ? resposta.data.data

          : [];


      todosPedidos.push(
        ...pedidos
      );


      // ====================================================
      // ACABOU OS PEDIDOS
      // ====================================================

      if (
        pedidos.length <
        limite
      ) {

        break;

      }

    }


    // ========================================================
    // DATA DO PEDIDO
    // ========================================================

    function obterDataPedido(
      pedido
    ) {

      return String(

        pedido?.data ||

        pedido?.dataPedido ||

        pedido?.dataEmissao ||

        pedido?.dataInclusao ||

        ""

      ).substring(
        0,
        10
      );

    }


    // ========================================================
    // VALOR DO PEDIDO
    // ========================================================

    function obterValorPedido(
      pedido
    ) {

      const valores = [

        pedido?.total,

        pedido?.valor,

        pedido?.valorTotal,

        pedido?.totalProdutos

      ];


      for (
        const valor of valores
      ) {

        const numero =
          Number(valor);


        if (
          Number.isFinite(
            numero
          )
        ) {

          return numero;

        }

      }


      return 0;

    }


    // ========================================================
    // NOME DO MARKETPLACE
    //
    // PRIMEIRO tentamos encontrar o nome dentro do pedido.
    // ========================================================

    function nomeExistenteNoPedido(
      pedido
    ) {

      const possiveis = [

        pedido?.loja?.nome,

        pedido?.loja?.descricao,

        pedido?.canalVenda?.nome,

        pedido?.canalVenda?.descricao,

        pedido?.canalVenda?.nomeCanal,

        pedido?.canal?.nome,

        pedido?.canal?.descricao,

        pedido?.marketplace?.nome,

        pedido?.marketplace?.descricao

      ];


      for (
        const valor of possiveis
      ) {

        if (
          typeof valor ===
          "string" &&
          valor.trim()
        ) {

          return valor.trim();

        }

      }


      return null;

    }


    // ========================================================
    // IDENTIFICAR ID DO CANAL
    // ========================================================

    function obterIdCanal(
      pedido
    ) {

      const ids = [

        pedido?.canalVenda?.id,

        pedido?.canal?.id,

        pedido?.marketplace?.id,

        pedido?.loja?.id,

        pedido?.canalVendaId,

        pedido?.canalId,

        pedido?.marketplaceId,

        pedido?.lojaId

      ];


      for (
        const id of ids
      ) {

        if (
          id !== undefined &&
          id !== null &&
          String(id) !== ""
        ) {

          return String(id);

        }

      }


      return null;

    }


    // ========================================================
    // NORMALIZAR NOMES
    // ========================================================

    function normalizarNome(
      nome
    ) {

      if (!nome) {

        return null;

      }


      const texto =
        String(nome)
          .trim()
          .toLowerCase();


      if (
        texto.includes(
          "mercado livre"
        ) ||
        texto.includes(
          "mercadolivre"
        ) ||
        texto.includes(
          "meli"
        )
      ) {

        return "Mercado Livre";

      }


      if (
        texto.includes(
          "shopee"
        )
      ) {

        return "Shopee";

      }


      if (
        texto.includes(
          "tiktok"
        )
      ) {

        return "TikTok Shop";

      }


      if (
        texto.includes(
          "amazon"
        )
      ) {

        return "Amazon";

      }


      if (
        texto.includes(
          "magalu"
        ) ||
        texto.includes(
          "magazine luiza"
        )
      ) {

        return "Magalu";

      }


      if (
        texto.includes(
          "nuvemshop"
        )
      ) {

        return "Nuvemshop";

      }


      if (
        texto.includes(
          "temu"
        )
      ) {

        return "Temu";

      }


      return String(nome).trim();

    }


    // ========================================================
    // MAPA DOS CANAIS
    // ========================================================

    const mapaCanais =
      new Map();


    // ========================================================
    // PRIMEIRO: APROVEITAR OS NOMES QUE JÁ VIERAM
    // ========================================================

    for (
      const pedido of todosPedidos
    ) {

      const id =
        obterIdCanal(
          pedido
        );


      const nome =
        nomeExistenteNoPedido(
          pedido
        );


      if (
        id &&
        nome
      ) {

        mapaCanais.set(
          id,
          normalizarNome(
            nome
          )
        );

      }

    }


    // ========================================================
    // PEDIDOS DE HOJE
    // ========================================================

    const pedidosHoje =
      todosPedidos.filter(
        pedido =>
          obterDataPedido(
            pedido
          ) === hojeStr
      );


    // ========================================================
    // IDs DE CANAIS QUE AINDA NÃO TEMOS NOME
    // ========================================================

    const idsParaConsultar =
      new Set();


    for (
      const pedido of pedidosHoje
    ) {

      const id =
        obterIdCanal(
          pedido
        );


      if (
        id &&
        !mapaCanais.has(id)
      ) {

        idsParaConsultar.add(
          id
        );

      }

    }


    // ========================================================
    // BUSCAR NOME DOS CANAIS NO BLING
    //
    // Só fazemos isso para os canais de HOJE que não
    // possuem nome no próprio pedido.
    //
    // Isso evita dezenas de requisições.
    // ========================================================

    for (
      const id of idsParaConsultar
    ) {

      try {

        const resposta =
          await buscarBling(
            `https://api.bling.com.br/Api/v3/canais-venda/${encodeURIComponent(id)}`
          );


        if (
          resposta.ok
        ) {

          const canal =
            resposta.data?.data;


          const nome =
            canal?.nome ||
            canal?.descricao ||
            canal?.nomeCanal;


          if (
            nome
          ) {

            mapaCanais.set(
              String(id),
              normalizarNome(
                nome
              )
            );

          }

        }

      } catch {

        // Não interrompe o painel.
        // Se não conseguir consultar o canal,
        // o sistema continua normalmente.

      }

    }


    // ========================================================
    // DESCOBRIR MARKETPLACE
    // ========================================================

    function descobrirMarketplace(
      pedido
    ) {

      const id =
        obterIdCanal(
          pedido
        );


      if (
        id &&
        mapaCanais.has(id)
      ) {

        return mapaCanais.get(id);

      }


      const nome =
        nomeExistenteNoPedido(
          pedido
        );


      if (
        nome
      ) {

        return normalizarNome(
          nome
        );

      }


      // ====================================================
      // TENTAR CAMPOS ADICIONAIS
      // ====================================================

      const texto = [

        pedido?.integracao?.nome,

        pedido?.integracao?.descricao,

        pedido?.origem,

        pedido?.origemPedido,

        pedido?.tipoIntegracao,

        pedido?.intermediador?.nome

      ]

        .filter(Boolean)

        .join(" ");


      if (
        texto
      ) {

        return normalizarNome(
          texto
        );

      }


      return "Outros";

    }


    // ========================================================
    // CALCULAR PERÍODO
    // ========================================================

    function calcularPeriodo(
      dataInicial
    ) {

      const resultado = {

        total:
          0,

        pedidos:
          0

      };


      for (
        const pedido of
        todosPedidos
      ) {

        const dataPedido =
          obterDataPedido(
            pedido
          );


        if (
          !dataPedido
        ) {

          continue;

        }


        if (
          dataPedido <
            dataInicial ||

          dataPedido >
            hojeStr
        ) {

          continue;

        }


        const valor =
          obterValorPedido(
            pedido
          );


        resultado.total +=
          valor;


        resultado.pedidos++;

      }


      return resultado;

    }


    // ========================================================
    // PERÍODOS
    // ========================================================

    const periodoOntem =
      calcularPeriodo(
        ontemStr
      );


    const periodo7 =
      calcularPeriodo(
        inicio7Str
      );


    const periodo15 =
      calcularPeriodo(
        inicio15Str
      );


    const periodo30 =
      calcularPeriodo(
        inicio30Str
      );


    // ========================================================
    // FATURAMENTO DE HOJE
    // ========================================================

    let faturamentoHoje =
      0;


    let pedidosHojeQuantidade =
      0;


    for (
      const pedido of pedidosHoje
    ) {

      faturamentoHoje +=
        obterValorPedido(
          pedido
        );


      pedidosHojeQuantidade++;

    }


    // ========================================================
    // MARKETPLACES DE HOJE
    // ========================================================

    const mapaMarketplaces =
      new Map();


    for (
      const pedido of pedidosHoje
    ) {

      const nome =
        descobrirMarketplace(
          pedido
        );


      const valor =
        obterValorPedido(
          pedido
        );


      if (
        !mapaMarketplaces.has(
          nome
        )
      ) {

        mapaMarketplaces.set(
          nome,
          {

            nome,

            faturamento:
              0,

            pedidos:
              0

          }
        );

      }


      const marketplace =
        mapaMarketplaces.get(
          nome
        );


      marketplace.faturamento +=
        valor;


      marketplace.pedidos++;

    }


    const marketplaces =
      Array.from(
        mapaMarketplaces.values()
      )
      .sort(
        (
          a,
          b
        ) =>
          b.faturamento -
          a.faturamento
      );


    // ========================================================
    // PRODUTOS
    // ========================================================

    const mapaProdutos =
      new Map();


    for (
      const pedido of
      todosPedidos
    ) {

      const itens =
        Array.isArray(
          pedido?.itens
        )

          ? pedido.itens

          : [];


      for (
        const item of itens
      ) {

        const id =
          item?.produto?.id ||
          item?.id ||
          item?.codigo ||
          item?.descricao;


        if (!id) {

          continue;

        }


        if (
          !mapaProdutos.has(
            String(id)
          )
        ) {

          mapaProdutos.set(
            String(id),
            item
          );

        }

      }

    }


    const produtos =
      Array.from(
        mapaProdutos.values()
      );


    // ========================================================
    // GARANTIR NOME DO MARKETPLACE NO PEDIDO
    // ========================================================

    for (
      const pedido of todosPedidos
    ) {

      const marketplace =
        descobrirMarketplace(
          pedido
        );


      pedido.marketplace =
        {

          nome:
            marketplace,

          descricao:
            marketplace

        };


      // Também colocamos o nome dentro de canalVenda
      // para o frontend atual reconhecer a origem.

      if (
        !pedido.canalVenda
      ) {

        pedido.canalVenda =
          {};

      }


      if (
        !pedido.canalVenda.nome
      ) {

        pedido.canalVenda.nome =
          marketplace;

      }

    }


    // ========================================================
    // RESPOSTA FINAL
    // ========================================================

    const resultado = {

      success:
        true,

      hoje:
        hojeStr,

      faturamentoHoje,

      pedidosHoje:
        pedidosHojeQuantidade,

      produtos,

      pedidos:
        todosPedidos,

      marketplaces,

      periodos: {

        ontem: {

          total:
            periodoOntem.total,

          pedidos:
            periodoOntem.pedidos

        },

        seteDias: {

          total:
            periodo7.total,

          pedidos:
            periodo7.pedidos

        },

        quinzeDias: {

          total:
            periodo15.total,

          pedidos:
            periodo15.pedidos

        },

        trintaDias: {

          total:
            periodo30.total,

          pedidos:
            periodo30.pedidos

        }

      }

    };


    // ========================================================
    // SALVAR CACHE
    // ========================================================

    cache.set(
      cacheKey,
      {

        timestamp:
          Date.now(),

        data:
          resultado

      }
    );


    // ========================================================
    // LIMPAR CACHE ANTIGO
    // ========================================================

    for (
      const [
        chave,
        valor
      ] of cache.entries()
    ) {

      if (
        Date.now() -
          valor.timestamp >
        CACHE_TTL * 2
      ) {

        cache.delete(
          chave
        );

      }

    }


    return res.status(
      200
    ).json(
      resultado
    );


  } catch (error) {

    console.error(
      "Erro Bling:",
      error
    );


    return res.status(
      500
    ).json({

      success:
        false,

      error:
        error?.message ||
        "Erro interno do servidor"

    });

  }

}
