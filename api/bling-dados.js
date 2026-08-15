// Painel de Vendas Nutribee - Bling
// Consulta somente pedidos dos últimos 30 dias.
// Possui cache curto e controle de requisições para evitar HTTP 429.

const CACHE_TTL = 60 * 1000;

const cache =
  globalThis.__blingCache ||
  new Map();

globalThis.__blingCache = cache;


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


    if (!access_token) {

      return res.status(400).json({
        success: false,
        error: "Access token não informado"
      });

    }


    // =====================================================
    // CACHE
    // =====================================================

    const cacheKey =
      access_token.slice(-24);

    const cacheAtual =
      cache.get(cacheKey);


    if (
      !forceRefresh &&
      cacheAtual &&
      (
        Date.now() -
        cacheAtual.timestamp
      ) < CACHE_TTL
    ) {

      return res.status(200).json({
        ...cacheAtual.data,
        cache: true
      });

    }


    // =====================================================
    // CONFIGURAÇÃO
    // =====================================================

    const headers = {

      Authorization:
        `Bearer ${access_token}`,

      Accept:
        "application/json"

    };


    // Intervalo entre requisições
    // para evitar HTTP 429.

    const INTERVALO = 750;

    let ultimaRequisicao = 0;


    function esperar(ms) {

      return new Promise(
        resolve =>
          setTimeout(
            resolve,
            ms
          )
      );

    }


    async function controlarRequisicao() {

      const agora =
        Date.now();

      const espera =
        INTERVALO -
        (
          agora -
          ultimaRequisicao
        );


      if (espera > 0) {

        await esperar(
          espera
        );

      }


      ultimaRequisicao =
        Date.now();

    }


    // =====================================================
    // BUSCAR DADOS DO BLING
    // =====================================================

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


        // =================================================
        // TOKEN EXPIRADO
        // =================================================

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


        // =================================================
        // LIMITE 429
        // =================================================

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

              : 4000 * tentativa;


          await esperar(
            espera
          );


          return buscarBling(
            url,
            tentativa + 1
          );

        }


        // =================================================
        // OUTROS ERROS
        // =================================================

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
          2000 * tentativa
        );


        return buscarBling(
          url,
          tentativa + 1
        );

      }

    }


    // =====================================================
    // ERRO LEGÍVEL
    // =====================================================

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


    // =====================================================
    // DATAS
    // =====================================================

    function dataFormatada(
      data
    ) {

      const ano =
        data.getFullYear();


      const mes =
        String(
          data.getMonth() + 1
        ).padStart(
          2,
          "0"
        );


      const dia =
        String(
          data.getDate()
        ).padStart(
          2,
          "0"
        );


      return `${ano}-${mes}-${dia}`;

    }


    const hoje =
      new Date();


    const hojeStr =
      dataFormatada(
        hoje
      );


    // =====================================================
    // ONTEM
    // =====================================================

    const ontem =
      new Date(
        hoje
      );


    ontem.setDate(
      ontem.getDate() - 1
    );


    const ontemStr =
      dataFormatada(
        ontem
      );


    // =====================================================
    // 7 DIAS
    // =====================================================

    const inicio7 =
      new Date(
        hoje
      );


    inicio7.setDate(
      inicio7.getDate() - 6
    );


    const inicio7Str =
      dataFormatada(
        inicio7
      );


    // =====================================================
    // 15 DIAS
    // =====================================================

    const inicio15 =
      new Date(
        hoje
      );


    inicio15.setDate(
      inicio15.getDate() - 14
    );


    const inicio15Str =
      dataFormatada(
        inicio15
      );


    // =====================================================
    // 30 DIAS
    // =====================================================

    const inicio30 =
      new Date(
        hoje
      );


    inicio30.setDate(
      inicio30.getDate() - 29
    );


    const inicio30Str =
      dataFormatada(
        inicio30
      );


    // =====================================================
    // PEDIDOS
    // =====================================================

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


      // Se vier menos de 100,
      // chegamos ao final.

      if (
        pedidos.length <
        limite
      ) {

        break;

      }

    }


    // =====================================================
    // MARKETPLACES
    // =====================================================

    const mapaMarketplaces = {

      "204824338":
        "Mercado Livre",

      "205972730":
        "Shopee",

      "205413635":
        "TikTok Shop",

      "205227624":
        "Amazon"

    };


    function descobrirMarketplace(
      pedido
    ) {


      const ids = [

        pedido?.loja?.id,

        pedido?.canalVenda?.id,

        pedido?.canal?.id,

        pedido?.marketplace?.id,

        pedido?.lojaId,

        pedido?.canalVendaId,

        pedido?.canalId,

        pedido?.marketplaceId

      ];


      for (
        const id of ids
      ) {

        const nome =
          mapaMarketplaces[
            String(id)
          ];


        if (nome) {

          return nome;

        }

      }


      // =================================================
      // TENTATIVA PELO NOME
      // =================================================

      const texto = [

        pedido?.loja?.nome,

        pedido?.loja?.descricao,

        pedido?.canalVenda?.nome,

        pedido?.canalVenda?.descricao,

        pedido?.canal?.nome,

        pedido?.canal?.descricao,

        pedido?.marketplace?.nome,

        pedido?.marketplace?.descricao

      ]

        .filter(Boolean)

        .join(" ")

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


      return "Outros";

    }


    // =====================================================
    // DATA DO PEDIDO
    // =====================================================

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


    // =====================================================
    // VALOR
    // =====================================================

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


    // =====================================================
    // CALCULAR PERÍODO
    // =====================================================

    function calcularPeriodo(
      dataInicial
    ) {

      const resultado = {

        total: 0,

        pedidos: 0,

        marketplaces: {}

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


        const nome =
          descobrirMarketplace(
            pedido
          );


        const valor =
          obterValorPedido(
            pedido
          );


        resultado.total +=
          valor;


        resultado.pedidos++;


        if (
          !resultado
            .marketplaces[
              nome
            ]
        ) {

          resultado
            .marketplaces[
              nome
            ] = {

              nome,

              faturamento:
                0,

              pedidos:
                0

            };

        }


        resultado
          .marketplaces[
            nome
          ]
          .faturamento +=
            valor;


        resultado
          .marketplaces[
            nome
          ]
          .pedidos++;

      }


      return resultado;

    }


    // =====================================================
    // PERÍODOS
    // =====================================================

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


    // =====================================================
    // HOJE
    // =====================================================

    const totaisHoje = {};

    let faturamentoHoje =
      0;

    let pedidosHoje =
      0;


    for (
      const pedido of
      todosPedidos
    ) {


      if (
        obterDataPedido(
          pedido
        ) !== hojeStr
      ) {

        continue;

      }


      const nome =
        descobrirMarketplace(
          pedido
        );


      const valor =
        obterValorPedido(
          pedido
        );


      faturamentoHoje +=
        valor;


      pedidosHoje++;


      if (
        !totaisHoje[
          nome
        ]
      ) {

        totaisHoje[
          nome
        ] = {

          nome,

          faturamento:
            0,

          pedidos:
            0

        };

      }


      totaisHoje[
        nome
      ].faturamento +=
        valor;


      totaisHoje[
        nome
      ].pedidos++;

    }


    // =====================================================
    // ORDEM DOS MARKETPLACES
    // =====================================================

    const ordem = [

      "Mercado Livre",

      "Shopee",

      "TikTok Shop",

      "Amazon",

      "Outros"

    ];


    const marketplaces =
      ordem

        .filter(
          nome =>
            totaisHoje[
              nome
            ]
        )

        .map(
          nome =>
            totaisHoje[
              nome
            ]
        );


    // =====================================================
    // TOTAL MARKETPLACES
    // =====================================================

    const totalMarketplaces =
      marketplaces.reduce(

        (
          soma,
          item
        ) =>

          soma +
          Number(
            item.faturamento ||
            0
          ),

        0

      );


    // =====================================================
    // TICKET MÉDIO
    // =====================================================

    const ticketMedio =
      pedidosHoje > 0

        ? faturamentoHoje /
          pedidosHoje

        : 0;


    // =====================================================
    // RESULTADO
    // =====================================================

    const resultado = {

      success: true,

      data:
        todosPedidos,

      pedidos:
        todosPedidos,

      // Produtos não são buscados,
      // evitando requisições extras.

      produtos: [],

      faturamentoHoje,

      pedidosHoje,

      ticketMedio,

      marketplaces,

      totalMarketplaces,

      periodos: {

        ontem:
          periodoOntem,

        seteDias:
          periodo7,

        quinzeDias:
          periodo15,

        trintaDias:
          periodo30

      }

    };


    // =====================================================
    // SALVAR CACHE
    // =====================================================

    cache.set(
      cacheKey,
      {

        timestamp:
          Date.now(),

        data:
          resultado

      }
    );


    return res.status(
      200
    ).json({

      ...resultado,

      cache: false

    });


  } catch (error) {


    console.error(
      "Erro Bling:",
      error
    );


    return res.status(
      500
    ).json({

      success: false,

      error:
        error?.message ||
        "Erro interno do servidor"

    });

  }

}
