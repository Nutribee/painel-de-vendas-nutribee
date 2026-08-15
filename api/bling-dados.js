// ============================================================
// PAINEL DE VENDAS NUTRIBEE
// BLING API V3
// VERSÃO COMPLETA
// ============================================================

const BASE_URL =
  "https://api.bling.com.br/Api/v3";

const CACHE_TTL =
  60 * 1000;

const LIMITE =
  100;

const MAX_PAGINAS =
  300;

// Bling: máximo de 3 requisições/segundo.
// 380 ms deixa uma margem de segurança.
const INTERVALO_API =
  380;


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
        error: "Access token não informado."
      });

    }


    // ========================================================
    // CACHE
    // ========================================================

    const cacheKey =
      access_token.slice(-32);

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
    // CONTROLE DE VELOCIDADE
    // ========================================================

    let ultimaRequisicao = 0;


    function esperar(ms) {

      return new Promise(
        resolve =>
          setTimeout(resolve, ms)
      );

    }


    async function controlarAPI() {

      const agora =
        Date.now();

      const espera =
        INTERVALO_API -
        (agora - ultimaRequisicao);


      if (espera > 0) {

        await esperar(espera);

      }


      ultimaRequisicao =
        Date.now();

    }


    // ========================================================
    // REQUISIÇÃO BLING
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
              method: "GET",
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
            error: texto
          };

        }


        // ----------------------------------------------------
        // TOKEN
        // ----------------------------------------------------

        if (
          resposta.status === 401
        ) {

          return {
            ok: false,
            status: 401,
            data: {
              error:
                "Access token inválido ou expirado."
            }
          };

        }


        // ----------------------------------------------------
        // LIMITE
        // ----------------------------------------------------

        if (
          resposta.status === 429
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

              : 2500 * tentativa;


          await esperar(
            tempo
          );


          return buscarBling(
            url,
            tentativa + 1
          );

        }


        if (
          !resposta.ok
        ) {

          return {
            ok: false,
            status: resposta.status,
            data: dados
          };

        }


        return {
          ok: true,
          status: resposta.status,
          data: dados
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
          1500 * tentativa
        );


        return buscarBling(
          url,
          tentativa + 1
        );

      }

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


    function diminuirDias(
      dataTexto,
      dias
    ) {

      const partes =
        dataTexto.split("-");


      const data =
        new Date(
          Number(partes[0]),
          Number(partes[1]) - 1,
          Number(partes[2]),
          12
        );


      data.setDate(
        data.getDate() - dias
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
    // PAGINAR PEDIDOS
    // ========================================================

    async function buscarPedidos() {

      const pedidos =
        [];

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


        const url =
          `${BASE_URL}/pedidos/vendas?${params.toString()}`;


        const resposta =
          await buscarBling(
            url
          );


        if (!resposta.ok) {

          throw new Error(
            obterMensagemErro(
              resposta.data,
              resposta.status
            )
          );

        }


        const lista =
          Array.isArray(
            resposta.data?.data
          )
            ? resposta.data.data
            : [];


        pedidos.push(
          ...lista
        );


        // Se veio menos que 100,
        // acabou a paginação.

        if (
          lista.length < LIMITE
        ) {

          break;

        }

      }


      // Remove duplicados.

      const mapa =
        new Map();


      for (
        const pedido of pedidos
      ) {

        const id =
          pedido?.id ||
          pedido?.numero;


        if (id !== undefined) {

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
    // ERRO
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


      return `Erro do Bling. HTTP ${status}`;

    }


    // ========================================================
    // NORMALIZAR DATA
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
        String(valor).trim();


      if (!texto) {

        return "";

      }


      // YYYY-MM-DD

      const iso =
        texto.match(
          /^(\d{4})-(\d{2})-(\d{2})/
        );


      if (iso) {

        return (
          `${iso[1]}-${iso[2]}-${iso[3]}`
        );

      }


      // DD/MM/YYYY

      const br =
        texto.match(
          /^(\d{2})[\/-](\d{2})[\/-](\d{4})/
        );


      if (br) {

        return (
          `${br[3]}-${br[2]}-${br[1]}`
        );

      }


      return "";

    }


    function dataPedido(
      pedido
    ) {

      const campos = [

        pedido?.data,

        pedido?.dataEmissao,

        pedido?.dataPedido,

        pedido?.dataVenda,

        pedido?.dataInclusao

      ];


      for (
        const campo of campos
      ) {

        const data =
          normalizarData(
            campo
          );


        if (data) {

          return data;

        }

      }


      return "";

    }


    // ========================================================
    // VALOR
    // ========================================================

    function valorPedido(
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
          typeof valor ===
          "number" &&
          Number.isFinite(valor)
        ) {

          return valor;

        }


        if (
          typeof valor ===
          "string"
        ) {

          const numero =
            Number(
              valor.replace(
                ",",
                "."
              )
            );


          if (
            Number.isFinite(numero)
          ) {

            return numero;

          }

        }

      }


      return 0;

    }


    // ========================================================
    // DESCOBRIR ID DA LOJA/CANAL
    // ========================================================

    function idLoja(
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
          String(id).trim() !== ""
        ) {

          return String(id);

        }

      }


      return "";

    }


    // ========================================================
    // NOME DA LOJA JÁ VINDO NO PEDIDO
    // ========================================================

    function nomeLojaPedido(
      pedido
    ) {

      const nomes = [

        pedido?.loja?.nome,

        pedido?.loja?.descricao,

        pedido?.canalVenda?.nome,

        pedido?.canalVenda?.descricao,

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

      if (!nome) {

        return "";

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
        texto.includes("mercado livre") ||
        texto.includes("mercadolivre") ||
        texto.includes("mercadolibre") ||
        texto === "meli"
      ) {

        return "Mercado Livre";

      }


      if (
        texto.includes("amazon")
      ) {

        return "Amazon";

      }


      if (
        texto.includes("shopee")
      ) {

        return "Shopee";

      }


      if (
        texto.includes("tiktok")
      ) {

        return "TikTok Shop";

      }


      if (
        texto.includes("magalu") ||
        texto.includes("magazine luiza")
      ) {

        return "Magalu";

      }


      if (
        texto.includes("nuvemshop")
      ) {

        return "Nuvemshop";

      }


      if (
        texto.includes("temu")
      ) {

        return "Temu";

      }


      return nome.trim();

    }


    // ========================================================
    // DESCOBRIR NOME DO CANAL NO BLING
    // ========================================================

    async function descobrirCanal(
      pedido
    ) {

      const nomeDireto =
        nomeLojaPedido(
          pedido
        );


      if (
        nomeDireto
      ) {

        return normalizarMarketplace(
          nomeDireto
        );

      }


      const id =
        idLoja(
          pedido
        );


      if (!id) {

        return "Outros";

      }


      // Cache do canal.

      if (
        cacheCanais.has(id)
      ) {

        return cacheCanais.get(id);

      }


      const url =
        `${BASE_URL}/canais-venda/${encodeURIComponent(id)}`;


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

            const resultado =
              normalizarMarketplace(
                nome
              );


            cacheCanais.set(
              id,
              resultado
            );


            return resultado;

          }

        }

      }


      // Nunca mostra somente o número.
      // Se não conseguirmos o nome,
      // identificamos o canal pelo ID.

      const fallback =
        `Canal ${id}`;


      cacheCanais.set(
        id,
        fallback
      );


      return fallback;

    }


    // ========================================================
    // PEDIDOS
    // ========================================================

    const pedidos =
      await buscarPedidos();


    // ========================================================
    // MARKETPLACE
    // ========================================================

    const pedidosProcessados =
      [];


    for (
      const pedido of pedidos
    ) {

      const marketplace =
        await descobrirCanal(
          pedido
        );


      pedidosProcessados.push({

        ...pedido,

        marketplace,

        origem:
          marketplace,

        total:
          valorPedido(
            pedido
          ),

        dataNormalizada:
          dataPedido(
            pedido
          )

      });

    }


    // ========================================================
    // RESUMO DE HOJE
    // ========================================================

    const pedidosHoje =
      pedidosProcessados.filter(
        pedido =>
          pedido.dataNormalizada ===
          hoje
      );


    const faturamentoHoje =
      pedidosHoje.reduce(
        (
          soma,
          pedido
        ) =>
          soma +
          Number(
            pedido.total || 0
          ),
        0
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
              pedido.dataNormalizada;


            if (!data) {

              return false;

            }


            return (
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
                pedido.total || 0
              ),
            0
          ),

        pedidos:
          lista.length

      };

    }


    const pedidosOntem =
      pedidosProcessados.filter(
        pedido =>
          pedido.dataNormalizada ===
          ontem
      );


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
                pedido.total || 0
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

    const mapa =
      new Map();


    for (
      const pedido of pedidosProcessados
    ) {

      const nome =
        pedido.marketplace ||
        "Outros";


      if (
        !mapa.has(nome)
      ) {

        mapa.set(
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
        mapa.get(nome);


      item.faturamento +=
        Number(
          pedido.total || 0
        );


      item.pedidos += 1;

    }


    const marketplaces =
      Array.from(
        mapa.values()
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
          ) =>
            String(
              b.dataNormalizada || ""
            ).localeCompare(
              String(
                a.dataNormalizada || ""
              )
            )
        )
        .slice(
          0,
          50
        )
        .map(
          pedido => ({

            id:
              pedido?.id ||
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
                pedido.total || 0
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
    // RESULTADO
    // ========================================================

    const resultado = {

      success: true,

      hoje,

      pedidos:
        pedidosProcessados,

      pedidosHoje,

      faturamentoHoje,

      totalPedidos:
        pedidosProcessados.length,

      totalProdutos:
        produtos.length,

      produtos,

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


    return res.status(200).json(
      resultado
    );


  } catch (erro) {

    console.error(
      "ERRO BLING:",
      erro
    );


    return res.status(500).json({

      success:
        false,

      error:
        erro?.message ||
        "Erro interno ao consultar o Bling."

    });

  }

}
