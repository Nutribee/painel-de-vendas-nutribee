// ============================================================
// PAINEL DE VENDAS NUTRIBEE
// BLING API V3 - VERSAO ROBUSTA
// PEDIDOS + PERIODOS + MARKETPLACES + CACHE
// ============================================================

const BASE_URL = "https://api.bling.com.br/Api/v3";

const CACHE_TTL = 60 * 1000;

const LIMITE = 100;

const MAX_PAGINAS = 100;

const INTERVALO_API = 450;


// ============================================================
// CACHE
// ============================================================

const cacheDados =
  globalThis.__nutribee_cache_dados ||
  new Map();

globalThis.__nutribee_cache_dados =
  cacheDados;


const cacheLojas =
  globalThis.__nutribee_cache_lojas ||
  new Map();

globalThis.__nutribee_cache_lojas =
  cacheLojas;


// ============================================================
// HANDLER
// ============================================================

export default async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({

      success: false,

      error:
        "Método não permitido"

    });

  }


  try {

    const body =
      req.body || {};


    const access_token =
      body.access_token;


    const forceRefresh =
      Boolean(
        body.forceRefresh
      );


    // ========================================================
    // TOKEN
    // ========================================================

    if (!access_token) {

      return res.status(400).json({

        success: false,

        error:
          "Access token não informado."

      });

    }


    // ========================================================
    // CACHE
    // ========================================================

    const cacheKey =
      String(
        access_token
      ).slice(-40);


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
    // CONTROLE DE VELOCIDADE
    // ========================================================

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


    async function controlarAPI() {

      const agora =
        Date.now();


      const espera =
        INTERVALO_API -
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


        let dados = {};


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
        // TOKEN EXPIRADO
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


          const retryHeader =
            resposta.headers.get(
              "Retry-After"
            );


          const retrySeconds =
            Number(
              retryHeader
            );


          const tempo =
            Number.isFinite(
              retrySeconds
            ) &&
            retrySeconds > 0

              ? retrySeconds * 1000

              : 2500 * tentativa;


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


      } catch (erro) {

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
          1000 * tentativa
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

    function mensagemErro(

      data,

      status

    ) {

      if (
        typeof data ===
        "string" &&
        data.trim()
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


      return `Erro do Bling. HTTP ${status}`;

    }


    // ========================================================
    // DATA DO BRASIL
    // ========================================================

    function dataBrasil() {

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
              p =>
                p.type !==
                "literal"
            )

            .map(
              p => [
                p.type,
                p.value
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

      const [

        ano,
        mes,
        dia

      ] =
        dataTexto
          .split("-")
          .map(Number);


      const data =
        new Date(

          ano,

          mes - 1,

          dia,

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
      dataBrasil();


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
    // BUSCAR PEDIDOS DOS ÚLTIMOS 30 DIAS
    // ========================================================

    async function buscarPedidos() {

      const todos = [];


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

            `${mensagemErro(
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


      // ======================================================
      // REMOVER DUPLICADOS
      // ======================================================

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
    // EXTRAIR DATA
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


      if (!texto) {

        return "";

      }


      const iso =
        texto.match(

          /(\d{4})-(\d{2})-(\d{2})/

        );


      if (iso) {

        return (

          `${iso[1]}-${iso[2]}-${iso[3]}`

        );

      }


      const br =
        texto.match(

          /(\d{2})[\/-](\d{2})[\/-](\d{4})/

        );


      if (br) {

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


        if (data) {

          return data;

        }

      }


      return "";

    }


    // ========================================================
    // CONVERTER NÚMERO
    // ========================================================

    function numero(

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
        valor === undefined ||
        valor === null
      ) {

        return 0;

      }


      let texto =
        String(
          valor
        ).trim();


      if (!texto) {

        return 0;

      }


      texto =
        texto.replace(
          /R\$\s?/gi,
          ""
        );


      if (

        texto.includes(".") &&
        texto.includes(",")

      ) {

        texto =
          texto
            .replace(
              /\./g,
              ""
            )
            .replace(
              ",",
              "."
            );

      }

      else if (
        texto.includes(",")
      ) {

        texto =
          texto.replace(
            ",",
            "."
          );

      }


      const n =
        Number(
          texto
        );


      return Number.isFinite(
        n
      )
        ? n
        : 0;

    }


    // ========================================================
    // VALOR DO PEDIDO
    // ========================================================

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

        if (

          valor !== undefined &&
          valor !== null &&
          valor !== ""

        ) {

          return numero(
            valor
          );

        }

      }


      if (
        Array.isArray(
          pedido?.itens
        )
      ) {

        return pedido.itens.reduce(

          (
            total,
            item
          ) => {

            const quantidade =
              numero(
                item?.quantidade ||
                1
              );


            const preco =
              numero(

                item?.valor ||
                item?.preco ||
                item?.valorUnitario

              );


            return (

              total +
              quantidade *
              preco

            );

          },

          0

        );

      }


      return 0;

    }


    // ========================================================
    // TEXTO DO MARKETPLACE
    // ========================================================

    function textoMarketplace(

      valor

    ) {

      if (
        valor === undefined ||
        valor === null
      ) {

        return "";

      }


      if (
        typeof valor ===
        "string"
      ) {

        return valor.trim();

      }


      if (
        typeof valor ===
        "number"
      ) {

        return String(
          valor
        );

      }


      if (
        typeof valor ===
        "object"
      ) {

        return String(

          valor?.nome ||
          valor?.descricao ||
          valor?.name ||
          valor?.titulo ||
          valor?.tipo ||
          ""

        ).trim();

      }


      return "";

    }


    // ========================================================
    // NORMALIZAR MARKETPLACE
    // ========================================================

    function normalizarMarketplace(

      nome

    ) {

      const original =
        textoMarketplace(
          nome
        );


      if (!original) {

        return "";

      }


      const s =
        original

          .normalize("NFD")

          .replace(
            /[\u0300-\u036f]/g,
            ""
          )

          .toLowerCase()

          .trim();


      if (
        s.includes(
          "mercado livre"
        ) ||
        s.includes(
          "mercadolivre"
        )
      ) {

        return "Mercado Livre";

      }


      if (
        s.includes(
          "shopee"
        )
      ) {

        return "Shopee";

      }


      if (
        s.includes(
          "tiktok"
        ) ||
        s.includes(
          "tik tok"
        )
      ) {

        return "TikTok Shop";

      }


      if (
        s.includes(
          "amazon"
        )
      ) {

        return "Amazon";

      }


      if (
        s.includes(
          "magalu"
        ) ||
        s.includes(
          "magazine luiza"
        )
      ) {

        return "Magalu";

      }


      if (
        s.includes(
          "temu"
        )
      ) {

        return "Temu";

      }


      if (
        s.includes(
          "nuvemshop"
        )
      ) {

        return "Nuvemshop";

      }


      if (
        s.includes(
          "americanas"
        )
      ) {

        return "Americanas";

      }


      if (
        s.includes(
          "casas bahia"
        )
      ) {

        return "Casas Bahia";

      }


      if (
        s.includes(
          "shein"
        )
      ) {

        return "Shein";

      }


      return original;

    }


    // ========================================================
    // ID DA LOJA
    // ========================================================

    function obterIdLoja(

      pedido

    ) {

      const possiveis = [

        pedido?.loja?.id,

        pedido?.lojaId,

        pedido?.idLoja,

        pedido?.canalVenda?.id,

        pedido?.canalVendaId,

        pedido?.integracao?.id

      ];


      for (
        const id of possiveis
      ) {

        if (

          id !== undefined &&
          id !== null &&
          String(id).trim()

        ) {

          return String(
            id
          );

        }

      }


      return "";

    }


    // ========================================================
    // NOME DA LOJA
    // ========================================================

    function obterNomeLoja(

      pedido

    ) {

      const possiveis = [

        pedido?.loja?.nome,

        pedido?.loja?.descricao,

        pedido?.loja?.name,

        pedido?.canalVenda?.nome,

        pedido?.canalVenda?.descricao,

        pedido?.canalVenda?.name,

        pedido?.origem,

        pedido?.origemVenda,

        pedido?.marketplace,

        pedido?.marketPlace,

        pedido?.integracao?.nome,

        pedido?.integracao?.descricao,

        pedido?.integracao?.name

      ];


      for (
        const valor of possiveis
      ) {

        const nome =
          textoMarketplace(
            valor
          );


        if (nome) {

          return nome;

        }

      }


      return "";

    }


    // ========================================================
    // CONSULTAR CANAL SOMENTE SE NECESSÁRIO
    // ========================================================

    async function consultarNomeCanal(

      id

    ) {

      if (!id) {

        return "";

      }


      const salvo =
        cacheLojas.get(
          id
        );


      if (

        salvo &&

        Date.now() -
          salvo.timestamp <
          6 * 60 * 60 * 1000

      ) {

        return salvo.nome;

      }


      const resposta =
        await buscarBling(

          `${BASE_URL}/canais-venda/${encodeURIComponent(id)}`

        );


      if (
        !resposta.ok
      ) {

        return "";

      }


      const canal =
        resposta.data?.data ||
        {};


      const nome =
        normalizarMarketplace(

          canal?.nome ||

          canal?.descricao ||

          canal?.nomeCanal ||

          canal?.canal?.nome ||

          canal?.integracao?.nome ||

          ""

        );


      if (nome) {

        cacheLojas.set(

          id,

          {

            nome,

            timestamp:
              Date.now()

          }

        );

      }


      return nome;

    }


    // ========================================================
    // BUSCAR PEDIDOS
    // ========================================================

    const todosPedidos =
      await buscarPedidos();


    // ========================================================
    // MAPEAR MARKETPLACES
    // ========================================================

    const mapaCanais =
      new Map();


    const idsDesconhecidos =
      new Set();


    for (
      const pedido of todosPedidos
    ) {

      const nome =
        normalizarMarketplace(

          obterNomeLoja(
            pedido
          )

        );


      if (nome) {

        const id =
          obterIdLoja(
            pedido
          );


        if (id) {

          mapaCanais.set(
            id,
            nome
          );

        }

      }

      else {

        const id =
          obterIdLoja(
            pedido
          );


        if (id) {

          idsDesconhecidos.add(
            id
          );

        }

      }

    }


    // ========================================================
    // BUSCAR NOME DOS CANAIS DESCONHECIDOS
    // ========================================================

    for (
      const id of idsDesconhecidos
    ) {

      if (
        mapaCanais.has(id)
      ) {

        continue;

      }


      const nome =
        await consultarNomeCanal(
          id
        );


      if (nome) {

        mapaCanais.set(
          id,
          nome
        );

      }

    }


    // ========================================================
    // IDENTIFICAR MARKETPLACE
    // ========================================================

    function identificarMarketplace(

      pedido

    ) {

      const nomeDireto =
        normalizarMarketplace(

          obterNomeLoja(
            pedido
          )

        );


      if (nomeDireto) {

        return nomeDireto;

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
    // FUNÇÕES DE PERÍODO
    // ========================================================

    function dentroDoPeriodo(

      data,

      inicio,

      fim

    ) {

      return (

        Boolean(data) &&

        data >= inicio &&

        data <= fim

      );

    }


    function somaPedidos(

      lista

    ) {

      return lista.reduce(

        (
          total,
          pedido
        ) =>

          total +
          numero(
            pedido.total
          ),

        0

      );

    }


    function resumoPeriodo(

      inicio,

      fim

    ) {

      const lista =

        pedidosProcessados.filter(

          pedido =>

            dentroDoPeriodo(

              pedido.dataPainel,

              inicio,

              fim

            )

        );


      return {

        faturamento:
          somaPedidos(
            lista
          ),

        pedidos:
          lista.length

      };

    }


    // ========================================================
    // HOJE
    // ========================================================

    const pedidosHoje =

      pedidosProcessados.filter(

        pedido =>
          pedido.dataPainel ===
          hoje

      );


    // ========================================================
    // ONTEM
    // ========================================================

    const pedidosOntem =

      pedidosProcessados.filter(

        pedido =>
          pedido.dataPainel ===
          ontem

      );


    // ========================================================
    // PERÍODOS
    // ========================================================

    const periodo7 =
      resumoPeriodo(
        inicio7,
        hoje
      );


    const periodo15 =
      resumoPeriodo(
        inicio15,
        hoje
      );


    const periodo30 =
      resumoPeriodo(
        inicio30,
        hoje
      );


    // ========================================================
    // FATURAMENTO POR MARKETPLACE
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
        numero(
          pedido.total
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


      item.pedidos +=
        1;

    }


    const marketplaces =

      Array.from(
        mapaMarketplace.values()
      )

      .sort(

        (a, b) =>
          b.faturamento -
          a.faturamento

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

          (a, b) => {

            const dataA =
              a.dataPainel ||
              "";


            const dataB =
              b.dataPainel ||
              "";


            if (
              dataB !== dataA
            ) {

              return dataB.localeCompare(
                dataA
              );

            }


            return String(

              b.id ||
              b.numero ||
              ""

            ).localeCompare(

              String(

                a.id ||
                a.numero ||
                ""

              )

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
              numero(
                pedido.total
              ),

            data:
              pedido.dataPainel ||
              ""

          })

        );


    // ========================================================
    // RESULTADO FINAL
    // ========================================================

    const resultado = {

      success:
        true,


      hoje,

      ontem,

      inicio7,

      inicio15,

      inicio30,


      // IMPORTANTE:
      // o index.html usa este campo

      faturamentoHoje:
        somaPedidos(
          pedidosHoje
        ),


      pedidosHoje,


      produtos,


      pedidos:
        pedidosProcessados,


      marketplaces,


      periodos: {

        ontem: {

          faturamento:
            somaPedidos(
              pedidosOntem
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

      },


      ultimosPedidos,


      totalProdutos:
        produtos.length,


      totalPedidos:
        pedidosProcessados.length,


      atualizadoEm:
        new Date().toISOString(),


      cache:
        false

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
    // RESPOSTA
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

      success:
        false,

      error:
        error?.message ||
        "Erro interno do servidor"

    });

  }

}
