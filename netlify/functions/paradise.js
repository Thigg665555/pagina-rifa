// netlify/functions/paradise.js
// Integração server-to-server com a API PIX da Paradise.
// A chave e os hashes ficam nas variáveis de ambiente do Netlify, nunca no browser.

const API_BASE = 'https://oferta-processamento.org.ua/api/v1';
const MIN_QUANTITY = 60;
const MAX_QUANTITY = 5000;
const UNIT_PRICE_CENTS = 17; // R$ 0,17 por cota, conforme o index atual.
const DISCOUNT_TIERS = [
  { quantity: 500, discountCents: 3500 }, // R$ 35,00 a cada bloco de 500
  { quantity: 200, discountCents: 1200 }, // R$ 12,00 a cada bloco de 200
  { quantity: 100, discountCents: 500 }   // R$ 5,00 a cada bloco de 100
];

function buildHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const configuredOrigins = [
    process.env.PARADISE_ALLOWED_ORIGINS,
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    'https://trucksoficial.netlify.app'
  ].filter(Boolean).flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  if (!origin) {
    headers['Access-Control-Allow-Origin'] = configuredOrigins[0] || 'https://trucksoficial.netlify.app';
  } else if (configuredOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function reply(event, statusCode, payload) {
  return { statusCode, headers: buildHeaders(event), body: payload === '' ? '' : JSON.stringify(payload) };
}

function readBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '{}');
  return JSON.parse(raw);
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidCpf(value) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== Number(cpf[length])) return false;
  }
  return true;
}

function calculateAmountCents(quantity) {
  let remaining = quantity;
  let discountCents = 0;
  for (const tier of DISCOUNT_TIERS) {
    const bundles = Math.floor(remaining / tier.quantity);
    if (bundles > 0) {
      discountCents += bundles * tier.discountCents;
      remaining -= bundles * tier.quantity;
    }
  }
  return quantity * UNIT_PRICE_CENTS - discountCents;
}

