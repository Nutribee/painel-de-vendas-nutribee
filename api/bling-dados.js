// ============================================================
// PAINEL DE VENDAS NUTRIBEE
// BLING API V3
// VERSÃO ESTÁVEL
//
// - Faturamento hoje
// - Ontem
// - Últimos 7 dias
// - Últimos 15 dias
// - Últimos 30 dias
// - Faturamento por marketplace
// - Nome dos marketplaces
// - Últimos pedidos
// - Produtos
// - Cache
// - Proteção contra HTTP 429
// ============================================================

const BASE_URL = "https://api.bling.com.br/Api/v3";

const LIMITE = 100;
const MAX_PAGINAS = 100;

// Cache dos dados por 60 segundos
const CACHE_TTL = 60 * 1000;

// Cache dos canais por 6 horas
const CACHE_CANAL_TTL = 6 * 60 * 60 * 1000;


// ============================================================
// CACHE GLOBAL
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

export default async function handler(req, res) {

  if (req.method !== "POST") {

    return res.status(405).json({
      success: false,
      error: "Método não permitido"
    });

  }


  try {

    const body = req.body || {};

    const access_token =
      body.access_token;

    const forceRefresh =
      Boolean(body.forceRefresh);


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
    // CACHE DOS DADOS
    // ========================================================

    const cacheKey =
      String(access_token).slice(-40);

    const cache =
      cacheDados.get(cacheKey);


    if (
      !forceRefresh &&
      cache &&
      Date.now() - cache.timestamp < CACHE_TTL
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
        "application/json"

    };


    // ========================================================
    // ESPERA
    // ========================================================

    function esperar(ms) {

      return new Promise(resolve =>
        setTimeout(resolve, ms)
      );

    }


    // ========================================================
    // CONTROLE DE REQUISIÇÕES
    // ========================================================

    let ultimaRequisicao = 0;

    async function controlarAPI() {

      const agora =
        Date.now();

      const intervalo =
        500;

      const espera =
        intervalo -
        (agora - ultimaRequisicao);

      if (espera > 0) {

        await esperar(espera);

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
          await fetch(url, {

            method: "GET",

            headers

          });


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
        // TOKEN
        // ====================================================

        if (resposta.status === 401) {

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

        if (resposta.status === 429) {

          if (tentativa >= 5) {

            return {

              ok: false,

              status: 429,

              data: {

                error:
                  "O Bling atingiu o limite de requisições. Aguarde alguns segundos e tente novamente."

              }

            };

          }


          const retry =
            Number(
              resposta.headers.get(
                "Retry-After"
              )
            );


          const tempo =
            Number.isFinite(retry) &&
            retry > 0

              ? retry * 1000

              : 3000 * tentativa;


          await esperar(tempo);


          return buscarBling(
            url,
            tentativa + 1
          );

        }


        // ====================================================
        // OUTROS ERROS
        // ====================================================

        if (!resposta.ok) {

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

        if (tentativa >= 3) {

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
    // ERRO
    // ========================================================

    function mensagemErro(
      data,
      status
    ) {

      if (
        typeof data === "string" &&
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
        typeof data?.error === "string"
      ) {

        return data.error;

      }


      if (data?.message) {

        return data.message;

      }


      return `Erro do Bling. HTTP ${status}`;

    }


    // ========================================================
    // DATA ATUAL DO BRASIL
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
                p.type !== "literal"
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
        data.getDate() - dias
      );


      return [

        data.getFullYear(),

        String(
          data.getMonth() + 1
        ).padStart(2, "0"),

        String(
          data.getDate()
        ).padStart(2, "0")

      ].join("-");

    }


    const hoje =
      dataBrasil();


    const ontem =
      diminuirDias(
        hoje,
        1
      );


    // 7 dias contando hoje
    const inicio7 =
      diminuirDias(
        hoje,
        6
      );


    // 15 dias contando hoje
    const inicio15 =
      diminuirDias(
        hoje,
        14
      );


    // 30 dias contando hoje
    const inicio30 =
      diminuirDias(
        hoje,
        29
      );


    // ========================================================
    // EXTRAIR DATA
    // ========================================================

    function extrairData(valor) {

      if (
        valor === undefined ||
        valor === null
      ) {

        return "";

      }


      const texto =
        String(valor).trim();


      if (!texto) {

        return "";

      }


      // YYYY-MM-DD
      const iso =
        texto.match(
          /(\d{4})-(\d{2})-(\d{2})/
        );


      if (iso) {

        return (
          `${iso[1]}-${iso[2]}-${iso[3]}`
        );

      }


      // DD/MM/YYYY
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


    // ========================================================
    // DATA DO PEDIDO
    // ========================================================

    function obterDataPedido(pedido) {

      const campos = [

        pedido?.data,

        pedido?.dataEmissao,

        pedido?.dataPedido,

        pedido?.dataVenda,

        pedido?.dataInclusao,

        pedido?.dataCriacao,

        pedido?.dataSaida,

        pedido?.createdAt,

        pedido?.created_at

      ];


      for (
        const campo of campos
      ) {

        const data =
          extrairData(campo);


        if (data) {

          return data;

        }

      }


      return "";

    }


    // ========================================================
    // CONVERTER NÚMERO
    // ========================================================

    function numero(valor) {

      if (
        typeof valor === "number" &&
        Number.isFinite(valor)
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
        String(valor).trim();


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
            .replace(/\./g, "")
            .replace(",", ".");

      }

      else if (
        texto.includes(",")
      ) {

        texto =
          texto.replace(",", ".");

      }


      const n =
        Number(texto);


      return Number.isFinite(n)
        ? n
        : 0;

    }


    // ========================================================
    // VALOR DO PEDIDO
    // ========================================================

    function obterValorPedido(pedido) {

      const valores = [

        pedido?.total,

        pedido?.valorTotal,

        pedido?.totalPedido,

        pedido?.valor,

        pedido?.totalVenda,

        pedido?.valorVenda

      ];


      for (
        const valor of valores
      ) {

        if (
          valor !== undefined &&
          valor !== null &&
          valor !== ""
        ) {

          return numero(valor);

        }

      }


      // Fallback pelos itens

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
                item?.quantidade || 1
              );


            const preco =
              numero(

                item?.valor ??
                item?.preco ??
                item?.valorUnitario ??
                0

              );


            return (
              total +
              quantidade * preco
            );

          },

          0

        );

      }


      return 0;

    }


    // ========================================================
    // TEXTO
    // ========================================================

    function texto(valor) {

      if (
        valor === undefined ||
        valor === null
      ) {

        return "";

      }


      if (
        typeof valor === "string"
      ) {

        return valor.trim();

      }


      if (
        typeof valor === "number"
      ) {

        return String(valor);

      }


      if (
        typeof valor === "object"
      ) {

        return (

          valor?.nome ||

          valor?.descricao ||

          valor?.name ||

          valor?.titulo ||

          valor?.descricaoCanal ||

          ""

        ).toString().trim();

      }


      return "";

    }


    // ========================================================
    // NORMALIZAR NOME DO MARKETPLACE
    // ========================================================

    function normalizarMarketplace(valor) {

      const original =
        texto(valor);


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
          .toLowerCase();


      if (
        s.includes("mercado livre") ||
        s.includes("mercadolivre") ||
        s.includes("meli") ||
        s.includes("mercado-livre")
      ) {

        return "Mercado Livre";

      }


      if (
        s.includes("shopee")
      ) {

        return "Shopee";

      }


      if (
        s.includes("tiktok") ||
        s.includes("tik tok")
      ) {

        return "TikTok Shop";

      }


      if (
        s.includes("amazon")
      ) {

        return "Amazon";

      }


      if (
        s.includes("magalu") ||
        s.includes("magazine luiza")
      ) {

        return "Magalu";

      }


      if (
        s.includes("temu")
      ) {

        return "Temu";

      }


      if (
        s.includes("nuvemshop") ||
        s.includes("nuvem shop")
      ) {

        return "Nuvemshop";

      }


      if (
        s.includes("americanas")
      ) {

        return "Americanas";

      }


      if (
        s.includes("casas bahia")
      ) {

        return "Casas Bahia";

      }


      if (
        s.includes("shein")
      ) {

        return "Shein";

      }


      if (
        s.includes("bling")
      ) {

        return "Bling";

      }


      return original;

    }


    // ========================================================
    // ENCONTRAR MARKETPLACE DENTRO DO PEDIDO
    // ========================================================

    function procurarMarketplace(
      pedido
    ) {

      const campos = [

        pedido?.marketplace,

        pedido?.marketPlace,

        pedido?.origem,

        pedido?.origemVenda,

        pedido?.canal,

        pedido?.canalVenda,

        pedido?.nomeCanal,

        pedido?.descricaoCanal,

        pedido?.nomeMarketplace,

        pedido?.nomeLoja,

        pedido?.numeroLoja,

        pedido?.loja,

        pedido?.integracao,

        pedido?.ecommerce

      ];


      // Primeiro procura nos campos certos

      for (
        const campo of campos
      ) {

        const nome =
          normalizarMarketplace(
            campo
          );


        if (nome) {

          return nome;

        }

      }


      // ======================================================
      // BUSCA RECURSIVA SOMENTE EM TEXTOS
      // ======================================================

      function percorrer(
        valor,
        nivel = 0
      ) {

        if (nivel > 5) {

          return "";

        }


        if (
          valor === undefined ||
          valor === null
        ) {

          return "";

        }


        if (
          typeof valor === "string"
        ) {

          return normalizarMarketplace(
            valor
          );

        }


        if (
          Array.isArray(valor)
        ) {

          for (
            const item of valor
          ) {

            const resultado =
              percorrer(
                item,
                nivel + 1
              );


            if (
              resultado &&
              resultado !== "Outros"
            ) {

              return resultado;

            }

          }

        }


        if (
          typeof valor === "object"
        ) {

          for (
            const chave of Object.keys(valor)
          ) {

            const resultado =
              percorrer(
                valor[chave],
                nivel + 1
              );


            if (
              resultado &&
              resultado !== "Outros"
            ) {

              return resultado;

            }

          }

        }


        return "";

      }


      const resultado =
        percorrer(
          pedido
        );


      return resultado || "";

    }


    // ========================================================
    // ID DO CANAL
    // ========================================================

    function obterIdCanal(
      pedido
    ) {

      const ids = [

        pedido?.canalVenda?.id,

        pedido?.canalVendaId,

        pedido?.idCanalVenda,

        pedido?.canal?.id,

        pedido?.origem?.id

      ];


      for (
        const id of ids
      ) {

        if (
          id !== undefined &&
          id !== null &&
          String(id).trim()
        ) {

          return String(id);

        }

      }


      return "";

    }


    // ========================================================
    // ID DA LOJA
    // ========================================================

    function obterIdLoja(
      pedido
    ) {

      const ids = [

        pedido?.loja?.id,

        pedido?.lojaId,

        pedido?.idLoja

      ];


      for (
        const id of ids
      ) {

        if (
          id !== undefined &&
          id !== null &&
          String(id).trim()
        ) {

          return String(id);

        }

      }


      return "";

    }


    // ========================================================
    // BUSCAR PEDIDOS
    // ========================================================

    async function buscarPedidos() {

      const todos = [];


      for (
        let pagina = 1;

        pagina <= MAX_PAGINAS;

        pagina++
      ) {

        const params =
          new URLSearchParams({

            pagina:
              String(pagina),

            limite:
              String(LIMITE),

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


        // Se veio menos de 100,
        // terminou a paginação.

        if (
          lista.length < LIMITE
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
    // BUSCAR CANAL PELO ID
    // ========================================================

    async function buscarCanal(
      id
    ) {

      if (!id) {

        return "";

      }


      const salvo =
        cacheCanais.get(id);


      if (
        salvo &&
        Date.now() - salvo.timestamp <
          CACHE_CANAL_TTL
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
        resposta.data?.data || {};


      const nomes = [

        canal?.nome,

        canal?.descricao,

        canal?.nomeCanal,

        canal?.canal?.nome,

        canal?.integracao?.nome

      ];


      for (
        const valor of nomes
      ) {

        const nome =
          normalizarMarketplace(
            valor
          );


        if (nome) {

          cacheCanais.set(

            id,

            {

              nome,

              timestamp:
                Date.now()

            }

          );


          return nome;

        }

      }


      return "";

    }


    // ========================================================
    // PEGAR TODOS OS PEDIDOS
    // ========================================================

    const todosPedidos =
      await buscarPedidos();


    // ========================================================
    // MAPEAR CANAIS
    // ========================================================

    const mapaCanais =
      new Map();


    const idsCanais =
      new Set();


    for (
      const pedido of todosPedidos
    ) {

      // Primeiro tenta diretamente

      const direto =
        procurarMarketplace(
          pedido
        );


      const idCanal =
        obterIdCanal(
          pedido
        );


      if (
        direto &&
        direto !== "Outros"
      ) {

        if (idCanal) {

          mapaCanais.set(
            idCanal,
            direto
          );

        }

        continue;

      }


      if (idCanal) {

        idsCanais.add(
          idCanal
        );

      }

    }


    // ========================================================
    // CONSULTAR SOMENTE OS CANAIS DESCONHECIDOS
    // ========================================================

    for (
      const id of idsCanais
    ) {

      if (
        mapaCanais.has(id)
      ) {

        continue;

      }


      const nome =
        await buscarCanal(id);


      if (nome) {

        mapaCanais.set(
          id,
          nome
        );

      }

    }


    // ========================================================
    // IDENTIFICAR MARKETPLACE FINAL
    // ========================================================

    function identificarMarketplace(
      pedido
    ) {

      // 1 - Nome diretamente no pedido

      const direto =
        procurarMarketplace(
          pedido
        );


      if (
        direto &&
        direto !== "Outros"
      ) {

        return direto;

      }


      // 2 - Canal de venda

      const idCanal =
        obterIdCanal(
          pedido
        );


      if (
        idCanal &&
        mapaCanais.has(idCanal)
      ) {

        return mapaCanais.get(
          idCanal
        );

      }


      // 3 - Última tentativa pelo ID da loja

      const idLoja =
        obterIdLoja(
          pedido
        );


      if (
        idLoja &&
        mapaCanais.has(idLoja)
      ) {

        return mapaCanais.get(
          idLoja
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
    // FILTRO POR DATA
    // ========================================================

    function dentroDoPeriodo(
      data,
      inicio,
      fim
    ) {

      if (!data) {

        return false;

      }


      return (
        data >= inicio &&
        data <= fim
      );

    }


    // ========================================================
    // SOMAR
    // ========================================================

    function soma(
      lista
    ) {

      return lista.reduce(

        (
          total,
          pedido
        ) => {

          return (
            total +
            numero(
              pedido.total
            )
          );

        },

        0

      );

    }


    // ========================================================
    // HOJE
    // ========================================================

    const pedidosHoje =
      pedidosProcessados.filter(

        pedido =>
          pedido.dataPainel === hoje

      );


    // ========================================================
    // ONTEM
    // ========================================================

    const pedidosOntem =
      pedidosProcessados.filter(

        pedido =>
          pedido.dataPainel === ontem

      );


    // ========================================================
    // 7 DIAS
    // ========================================================

    const pedidos7 =
      pedidosProcessados.filter(

        pedido =>
          dentroDoPeriodo(
            pedido.dataPainel,
            inicio7,
            hoje
          )

      );


    // ========================================================
    // 15 DIAS
    // ========================================================

    const pedidos15 =
      pedidosProcessados.filter(

        pedido =>
          dentroDoPeriodo(
            pedido.dataPainel,
            inicio15,
            hoje
          )

      );


    // ========================================================
    // 30 DIAS
    // ========================================================

    const pedidos30 =
      pedidosProcessados.filter(

        pedido =>
          dentroDoPeriodo(
            pedido.dataPainel,
            inicio30,
            hoje
          )

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
              a.dataPainel || "";

            const dataB =
              b.dataPainel || "";


            if (
              dataA !== dataB
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
    // RESULTADO
    // ========================================================

    const resultado = {

      success: true,

      hoje,

      ontem,

      inicio7,

      inicio15,

      inicio30,


      // --------------------------------------------
      // HOJE
      // --------------------------------------------

      faturamentoHoje:
        soma(
          pedidosHoje
        ),

      pedidosHoje,


      // --------------------------------------------
      // PERÍODOS
      // --------------------------------------------

      periodos: {

        ontem: {

          faturamento:
            soma(
              pedidosOntem
            ),

          pedidos:
            pedidosOntem.length

        },

        ultimos7: {

          faturamento:
            soma(
              pedidos7
            ),

          pedidos:
            pedidos7.length

        },

        ultimos15: {

          faturamento:
            soma(
              pedidos15
            ),

          pedidos:
            pedidos15.length

        },

        ultimos30: {

          faturamento:
            soma(
              pedidos30
            ),

          pedidos:
            pedidos30.length

        }

      },


      // --------------------------------------------
      // MARKETPLACES
      // --------------------------------------------

      marketplaces,


      // --------------------------------------------
      // PEDIDOS
      // --------------------------------------------

      pedidos:
        pedidosProcessados,


      ultimosPedidos,


      // --------------------------------------------
      // PRODUTOS
      // --------------------------------------------

      produtos,

      totalProdutos:
        produtos.length,


      totalPedidos:
        pedidosProcessados.length,


      atualizadoEm:
        new Date().toISOString(),


      cache: false

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
