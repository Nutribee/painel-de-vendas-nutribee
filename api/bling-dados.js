<!DOCTYPE html>
<html lang="pt-BR">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Painel de Vendas Nutribee</title>

  <style>

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f5f7f6;
      color: #222;
    }

    header {
      background: #111;
      color: white;
      padding: 20px;
    }

    header h1 {
      margin: 0;
      font-size: 24px;
    }

    header p {
      margin: 6px 0 0;
      color: #ccc;
    }

    .container {
      padding: 20px;
      max-width: 1400px;
      margin: auto;
    }

    .acoes {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }

    button {
      border: 0;
      border-radius: 8px;
      padding: 12px 18px;
      cursor: pointer;
      font-weight: bold;
      font-size: 16px;
    }

    .btn-principal {
      background: #159447;
      color: white;
    }

    .btn-secundario {
      background: #ddd;
      color: #222;
    }

    .status {
      background: white;
      padding: 14px;
      border-radius: 8px;
      margin-bottom: 20px;
      border-left: 5px solid #159447;
    }

    .erro {
      border-left-color: #d93025;
      color: #b00020;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }

    .card {
      background: white;
      border-radius: 12px;
      padding: 25px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }

    .card span {
      display: block;
      color: #777;
      font-size: 16px;
      margin-bottom: 10px;
    }

    .card strong {
      font-size: 30px;
    }

    /* ==========================
       MARKETPLACES
    ========================== */

    .marketplaces-container {
      margin-bottom: 25px;
    }

    .marketplaces-container h2 {
      margin-bottom: 18px;
      font-size: 28px;
    }

    .marketplaces {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 15px;
    }

    .marketplace-card {
      background: white;
      border-radius: 12px;
      padding: 22px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      border-top: 5px solid #159447;
    }

    .marketplace-nome {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 15px;
    }

    .marketplace-faturamento {
      font-size: 27px;
      font-weight: bold;
      margin-bottom: 8px;
    }

    .marketplace-pedidos {
      color: #777;
      font-size: 15px;
    }

    .sem-marketplaces {
      background: white;
      border-radius: 12px;
      padding: 25px;
      color: #777;
      text-align: center;
    }

    /* ==========================
       TOTAL DOS MARKETPLACES
    ========================== */

    .total-marketplaces {
      background: #159447;
      color: white;
      border-radius: 12px;
      padding: 22px;
      margin-top: 18px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.10);
    }

    .total-marketplaces span {
      display: block;
      font-size: 16px;
      opacity: 0.9;
      margin-bottom: 8px;
    }

    .total-marketplaces strong {
      font-size: 30px;
    }

    @media (max-width: 600px) {

      .container {
        padding: 12px;
      }

      header h1 {
        font-size: 21px;
      }

      .card {
        padding: 20px;
      }

      .card strong {
        font-size: 25px;
      }

      .marketplaces-container h2 {
        font-size: 24px;
      }

      .marketplace-faturamento {
        font-size: 24px;
      }

      .total-marketplaces strong {
        font-size: 27px;
      }

    }

  </style>

</head>


<body>

<header>

  <h1>📊 Painel de Vendas Nutribee</h1>

  <p>
    Vendas, pedidos, produtos, custos e resultados
  </p>

</header>


<div class="container">


  <!-- ==========================
       BOTÕES
  ========================== -->

  <div class="acoes">

    <button
      class="btn-principal"
      onclick="carregarDadosBling()"
    >
      🔄 Atualizar Bling
    </button>


    <button
      class="btn-secundario"
      onclick="autorizarBling()"
    >
      🔐 Conectar Bling
    </button>

  </div>


  <!-- ==========================
       STATUS
  ========================== -->

  <div
    id="status"
    class="status"
  >
    Aguardando conexão com o Bling...
  </div>


  <!-- ==========================
       RESUMO
  ========================== -->

  <div class="cards">


    <div class="card">

      <span>
        Faturamento total
      </span>

      <strong id="faturamento">
        R$ 0,00
      </strong>

    </div>


    <div class="card">

      <span>
        Pedidos
      </span>

      <strong id="totalPedidos">
        0
      </strong>

    </div>


    <div class="card">

      <span>
        Produtos
      </span>

      <strong id="totalProdutos">
        0
      </strong>

    </div>


    <div class="card">

      <span>
        Ticket médio
      </span>

      <strong id="ticketMedio">
        R$ 0,00
      </strong>

    </div>


  </div>


  <!-- ==========================
       FATURAMENTO POR MARKETPLACE
  ========================== -->

  <div class="marketplaces-container">

    <h2>
      💰 Faturamento por marketplace
    </h2>


    <div
      id="marketplaces"
      class="marketplaces"
    >

      <div class="sem-marketplaces">
        Nenhum marketplace carregado.
      </div>

    </div>


    <!-- TOTAL -->

    <div class="total-marketplaces">

      <span>
        Faturamento total dos marketplaces
      </span>

      <strong id="totalMarketplaces">
        R$ 0,00
      </strong>

    </div>

  </div>


