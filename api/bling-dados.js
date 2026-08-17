// ============================================================
// PAINEL DE VENDAS NUTRIBEE
// BLING API V3
// VERSÃO ESTÁVEL
// PEDIDOS + PERÍODOS + MARKETPLACES
// ============================================================

const BASE_URL =
  "https://api.bling.com.br/Api/v3";

const CACHE_TTL =
  2 * 60 * 1000;

const CACHE_CANAIS_TTL =
  60 * 60 * 1000;

const LIMITE =
  100;

const MAX_PAGINAS =
  60;

const INTERVALO_API =
  400;


// ============================================================
// MARKETPLACES DA CONTA NUTRIBEE
// ============================================================

const MARKETPLACES_FIXOS = new Map([

  ["204824338", "Mercado Livre"],

  ["205972730", "Shopee"],

  ["205413635", "TikTok Shop"],

  ["205227624", "Amazon"]

]);


// ============================================================
// CACHE
// ============================================================

const cacheDados =
  globalThis.__nutribee_cache_dados ||
  new Map();

globalThis.__nutribee_cache_dados =
  cacheDados;


const cacheCanais =
  globalThis.__nutribee_cache_canais ||
  new Map();

globalThis.__nutribee_cache_canais =
  cacheCanais;


// ============================================================
// HANDLER
// ============================================================