function formatBrazilianAmount(cents) {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function cleanOptional(value, maxLength = 300) {
  if (typeof value !== 'string') return undefined;
  const result = value.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, maxLength);
  return result || undefined;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : {}; }
    catch (_) { throw new Error('A Paradise retornou uma resposta que não é JSON válido.'); }
    return { response, data };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Tempo limite excedido ao conectar à Paradise.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getSafeProviderMessage(data, fallback) {
  const message = typeof data?.message === 'string' ? data.message.trim() : '';
  return message ? message.slice(0, 240) : fallback;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(event, 204, '');

  const action = event.queryStringParameters?.action;
  const apiKey = process.env.PARADISE_API_KEY;
  if (!apiKey) {
    return reply(event, 500, { status: 'error', error: 'Configure PARADISE_API_KEY nas variáveis de ambiente do Netlify.' });
  }

  try {
    if (action === 'create') {
      if (event.httpMethod !== 'POST') {
        return reply(event, 405, { status: 'error', error: 'Método não permitido. Use POST para criar o Pix.' });
      }

      const productHash = process.env.PARADISE_PRODUCT_HASH;
      const offerLink = process.env.PARADISE_OFFER_LINK;
      if (!productHash || !offerLink) {
        return reply(event, 500, { status: 'error', error: 'Configure PARADISE_PRODUCT_HASH e PARADISE_OFFER_LINK no Netlify.' });
      }

      let body;
      try { body = readBody(event); }
      catch (_) { return reply(event, 400, { status: 'error', error: 'Corpo da requisição inválido.' }); }

      const name = cleanOptional(body.name, 120);
      const email = cleanOptional(body.email, 180)?.toLowerCase();
      const phone = digits(body.phone);
      const document = digits(body.document);
      const quantity = Number(body.quantity);

      if (!name || name.length < 3 || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return reply(event, 400, { status: 'error', error: 'Informe nome completo e e-mail válido.' });
      }
      if (!isValidCpf(document)) {
        return reply(event, 400, { status: 'error', error: 'O CPF informado é inválido.' });
      }
      if (!/^\d{11}$/.test(phone)) {
        return reply(event, 400, { status: 'error', error: 'Informe um telefone com DDD e 11 dígitos.' });
      }
      if (!Number.isInteger(quantity) || quantity < MIN_QUANTITY || quantity > MAX_QUANTITY) {
        return reply(event, 400, { status: 'error', error: `A quantidade deve estar entre ${MIN_QUANTITY} e ${MAX_QUANTITY} cotas.` });
      }

      const amountCents = calculateAmountCents(quantity);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
        return reply(event, 400, { status: 'error', error: 'O valor calculado para esta compra é inválido.' });
      }

      const rawReference = cleanOptional(body.reference, 80);
      const reference = rawReference && /^[A-Za-z0-9._:-]+$/.test(rawReference)
        ? rawReference
        : `ROTA22-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
      const description = cleanOptional(body.description, 120) || 'Cotas Rota 22 Premiações';
      const trackingIn = body.tracking && typeof body.tracking === 'object' ? body.tracking : {};
      const tracking = {};
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'sck']) {
        const value = cleanOptional(trackingIn[key], 300);
        if (value) tracking[key] = value;
      }

      const payload = {
        amount: amountCents,
        description,
        reference,
        productHash,
        offer_link: offerLink,
        customer: { name, email, document, phone }
      };
      if (Object.keys(tracking).length) payload.tracking = tracking;

      const { response, data } = await fetchJson(`${API_BASE}/transaction.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok || data.status !== 'success') {
        console.error('[Paradise] Falha na criação do Pix. HTTP:', response.status, 'Referência:', reference);
        return reply(event, 502, {
          status: 'error',
          error: getSafeProviderMessage(data, `A Paradise não conseguiu criar a cobrança (HTTP ${response.status}).`)
        });
      }

      const transactionId = Number(data.transaction_id);
      const qrCode = typeof data.qr_code === 'string' ? data.qr_code.trim() : '';
      let qrCodeBase64 = typeof data.qr_code_base64 === 'string' ? data.qr_code_base64.trim() : '';
      if (qrCodeBase64 && !qrCodeBase64.startsWith('data:image/')) {
        qrCodeBase64 = `data:image/png;base64,${qrCodeBase64}`;
      }

      if (!Number.isSafeInteger(transactionId) || transactionId <= 0 || !qrCode) {
        console.error('[Paradise] Resposta incompleta na criação. HTTP:', response.status, 'Referência:', reference);
        return reply(event, 502, { status: 'error', error: 'A Paradise retornou uma cobrança sem ID numérico ou sem código Pix.' });
      }

      return reply(event, 200, {
        status: 'success',
        transaction_id: transactionId,
        id: data.id || reference,
        reference,
        qr_code: qrCode,
        qr_code_base64: qrCodeBase64,
        expires_at: data.expires_at || '',
        quantity,
        amount_cents: amountCents,
        amount_reais: amountCents / 100,
        amount_reais_formatted: formatBrazilianAmount(amountCents)
      });
    }

    if (action === 'query') {
      if (event.httpMethod !== 'GET') {
        return reply(event, 405, { status: 'error', error: 'Método não permitido. Use GET para consultar o Pix.' });
      }

      const transactionId = String(event.queryStringParameters?.id || '').trim();
      if (!/^\d+$/.test(transactionId) || Number(transactionId) <= 0) {
        return reply(event, 400, { status: 'error', error: 'Informe o ID numérico da transação Paradise.' });
      }

      const queryUrl = new URL(`${API_BASE}/query.php`);
      queryUrl.searchParams.set('action', 'get_transaction');
      queryUrl.searchParams.set('id', transactionId);
      const { response, data } = await fetchJson(queryUrl.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json', 'X-API-Key': apiKey }
      });

      if (!response.ok) {
        console.error('[Paradise] Falha na consulta. HTTP:', response.status, 'ID:', transactionId);
        return reply(event, 502, { status: 'error', error: getSafeProviderMessage(data, `Não foi possível consultar o pagamento (HTTP ${response.status}).`) });
      }

      const status = String(data.status || data.transaction?.status || '').trim().toLowerCase();
      if (!status) {
        return reply(event, 502, { status: 'error', error: 'A Paradise não retornou o status da transação.' });
      }

      return reply(event, 200, {
        status,
        transaction_id: Number(data.id) || Number(transactionId),
        reference: data.external_id || ''
      });
    }

    return reply(event, 400, { status: 'error', error: 'Ação inválida. Use ?action=create ou ?action=query.' });
  } catch (error) {
    console.error('[Paradise] Erro interno:', error?.name || 'Error', error?.message || 'Falha desconhecida');
    const message = error?.message === 'Tempo limite excedido ao conectar à Paradise.'
      ? error.message
      : 'Falha interna ao processar o Pix. Verifique os logs da função no Netlify.';
    return reply(event, 500, { status: 'error', error: message });
  }
};
