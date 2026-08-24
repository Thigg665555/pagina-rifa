// netlify/functions/paradise.js
//
// Mantém o mesmo nome de arquivo e o mesmo endpoint que o Paradise usava
// (/.netlify/functions/paradise?action=create e ?action=query), mas por
// dentro agora fala com a API da TriboPay. Assim NÃO precisa mexer em nada
// no index.html nem no checkout.html — eles continuam chamando exatamente
// como já chamavam.

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const action = event.queryStringParameters?.action;
  const apiToken = process.env.TRIBOPAY_API_TOKEN;
  const offerHash = process.env.TRIBOPAY_OFFER_HASH; // ex: axgxz
  const productHash = process.env.TRIBOPAY_PRODUCT_HASH; // ex: 6nq5blzeb3

  if (!apiToken || !offerHash || !productHash) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ status: 'error', error: 'TRIBOPAY_API_TOKEN / TRIBOPAY_OFFER_HASH / TRIBOPAY_PRODUCT_HASH não configurados no Netlify.' }),
    };
  }

  try {
    // ---------- Criar a cobrança PIX (equivalente ao antigo action=create) ----------
    if (action === 'create') {
      if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ status: 'error', error: 'Método não permitido' }) };
      }

      const body = JSON.parse(event.body || '{}');
      const { name, email, phone, document, amount, description, reference, tracking } = body;

      if (!name || !email || !document || !amount) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ status: 'error', error: 'Dados obrigatórios faltando (name, email, document, amount).' }),
        };
      }

      // O front-end manda o valor em REAIS (ex: 8.5) — a TriboPay quer em centavos.
      const amountCentavos = Math.round(Number(amount) * 100);
      if (!Number.isFinite(amountCentavos) || amountCentavos <= 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ status: 'error', error: 'Valor inválido.' }) };
      }

      // Formato confirmado com o suporte da TriboPay: os campos de rastreamento
      // vão dentro de um objeto "tracking".
      const payload = {
        amount: amountCentavos,
        offer_hash: offerHash,
        payment_method: 'pix',
        tracking: {
          src: tracking?.src || undefined,
          utm_source: tracking?.utm_source || undefined,
          utm_campaign: tracking?.utm_campaign || undefined,
          utm_medium: tracking?.utm_medium || undefined,
          utm_content: tracking?.utm_content || undefined,
          utm_term: tracking?.utm_term || undefined,
        },
        customer: {
          name,
          email,
          phone_number: phone,
          document,
        },
        cart: [
          {
            product_hash: productHash,
            title: description || 'Cotas',
            price: amountCentavos,
            quantity: 1,
            operation_type: 1,
            tangible: false,
          },
        ],
      };

      const url = `https://api.tribopay.com.br/api/public/v1/transactions?api_token=${apiToken}`;

      // Logs separados (payload enviado vs. resposta) — já aprendemos que isso
      // é essencial pra diagnosticar rápido se algo não bater.
      console.log('Payload enviado para a TriboPay:', JSON.stringify(payload));

      const resposta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });

      const dados = await resposta.json();
      console.log('Resposta da TriboPay:', JSON.stringify(dados));

      if (!resposta.ok) {
        return {
          statusCode: resposta.status,
          headers,
          body: JSON.stringify({ status: 'error', error: dados.message || 'Falha ao gerar PIX na TriboPay', detalhes: dados }),
        };
      }

      // ⚠️ CONFIRME: o amount cobrado bateu com o que você esperava (amountCentavos)?
      // A oferta foi criada com um valor placeholder — ainda não testamos se a
      // TriboPay aceita um valor diferente do cadastrado na oferta.
      console.log(`Conferência de valor: enviamos ${amountCentavos} centavos, oferta retornou amount=${dados.amount}`);

      // Adapta a resposta da TriboPay pro formato que index.html/checkout.html
      // já esperam do Paradise (status/transaction_id/qr_code/qr_code_base64).
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'success',
          transaction_id: dados.hash || dados.transaction_hash,
          qr_code: dados.pix?.pix_qr_code || dados.pix?.qr_code || '',
          qr_code_base64: dados.pix?.qr_code_base64
            ? (String(dados.pix.qr_code_base64).startsWith('data:image')
                ? dados.pix.qr_code_base64
                : `data:image/png;base64,${dados.pix.qr_code_base64}`)
            : '',
          expires_at: dados.pix?.expiration_date || '',
        }),
      };
    }

    // ---------- Consultar status (equivalente ao antigo action=query) ----------
    if (action === 'query') {
      const hash = event.queryStringParameters?.id;
      if (!hash) {
        return { statusCode: 400, headers, body: JSON.stringify({ status: 'error', error: 'Informe o id da transação (?id=...)' }) };
      }

      const url = `https://api.tribopay.com.br/api/public/v1/transactions/${hash}?api_token=${apiToken}`;
      const resposta = await fetch(url);
      const dados = await resposta.json();

      // checkout.html já aceita 'paid' na lista de status de sucesso, então
      // basta repassar o payment_status da TriboPay direto.
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: dados.payment_status || dados.status || '' }),
      };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ status: 'error', error: 'Ação inválida (use ?action=create ou ?action=query).' }) };
  } catch (erro) {
    console.error(erro);
    return { statusCode: 500, headers, body: JSON.stringify({ status: 'error', error: 'Erro interno: ' + erro.message }) };
  }
};