export default async function handler(
  req,
  res
) {

  if (
    req.method !== "POST"
  ) {

    return res.status(405).json({

      success: false,

      error:
        "Método não permitido"

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

    if (
      !access_token
    ) {

      return res.status(400).json({

        success: false,

        error:
          "Access token não informado."

      });

    }


    // ========================================================
    // CACHE DOS DADOS
    // ========================================================

    const cacheKey =
      access_token.slice(-32);


    const cache =
      cacheDados.get(
        cacheKey
      );


    if (

      !forceRefresh &&

      cache &&

      Date.now() -
        cache.timestamp <
        CACHE_TTL

    ) {

      return res.status(200).json({

        ...cache.data,

        cache: true

      });

    }


    // ========================================================
    // HEADERS BLING
    // ========================================================

    const headers = {

      Authorization:
        `Bearer ${access_token}`,

      Accept:
        "application/json",

      "Content-Type":
        "application/json",

      // Compatibilidade com JWT
      "enable-jwt":
        "1"

    };


    // ========================================================
    // CONTROLE DE VELOCIDADE
    // ========================================================

    let ultimaRequisicao =
      0;


    function esperar(
      ms
    ) {

      return new Promise(
        resolve =>
          setTimeout(
            resolve,
            ms
          )
      );

    }


    async function controlarAPI() {

      const agora =
        Date.now();


      const espera =
        INTERVALO_API -
        (
          agora -
          ultimaRequisicao
        );


      if (
        espera > 0
      ) {

        await esperar(
          espera
        );

      }


      ultimaRequisicao =
        Date.now();

    }


    // ========================================================
    // CONSULTAR BLING
    // ========================================================

    async function buscarBling(

      url,

      tentativa = 1

    ) {

      await controlarAPI();


      try {

        const resposta =
          await fetch(

            url,

            {

              method:
                "GET",

              headers

            }

          );


        const texto =
          await resposta.text();


        let dados =
          {};


        try {

          dados =
            texto
              ? JSON.parse(texto)
              : {};

        } catch {

          dados = {

            error:
              texto ||
              "Resposta inválida do Bling."

          };

        }


        // ====================================================
        // TOKEN
        // ====================================================

        if (
          resposta.status ===
          401
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
          resposta.status ===
          429
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

              resposta.headers.get(
                "Retry-After"
              )

            );


          const tempo =
            Number.isFinite(
              retryAfter
            ) &&
            retryAfter > 0

              ? retryAfter *
                1000

              : 3000 *
                tentativa;


          await esperar(
            tempo
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
          !resposta.ok
        ) {

          return {

            ok: false,

            status:
              resposta.status,

            data:
              dados

          };

        }


        return {

          ok: true,

          status:
            resposta.status,

          data:
            dados

        };


      } catch (
        erro
      ) {

        if (
          tentativa >= 3
        ) {

          return {

            ok: false,

            status: 502,

            data: {

              error:

                erro?.message ||

                "Erro de comunicação com o Bling."

            }

          };

        }


        await esperar(
          1500 *
          tentativa
        );


        return buscarBling(

          url,

          tentativa + 1

        );

      }

    }


    // ========================================================
    // MENSAGEM DE ERRO
    // ========================================================

    function obterMensagemErro(

      data,

      status

    ) {

      if (
        typeof data ===
        "string"
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
        typeof data?.error ===
        "string"
      ) {

        return data.error;

      }


      if (
        data?.message
      ) {

        return data.message;

      }


      return:

      `Erro do Bling. HTTP ${status}`;

    }


    // ========================================================
    // DATA ATUAL DO BRASIL
    // ========================================================

    function hojeBrasil() {

      const partes =

        new Intl.DateTimeFormat(

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

        ).formatToParts(
          new Date()
        );


      const mapa =
        Object.fromEntries(

          partes

            .filter(
              parte =>
                parte.type !==
                "literal"
            )

            .map(
              parte => [

                parte.type,

                parte.value

              ]
            )

        );


      return (

        `${mapa.year}-${mapa.month}-${mapa.day}`

      );

    }


    // ========================================================
    // DIMINUIR DIAS
    // ========================================================

    function diminuirDias(

      dataTexto,

      dias

    ) {

      const partes =
        dataTexto
          .split("-")
          .map(Number);


      const data =
        new Date(

          partes[0],

          partes[1] - 1,

          partes[2],

          12,

          0,

          0

        );


      data.setDate(

        data.getDate() -
        dias

      );


      return [

        data.getFullYear(),

        String(
          data.getMonth() + 1
        ).padStart(
          2,
          "0"
        ),

        String(
          data.getDate()
        ).padStart(
          2,
          "0"
        )

      ].join("-");

    }


    const hoje =
      hojeBrasil();


    const ontem =
      diminuirDias(
        hoje,
        1
      );


    const inicio7 =
      diminuirDias(
        hoje,
        6
      );


    const inicio15 =
      diminuirDias(
        hoje,
        14
      );


    const inicio30 =
      diminuirDias(
        hoje,
        29
      );


    // ========================================================
    // BUSCAR TODOS OS PEDIDOS DOS ÚLTIMOS 30 DIAS
    // ========================================================

    async function buscarPedidos() {

      const todos =
        [];


      for (

        let pagina = 1;

        pagina <=
        MAX_PAGINAS;

        pagina++

      ) {

        const params =
          new URLSearchParams({

            pagina:
              String(
                pagina
              ),

            limite:
              String(
                LIMITE
              ),

            dataInicial:
              inicio30,

            dataFinal:
              hoje

          });


        const resposta =
          await buscarBling(

            `${BASE_URL}/pedidos/vendas?${params.toString()}`

          );


        if (
          !resposta.ok
        ) {

          throw new Error(

            `${obterMensagemErro(
              resposta.data,
              resposta.status
            )} (página ${pagina})`

          );

        }


        const lista =

          Array.isArray(
            resposta.data?.data
          )

            ? resposta.data.data

            : [];


        todos.push(
          ...lista
        );


        if (
          lista.length <
          LIMITE
        ) {

          break;

        }

      }


      // Remover duplicados

      const mapa =
        new Map();


      for (
        const pedido of todos
      ) {

        const id =
          pedido?.id ??
          pedido?.numero;


        if (
          id !== undefined &&
          id !== null
        ) {

          mapa.set(

            String(id),

            pedido

          );

        }

      }


      return Array.from(
        mapa.values()
      );

    }


    // ========================================================
    // CONVERTER DATA
    // ========================================================

    function extrairData(
      valor
    ) {

      if (
        valor === undefined ||
        valor === null
      ) {

        return "";

      }


      const texto =
        String(
          valor
        ).trim();


      if (
        !texto
      ) {

        return "";

      }


      // YYYY-MM-DD
      // YYYY-MM-DDTHH:mm:ss
      // YYYY-MM-DD HH:mm:ss

      const iso =
        texto.match(

          /(\d{4})-(\d{2})-(\d{2})/

        );


      if (
        iso
      ) {

        return (

          `${iso[1]}-${iso[2]}-${iso[3]}`

        );

      }


      // DD/MM/YYYY

      const br =
        texto.match(

          /(\d{2})[\/-](\d{2})[\/-](\d{4})/

        );


      if (
        br
      ) {

        return (

          `${br[3]}-${br[2]}-${br[1]}`

        );

      }


      return "";

    }


    function obterDataPedido(
      pedido
    ) {

      const campos = [

        pedido?.data,

        pedido?.dataEmissao,

        pedido?.dataPedido,

        pedido?.dataVenda,

        pedido?.dataInclusao,

        pedido?.dataSaida

      ];


      for (
        const campo of campos
      ) {

        const data =
          extrairData(
            campo
          );


        if (
          data
        ) {

          return data;

        }

      }


      return "";

    }


    // ========================================================
    // CONVERTER VALOR
    // ========================================================

    function converterNumero(
      valor
    ) {

      if (

        typeof valor ===
        "number" &&

        Number.isFinite(
          valor
        )

      ) {

        return valor;

      }


      if (
        typeof valor !==
        "string"
      ) {

        return NaN;

      }


      const texto =
        valor.trim();


      if (
        !texto
      ) {

        return NaN;

      }


      // 1.234,56

      if (

        texto.includes(".") &&
        texto.includes(",")

      ) {

        return Number(

          texto

            .replace(
              /\./g,
              ""
            )

            .replace(
              ",",
              "."
            )

        );

      }


      // 1234,56

      if (
        texto.includes(",")
      ) {

        return Number(

          texto.replace(
            ",",
            "."
          )

        );

      }


      return Number(
        texto
      );

    }


    function obterValorPedido(
      pedido
    ) {

      const valores = [

        pedido?.total,

        pedido?.valorTotal,

        pedido?.totalProdutos,

        pedido?.valor

      ];


      for (
        const valor of valores
      ) {

        const numero =
          converterNumero(
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
    // ID DA LOJA
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

          String(id).trim()

        ) {

          return String(
            id
          ).trim();

        }

      }


      return "";

    }


    // ========================================================
    // NOME DO MARKETPLACE
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


      return "";

    }


    // ========================================================
    // NORMALIZAR MARKETPLACE
    // ========================================================

    function normalizarMarketplace(
      nome
    ) {

      if (
        !nome
      ) {

        return "Outros";

      }


      const texto =

        String(nome)

          .normalize(
            "NFD"
          )

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

        texto ===
        "meli" ||

        texto.includes(
          "meli"
        )

      ) {

        return "Mercado Livre";

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
        )
      ) {

        return "Casas Bahia";

      }


      return String(
        nome
      ).trim();

    }


    // ========================================================
    // PEDIDOS
    // ========================================================

    const pedidos =
      await buscarPedidos();


    // ========================================================
    // MAPA DE CANAIS
    // ========================================================

    const mapaCanais =
      new Map(
        MARKETPLACES_FIXOS
      );


    const idsDesconhecidos =
      new Set();


    // Primeiro usa nome que já veio no pedido

    for (
      const pedido of pedidos
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

        nome &&

        !mapaCanais.has(
          id
        )

      ) {

        mapaCanais.set(

          id,

          normalizarMarketplace(
            nome
          )

        );

      }

    }


    // Identificar IDs desconhecidos

    for (
      const pedido of pedidos
    ) {

      const id =
        obterIdLoja(
          pedido
        );


      if (

        id &&

        !mapaCanais.has(
          id
        )

      ) {

        idsDesconhecidos.add(
          id
        );

      }

    }


    // ========================================================
    // CONSULTAR CANAIS DESCONHECIDOS
    // ========================================================

    for (
      const id of idsDesconhecidos
    ) {

      const cacheCanal =
        cacheCanais.get(
          id
        );


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


      const resposta =
        await buscarBling(

          `${BASE_URL}/canais-venda/${encodeURIComponent(id)}`

        );


      let nomeFinal =
        "Outros";


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

          canal?.integracao?.nome,

          canal?.tipo?.nome

        ];


        for (
          const nome of nomes
        ) {

          if (

            typeof nome ===
            "string" &&

            nome.trim()

          ) {

            nomeFinal =
              normalizarMarketplace(
                nome
              );

            break;

          }

        }

      }


      mapaCanais.set(

        id,

        nomeFinal

      );


      cacheCanais.set(

        id,

        {

          nome:
            nomeFinal,

          timestamp:
            Date.now()

        }

      );

    }


    // ========================================================
    // IDENTIFICAR MARKETPLACE
    // ========================================================

    function identificarMarketplace(
      pedido
    ) {

      const nomeDireto =
        obterNomePedido(
          pedido
        );


      if (
        nomeDireto
      ) {

        const nome =
          normalizarMarketplace(
            nomeDireto
          );


        if (
          nome !==
          "Outros"
        ) {

          return nome;

        }

      }


      const id =
        obterIdLoja(
          pedido
        );


      if (

        id &&

        mapaCanais.has(
          id
        )

      ) {

        return mapaCanais.get(
          id
        );

      }


      return "Outros";

    }


    // ========================================================
    // PROCESSAR PEDIDOS
    // ========================================================

    const pedidosProcessados =
      pedidos.map(
        pedido => {

          const marketplace =
            identificarMarketplace(
              pedido
            );


          return {

            ...pedido,

            marketplace,

            origem:
              marketplace,

            total:
              obterValorPedido(
                pedido
              ),

            dataNormalizada:
              obterDataPedido(
                pedido
              )

          };

        }

      );


    // ========================================================
    // PEDIDOS DE HOJE
    // ========================================================

    const pedidosHoje =
      pedidosProcessados.filter(

        pedido =>

          pedido.dataNormalizada ===
          hoje

      );


    // ========================================================
    // PEDIDOS DE ONTEM
    // ========================================================

    const pedidosOntem =
      pedidosProcessados.filter(

        pedido =>

          pedido.dataNormalizada ===
          ontem

      );


    // ========================================================
    // CALCULAR PERÍODO
    // ========================================================

    function calcularPeriodo(
      inicio
    ) {

      const lista =
        pedidosProcessados.filter(

          pedido => {

            const data =
              pedido.dataNormalizada;


            return (

              data &&

              data >= inicio &&

              data <= hoje

            );

          }

        );


      return {

        faturamento:

          lista.reduce(

            (
              soma,
              pedido
            ) =>

              soma +
              Number(
                pedido.total ||
                0
              ),

            0

          ),

        pedidos:
          lista.length

      };

    }


    // ========================================================
    // FATURAMENTO DE HOJE
    // ========================================================

    const faturamentoHoje =

      pedidosHoje.reduce(

        (
          soma,
          pedido
        ) =>

          soma +
          Number(
            pedido.total ||
            0
          ),

        0

      );


    // ========================================================
    // PERÍODOS
    // ========================================================

    const periodo7 =
      calcularPeriodo(
        inicio7
      );


    const periodo15 =
      calcularPeriodo(
        inicio15
      );


    const periodo30 =
      calcularPeriodo(
        inicio30
      );


    const periodos = {

      ontem: {

        faturamento:

          pedidosOntem.reduce(

            (
              soma,
              pedido
            ) =>

              soma +
              Number(
                pedido.total ||
                0
              ),

            0

          ),

        pedidos:
          pedidosOntem.length

      },

      ultimos7:
        periodo7,

      ultimos15:
        periodo15,

      ultimos30:
        periodo30

    };


    // ========================================================
    // MARKETPLACES
    // ========================================================

    const mapaMarketplace =
      new Map();


    for (
      const pedido of pedidosProcessados
    ) {

      const nome =
        pedido.marketplace ||
        "Outros";


      const valor =
        Number(
          pedido.total ||
          0
        );


      if (
        !mapaMarketplace.has(
          nome
        )
      ) {

        mapaMarketplace.set(

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


      const item =
        mapaMarketplace.get(
          nome
        );


      item.faturamento +=
        valor;


      item.pedidos +=
        1;

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
              a.dataNormalizada ||
              "";

            const dataB =
              b.dataNormalizada ||
              "";


            return (

              dataB.localeCompare(
                dataA
              )

              ||

              Number(
                b.id || 0
              ) -

              Number(
                a.id || 0
              )

            );

          }

        )

        .slice(
          0,
          50
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
              pedido.marketplace ||
              "Outros",

            marketplace:
              pedido.marketplace ||
              "Outros",

            total:
              Number(
                pedido.total ||
                0
              ),

            data:
              pedido.dataNormalizada ||
              ""

          })

        );


    // ========================================================
    // PRODUTOS
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

          item?.produto?.id ??

          item?.id ??

          item?.codigo ??

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


    // ========================================================
    // RESULTADO
    // ========================================================

    const resultado = {

      success:
        true,

      hoje,

      pedidos:
        pedidosProcessados,

      pedidosHoje,

      faturamentoHoje,

      totalPedidos:
        pedidosProcessados.length,

      totalProdutos:
        produtosMap.size,

      produtos:
        Array.from(
          produtosMap.values()
        ),

      periodos,

      marketplaces,

      ultimosPedidos,

      atualizadoEm:
        new Date().toISOString()

    };


    // ========================================================
    // CACHE
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
    // RETORNO
    // ========================================================

    return res.status(
      200
    ).json(
      resultado
    );


  } catch (
    erro
  ) {

    console.error(

      "ERRO BLING:",

      erro

    );


    return res.status(
      500
    ).json({

      success:
        false,

      error:

        erro?.message ||

        "Erro interno ao consultar o Bling."

    });

  }

}
