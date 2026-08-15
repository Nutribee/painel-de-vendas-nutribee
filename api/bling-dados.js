// ============================================================
// PAINEL DE VENDAS NUTRIBEE - BLING
// VERSÃO CORRIGIDA
// ============================================================

const CACHE_DADOS_TTL = 30 * 1000;
const CACHE_CANAIS_TTL = 60 * 60 * 1000;

// Bling permite até 3 requisições por segundo.
// 360ms mantém uma margem de segurança.
const INTERVALO = 360;

// Aumentado para não parar artificialmente em 5.000 pedidos.
const MAX_PAGINAS = 200;
const LIMITE_PAGINA = 100;


// ============================================================
// CACHE GLOBAL
// ============================================================

const cacheDados =
  globalThis.__blingCacheDadosV2 ||
  new Map();

globalThis.__blingCacheDadosV2 =
  cacheDados;


const cacheCanais =
  globalThis.__blingCacheCanaisV2 ||
  new Map();

globalThis.__blingCacheCanaisV2 =
  cacheCanais;


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
        "application/json"

    };


    // ========================================================
    // CONTROLE DE REQUISIÇÕES
    // ========================================================

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
        // LIMITE DA API
        // ====================================================

        if (
          response.status === 429
        ) {

          if (
            tentativa >= 5
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
    // DATA ATUAL - BRASIL
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


    // ========================================================
    // DIMINUIR DIAS
    // ========================================================

    function diminuirDias(
      dataStr,
      quantidade
    ) {

      const partes =
        dataStr.split("-");


      const data =
        new Date(
          Number(partes[0]),
          Number(partes[1]) - 1,
          Number(partes[2]),
          12,
          0,
          0
        );


      data.setDate(
        data.getDate() -
        quantidade
      );


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


    const hojeStr =
      hojeBrasil();


    const ontemStr =
      diminuirDias(
        hojeStr,
        1
      );


    // Inclusivos:
    // hoje + 6 dias anteriores
    // hoje + 14 dias anteriores
    // hoje + 29 dias anteriores

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
    // NORMALIZAR DATA
    //
    // Aceita:
    // 2026-08-15
    // 2026-08-15T10:30:00
    // 15/08/2026
    // 15-08-2026
    // ========================================================

    function normalizarData(
      valor
    ) {

      if (
        valor === undefined ||
        valor === null
      ) {

        return "";

      }


      const texto =
        String(valor)
          .trim();


      if (!texto) {

        return "";

      }


      // ISO
      const iso =
        texto.match(
          /^(\d{4})-(\d{2})-(\d{2})/
        );


      if (iso) {

        return `${iso[1]}-${iso[2]}-${iso[3]}`;

      }


      // Brasileiro
      const br =
        texto.match(
          /^(\d{2})[\/-](\d{2})[\/-](\d{4})/
        );


      if (br) {

        return `${br[3]}-${br[2]}-${br[1]}`;

      }


      // Última tentativa
      const data =
        new Date(texto);


      if (
        !Number.isNaN(
          data.getTime()
        )
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


      return "";

    }


    // ========================================================
    // OBTER DATA DO PEDIDO
    // ========================================================

    function obterDataPedido(
      pedido
    ) {

      const possiveis = [

        pedido?.data,

        pedido?.dataEmissao,

        pedido?.dataPedido,

        pedido?.dataVenda,

        pedido?.dataInclusao,

        pedido?.dataAlteracao

      ];


      for (
        const valor of possiveis
      ) {

        const data =
          normalizarData(
            valor
          );


        if (data) {

          return data;

        }

      }


      return "";

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

        if (
          typeof valor ===
          "string"
        ) {

          const limpo =
            valor
              .replace(
                /\./g,
                ""
              )
              .replace(
                ",",
                "."
              );


          const numero =
            Number(
              limpo
            );


          if (
            Number.isFinite(
              numero
            )
          ) {

            return numero;

          }

        }


        const numero =
          Number(
            valor
          );


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
    // ID DO CANAL
    // ========================================================

    function obterIdsCanal(
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


      return [
        ...new Set(
          ids
            .filter(
              id =>
                id !== undefined &&
                id !== null &&
                String(id).trim() !== ""
            )
            .map(
              id =>
                String(id)
            )
        )
      ];

    }


    // ========================================================
    // NOME DO CANAL QUE VEIO NO PEDIDO
    // ========================================================

    function obterNomeCanalPedido(
      pedido
    ) {

      const nomes = [

        pedido?.canalVenda?.nome,

        pedido?.canalVenda?.descricao,

        pedido?.canalVenda?.nomeCanal,

        pedido?.canal?.nome,

        pedido?.canal?.descricao,

        pedido?.marketplace?.nome,

        pedido?.marketplace?.descricao,

        pedido?.loja?.nome,

        pedido?.loja?.descricao

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


      return "";

    }


    // ========================================================
    // NORMALIZAR NOME DO MARKETPLACE
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
          "mercadolibre"
        ) ||
        texto === "meli" ||
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


      if (
        texto.includes(
          "shein"
        )
      ) {

        return "Shein";

      }


      if (
        texto.includes(
          "americanas"
        )
      ) {

        return "Americanas";

      }


      if (
        texto.includes(
          "casas bahia"
        ) ||
        texto.includes(
          "casasbahia"
        )
      ) {

        return "Casas Bahia";

      }


      if (
        texto === "bling" ||
        texto.includes(
          "bling api"
        )
      ) {

        return "Bling";

      }


      return String(
        nome
      ).trim();

    }


    // ========================================================
    // BUSCAR PEDIDOS
    // ========================================================

    const todosPedidos = [];


    for (
      let pagina = 1;
      pagina <= MAX_PAGINAS;
      pagina++
    ) {

      const url =
        "https://api.bling.com.br/Api/v3/pedidos/vendas" +

        `?pagina=${pagina}` +

        `&limite=${LIMITE_PAGINA}` +

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


      // Se veio menos que 100,
      // chegamos ao final.

      if (
        pedidos.length <
        LIMITE_PAGINA
      ) {

        break;

      }

    }


    // ========================================================
    // BUSCAR CANAIS DE VENDA DO BLING
    //
    // Isso elimina a dependência somente dos IDs fixos.
    // ========================================================

    const mapaCanais =
      new Map();


    async function carregarCanais() {

      const agora =
        Date.now();


      const cache =
        cacheCanais.get(
          "todos"
        );


      if (
        cache &&
        agora - cache.timestamp <
          CACHE_CANAIS_TTL
      ) {

        return cache.data;

      }


      const canais = [];


      try {

        for (
          let pagina = 1;
          pagina <= 20;
          pagina++
        ) {

          const url =
            "https://api.bling.com.br/Api/v3/canais-venda" +
            `?pagina=${pagina}` +
            `&limite=100`;


          const resposta =
            await buscarBling(
              url
            );


          if (
            !resposta.ok
          ) {

            break;

          }


          const lista =
            Array.isArray(
              resposta.data?.data
            )
              ? resposta.data.data
              : [];


          canais.push(
            ...lista
          );


          if (
            lista.length <
            100
          ) {

            break;

          }

        }

      } catch {

        // Mantém os canais fixos
        // caso a consulta não esteja disponível.

      }


      for (
        const canal of canais
      ) {

        const id =
          canal?.id;


        if (
          id === undefined ||
          id === null
        ) {

          continue;

        }


        const nome =
          canal?.nome ||
          canal?.descricao ||
          canal?.nomeCanal ||
          canal?.canal?.nome ||
          "Outros";


        mapaCanais.set(
          String(id),
          normalizarMarketplace(
            nome
          )
        );

      }


      cacheCanais.set(
        "todos",
        {

          timestamp:
            agora,

          data:
            mapaCanais

        }
      );


      return mapaCanais;

    }


    await carregarCanais();


    // ========================================================
    // IDS FIXOS CONHECIDOS
    //
    // Servem como garantia adicional.
    // ========================================================

    const canaisFixos = {

      "204824338":
        "Mercado Livre",

      "205972730":
        "Shopee",

      "205413635":
        "TikTok Shop",

      "205227624":
        "Amazon"

    };


    for (
      const [id, nome]
      of Object.entries(
        canaisFixos
      )
    ) {

      mapaCanais.set(
        id,
        nome
      );

    }


    // ========================================================
    // IDENTIFICAR MARKETPLACE
    // ========================================================

    function identificarMarketplace(
      pedido
    ) {

      // ----------------------------------------------
      // 1. Tenta todos os IDs disponíveis
      // ----------------------------------------------

      const ids =
        obterIdsCanal(
          pedido
        );


      for (
        const id of ids
      ) {

        if (
          mapaCanais.has(
            id
          )
        ) {

          const nome =
            mapaCanais.get(
              id
            );


          if (
            nome &&
            nome !== "Bling" &&
            nome !== "Outros"
          ) {

            return nome;

          }

        }

      }


      // ----------------------------------------------
      // 2. Tenta o nome que veio no pedido
      // ----------------------------------------------

      const nomePedido =
        obterNomeCanalPedido(
          pedido
        );


      const nomeNormalizado =
        normalizarMarketplace(
          nomePedido
        );


      if (
        nomeNormalizado !==
          "Outros" &&
        nomeNormalizado !==
          "Bling"
      ) {

        return nomeNormalizado;

      }


      // ----------------------------------------------
      // 3. Se o canal for Bling,
      // tenta outros campos do pedido
      // ----------------------------------------------

      const camposTexto = [

        pedido?.numeroLoja,

        pedido?.numeroPedidoLoja,

        pedido?.origem,

        pedido?.origemPedido,

        pedido?.integracao,

        pedido?.integracao?.nome,

        pedido?.integracao?.descricao

      ];


      for (
        const campo
        of camposTexto
      ) {

        if (
          typeof campo !==
          "string"
        ) {

          continue;

        }


        const nome =
          normalizarMarketplace(
            campo
          );


        if (
          nome !== "Outros" &&
          nome !== "Bling"
        ) {

          return nome;

        }

      }


      return (
        nomeNormalizado ||
        "Outros"
      );

    }


    // ========================================================
    // PROCESSAR PEDIDOS
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
            ),

          dataPainel:
            obterDataPedido(
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
          pedido.dataPainel ===
          hojeStr
      );


    const faturamentoHoje =
      pedidosHoje.reduce(
        (
          total,
          pedido
        ) =>
          total +
          pedido.total,
        0
      );


    // ========================================================
    // ONTEM
    // ========================================================

    const pedidosOntem =
      pedidosProcessados.filter(
        pedido =>
          pedido.dataPainel ===
          ontemStr
      );


    const faturamentoOntem =
      pedidosOntem.reduce(
        (
          total,
          pedido
        ) =>
          total +
          pedido.total,
        0
      );


    // ========================================================
    // PERÍODO
    // ========================================================

    function calcularPeriodo(
      inicio
    ) {

      const lista =
        pedidosProcessados.filter(
          pedido => {

            const data =
              pedido.dataPainel;


            if (!data) {

              return false;

            }


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
            pedido.total,
          0
        );


      return {

        faturamento,

        pedidos:
          lista.length

      };

    }


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
    // MARKETPLACES
    // ========================================================

    const mapaMarketplace =
      new Map();


    for (
      const pedido
      of pedidosProcessados
    ) {

      const marketplace =
        pedido.marketplace ||
        "Outros";


      const valor =
        pedido.total || 0;


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
    // PRODUTOS
    // ========================================================

    const produtosMap =
      new Map();


    for (
      const pedido
      of pedidosProcessados
    ) {

      const itens =
        Array.isArray(
          pedido?.itens
        )
          ? pedido.itens
          : [];


      for (
        const item
        of itens
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
              a.dataPainel ||
              "";

            const dataB =
              b.dataPainel ||
              "";


            if (
              dataA !==
              dataB
            ) {

              return dataB.localeCompare(
                dataA
              );

            }


            const idA =
              Number(
                a.id ||
                a.numero ||
                0
              );


            const idB =
              Number(
                b.id ||
                b.numero ||
                0
              );


            return idB - idA;

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
              pedido?.total ||
              0,

            data:
              pedido?.dataPainel ||
              ""

          })
        );


    // ========================================================
    // RESULTADO
    // ========================================================

    const resultado = {

      success: true,

      // ----------------------------------------------
      // RESUMO
      // ----------------------------------------------

      faturamentoHoje,

      pedidosHoje:
        pedidosHoje.length,

      produtos,

      totalProdutos:
        produtos.length,

      pedidos:
        pedidosProcessados,

      totalPedidos:
        pedidosProcessados.length,

      // ----------------------------------------------
      // PERÍODOS
      // ----------------------------------------------

      periodos: {

        ontem: {

          faturamento:
            faturamentoOntem,

          pedidos:
            pedidosOntem.length

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

      },

      // ----------------------------------------------
      // MARKETPLACES
      // ----------------------------------------------

      marketplaces,

      // ----------------------------------------------
      // ÚLTIMOS PEDIDOS
      // ----------------------------------------------

      ultimosPedidos,

      // ----------------------------------------------
      // INFORMAÇÕES DE DEBUG
      // ----------------------------------------------

      debug: {

        hoje:
          hojeStr,

        ontem:
          ontemStr,

        inicio7:
          inicio7Str,

        inicio15:
          inicio15Str,

        inicio30:
          inicio30Str,

        pedidosCarregados:
          todosPedidos.length,

        canaisEncontrados:
          mapaCanais.size

      },

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


    // ========================================================
    // RETORNAR
    // ========================================================

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