</div>


<script>


/* =====================================================
   CARREGAR DADOS DO BLING
===================================================== */

async function carregarDadosBling() {

  const status =
    document.getElementById("status");


  status.classList.remove("erro");


  status.innerText =
    "⏳ Buscando dados do Bling...";


  const accessToken =
    localStorage.getItem(
      "bling_access_token"
    );


  if (!accessToken) {

    status.classList.add("erro");

    status.innerText =
      "⚠️ Bling ainda não está conectado. Clique em 'Conectar Bling'.";

    return;

  }


  try {


    const resposta =
      await fetch(
        "/api/bling-dados",
        {

          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            access_token: accessToken
          })

        }
      );


    /*
      Lê primeiro como texto.
      Isso evita o erro:
      Unexpected token 'A'
    */

    const texto =
      await resposta.text();


    let dados;


    try {

      dados =
        JSON.parse(texto);

    } catch (erroJson) {

      console.error(
        "Resposta recebida do servidor:",
        texto
      );

      throw new Error(
        "O servidor não retornou JSON válido."
      );

    }


    if (
      !resposta.ok ||
      !dados.success
    ) {

      throw new Error(
        dados.error ||
        "Erro ao buscar dados do Bling."
      );

    }


    const produtos =
      Array.isArray(dados.produtos)
        ? dados.produtos
        : [];


    const pedidos =
      Array.isArray(dados.pedidos)
        ? dados.pedidos
        : [];


    const marketplaces =
      Array.isArray(dados.marketplaces)
        ? dados.marketplaces
        : [];


    atualizarPainel(
      produtos,
      pedidos
    );


    atualizarMarketplaces(
      marketplaces
    );


    status.innerText =
      `✅ Dados atualizados. ${pedidos.length} pedidos encontrados.`;


  } catch (erro) {

    console.error(erro);

    status.classList.add("erro");

    status.innerText =
      "❌ Erro ao carregar dados: " +
      erro.message;

  }

}


/* =====================================================
   ATUALIZAR RESUMO
===================================================== */

function atualizarPainel(
  produtos,
  pedidos
) {

  let faturamento = 0;


  pedidos.forEach(
    pedido => {

      const valor =
        Number(
          pedido.total || 0
        );


      faturamento += valor;

    }
  );


  const quantidadePedidos =
    pedidos.length;


  const ticketMedio =
    quantidadePedidos > 0
      ? faturamento / quantidadePedidos
      : 0;


  document.getElementById(
    "faturamento"
  ).innerText =
    formatarMoeda(
      faturamento
    );


  document.getElementById(
    "totalPedidos"
  ).innerText =
    quantidadePedidos;


  document.getElementById(
    "totalProdutos"
  ).innerText =
    produtos.length;


  document.getElementById(
    "ticketMedio"
  ).innerText =
    formatarMoeda(
      ticketMedio
    );

}


/* =====================================================
   NOMES DOS MARKETPLACES
===================================================== */

function nomeMarketplace(
  marketplace
) {

  const nomeOriginal =
    String(
      marketplace.nome || ""
    ).trim();


  const id =
    String(
      marketplace.id ||
      marketplace.canal_id ||
      marketplace.codigo ||
      ""
    ).trim();


  const texto =
    (
      nomeOriginal +
      " " +
      id
    ).toLowerCase();


  /*
    Se o Bling já mandar o nome,
    mantém o nome.
  */

  if (
    texto.includes("mercado livre") ||
    texto.includes("mercadolivre")
  ) {

    return "Mercado Livre";

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
    texto.includes("amazon")
  ) {

    return "Amazon";

  }


  /*
    IDs dos canais da Nutribee
  */

  if (id === "204824338") {

    return "Mercado Livre";

  }


  if (id === "205972730") {

    return "Shopee";

  }


  if (id === "205413635") {

    return "TikTok Shop";

  }


  if (id === "205227624") {

    return "Amazon";

  }


  return (
    nomeOriginal ||
    "Marketplace"
  );

}


/* =====================================================
   FATURAMENTO POR MARKETPLACE
===================================================== */

function atualizarMarketplaces(
  marketplaces
) {

  const container =
    document.getElementById(
      "market
