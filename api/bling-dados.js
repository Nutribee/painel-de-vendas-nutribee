// ============================================================
// PAINEL DE VENDAS NUTRIBEE - BLING
// VERSÃO CORRIGIDA E OTIMIZADA
//
// - Busca pedidos dos últimos 30 dias
// - Identifica marketplace através do canal/loja do Bling
// - Não usa ID fixo de marketplace
// - Consulta cada canal apenas uma vez
// - Cache dos canais por 1 hora
// - Cache dos dados por 2 minutos
// - Controle de requisições para evitar HTTP 429
// ============================================================

const CACHE_DADOS_TTL = 2 * 60 * 1000;
const CACHE_CANAIS_TTL = 60 * 60 * 1000;

const cacheDados =
  globalThis.__blingCacheDados ||
  new Map();

globalThis.__blingCacheDados = cacheDados;

const cacheCanais =
  globalThis.__blingCacheCanais ||
  new Map();

globalThis.__blingCacheCanais = cacheCanais;


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
    // CACHE DOS DADOS
    // ========================================================

    const cacheKey =
      access_token.slice(-32);

    const cacheAtual =
      cacheDados.get(cacheKey);


    if (
      !forceRefresh &&
      cacheAtual &&
      Date.now() - cacheAtual.timestamp <
        CACHE_DADOS_TTL
    ) {

      return res.status(200).json({
        ...cacheAtual.data,
        cache: true
      });

    }


    // ========================================================
    // HEADERS
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
    // FUNÇÃO PRINCIPAL PARA CONSULTAR O BLING
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

              : 3000 * tentativa;


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
    // BUSCAR PEDIDOS
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
    // VALOR
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
    // ID DA LOJA / CANAL
    // ========================================================

    function obterIdLoja(
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
    // NOME QUE JÁ VEIO NO PEDIDO
    // ========================================================

    function obterNomePedido(
      pedido
    ) {

      const nomes = [

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
        const nome of nomes
      ) {

        if (
          typeof nome ===
            "string" &&
          nome.trim()
        ) {

          return nome.trim();

        }

      }


      return null;

    }


    // ========================================================
    // NORMALIZAR MARKETPLACE
    // ========================================================

    function normalizarMarketplace(
      nome
    ) {

      if (!nome) {

        return "Outros";

      }


      const texto =
        String(nome)
          .normalize("NFD")
          .replace(
            /[\u0300-\u036f]/g,
            ""
          )
          .toLowerCase()
          .trim();


      if (
        texto.includes(
          "mercado livre"
        ) ||
        texto.includes(
          "mercadolivre"
        ) ||
        texto.includes(
          "meli"
        ) ||
        texto.includes(
          "mercadolibre"
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


      if (
        texto.includes(
          "shein"
        )
      ) {

        return "Shein";

      }


      return String(nome).trim();

    }


    // ========================================================
    // MAPA DE CANAIS
    // ========================================================

    const mapaCanais =
      new Map();


    // ========================================================
    // PRIMEIRO APROVEITA O NOME QUE JÁ VEIO
    // ========================================================

    for (
      const pedido of todosPedidos
    ) {

      const id =
        obterIdLoja(
          pedido
        );


      const nome =
        obterNomePedido(
          pedido
        );


      if (
        id &&
        nome
      ) {

        mapaCanais.set(
          id,
          normalizarMarketplace(
            nome
          )
        );

      }

    }


    // ========================================================
    // BUSCAR TODOS OS IDs DE LOJA
    //
    // IMPORTANTE:
    // Aqui usamos TODOS os pedidos dos 30 dias.
    // Não somente os pedidos de hoje.
    // ========================================================

    const idsParaConsultar =
      new Set();


    for (
      const pedido of todosPedidos
    ) {

      const id =
        obterIdLoja(
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
    // CONSULTAR CANAIS NO BLING
    //
    // Cada canal é consultado uma única vez.
    // ========================================================

    for (
      const id of idsParaConsultar
    ) {

      const cacheCanal =
        cacheCanais.get(id);


      if (
        cacheCanal &&
        Date.now() -
          cacheCanal.timestamp <
          CACHE_CANAIS_TTL
      ) {

        mapaCanais.set(
          id,
          cacheCanal.nome
        );

        continue;

      }


      const url =
        `https://api.bling.com.br/Api/v3/canais-venda/${encodeURIComponent(id)}`;


      const resposta =
        await buscarBling(
          url
        );


      if (
        resposta.ok
      ) {

        const canal =
          resposta.data?.data ||
          {};


        const nomes = [

          canal?.nome,

          canal?.descricao,

          canal?.nomeCanal,

          canal?.canal?.nome,

          canal?.tipo?.nome,

          canal?.integracao?.nome

        ];


        let nomeCanal =
          null;


        for (
          const nome of nomes
        ) {

          if (
            typeof nome ===
              "string" &&
            nome.trim()
          ) {

            nomeCanal =
              nome.trim();

            break;

          }

        }


        if (
          nomeCanal
        ) {

          nomeCanal =
            normalizarMarketplace(
              nomeCanal
            );

        } else {

          nomeCanal =
            "Outros";

        }


        mapaCanais.set(
          id,
          nomeCanal
        );


        cacheCanais.set(
          id,
          {

            nome:
              nomeCanal,

            timestamp:
              Date.now()

          }

        );

      } else {

        // Não interrompe o painel inteiro
        // se um canal específico falhar.

        mapaCanais.set(
          id,
          "Outros"
        );

      }

    }


    // ========================================================
    // IDENTIFICAÇÃO FINAL
    // ========================================================

    function identificarMarketplace(
      pedido
    ) {

      const nomePedido =
        obterNomePedido(
          pedido
        );


      if (
        nomePedido
      ) {

        const normalizado =
          normalizarMarketplace(
            nomePedido
          );


        if (
          normalizado !==
          "Outros"
        ) {

          return normalizado;

        }

      }


      const id =
        obterIdLoja(
          pedido
        );


      if (
        id &&
        mapaCanais.has(id)
      ) {

        return mapaCanais.get(
          id
        );

      }


      return "Outros";

    }


    // ========================================================
    // ADICIONAR MARKETPLACE AOS PEDIDOS
    // ========================================================

    const pedidosProcessados =
      todosPedidos.map(
        pedido => ({

          ...pedido,

          marketplace:
            identificarMarketplace(
              pedido
            ),

          total:
            obterValorPedido(
              pedido
            )

        })
      );


    // ========================================================
    // RESUMO DE HOJE
    // ========================================================

    const pedidosHoje =
      pedidosProcessados.filter(
        pedido =>
          obterDataPedido(
            pedido
          ) === hojeStr
      );


    // ========================================================
    // MARKETPLACES
    // ========================================================

    const mapaMarketplace =
      new Map();


    for (
      const pedido of pedidosProcessados
    ) {

      const marketplace =
        pedido.marketplace ||
        "Outros";


      const valor =
        obterValorPedido(
          pedido
        );


      if (
        !mapaMarketplace.has(
          marketplace
        )
      ) {

        mapaMarketplace.set(
          marketplace,
          {

            nome:
              marketplace,

            faturamento:
              0,

            pedidos:
              0

          }

        );

      }


      const item =
        mapaMarketplace.get(
          marketplace
        );


      item.faturamento +=
        valor;

      item.pedidos += 1;

    }


    const marketplaces =
      Array.from(
        mapaMarketplace.values()
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
    // PERÍODOS
    // ========================================================

    function calcularPeriodo(
      inicio
    ) {

      const lista =
        pedidosProcessados.filter(
          pedido => {

            const data =
              obterDataPedido(
                pedido
              );

            return (
              data >= inicio &&
              data <= hojeStr
            );

          }
        );


      const faturamento =
        lista.reduce(
          (
            total,
            pedido
          ) =>
            total +
            obterValorPedido(
              pedido
            ),
          0
        );


      return {

        faturamento,

        pedidos:
          lista.length

      };

    }


    const periodoOntem =
      pedidosProcessados.filter(
        pedido =>
          obterDataPedido(
            pedido
          ) === ontemStr
      );


    const ontemFaturamento =
      periodoOntem.reduce(
        (
          total,
          pedido
        ) =>
          total +
          obterValorPedido(
            pedido
          ),
        0
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


    const periodos = {

      ontem: {

        faturamento:
          ontemFaturamento,

        pedidos:
          periodoOntem.length

      },

      ultimos7: {

        faturamento:
          periodo7.faturamento,

        pedidos:
          periodo7.pedidos

      },

      ultimos15: {

        faturamento:
          periodo15.faturamento,

        pedidos:
          periodo15.pedidos

      },

      ultimos30: {

        faturamento:
          periodo30.faturamento,

        pedidos:
          periodo30.pedidos

      }

    };


    // ========================================================
    // PRODUTOS
    //
    // Conta produtos distintos encontrados nos pedidos.
    // ========================================================

    const produtosMap =
      new Map();


    for (
      const pedido of pedidosProcessados
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


        if (
          id !== undefined &&
          id !== null
        ) {

          produtosMap.set(
            String(id),
            item
          );

        }

      }

    }


    const produtos =
      Array.from(
        produtosMap.values()
      );


    // ========================================================
    // ÚLTIMOS PEDIDOS
    // ========================================================

    const ultimosPedidos =
      [...pedidosProcessados]
        .sort(
          (
            a,
            b
          ) => {

            const dataA =
              obterDataPedido(
                a
              );

            const dataB =
              obterDataPedido(
                b
              );


            return dataB.localeCompare(
              dataA
            );

          }
        )
        .slice(
          0,
          20
        )
        .map(
          pedido => ({

            id:
              pedido?.id ||
              pedido?.numero ||
              "-",

            numero:
              pedido?.numero ||
              pedido?.id ||
              "-",

            origem:
              pedido?.marketplace ||
              "Outros",

            marketplace:
              pedido?.marketplace ||
              "Outros",

            total:
              obterValorPedido(
                pedido
              ),

            data:
              obterDataPedido(
                pedido
              )

          })
        );


    // ========================================================
    // RESPOSTA
    // ========================================================

    const resultado = {

      success: true,

      produtos,

      pedidos:
        pedidosProcessados,

      pedidosHoje,

      marketplaces,

      periodos,

      ultimosPedidos,

      totalProdutos:
        produtos.length,

      totalPedidos:
        pedidosProcessados.length,

      atualizadoEm:
        new Date().toISOString()

    };


    // ========================================================
    // SALVAR CACHE
    // ========================================================

    cacheDados.set(
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
    ).json(
      resultado
    );


  } catch (error) {

    console.error(
      "Erro geral Bling:",
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
