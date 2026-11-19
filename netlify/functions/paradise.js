
'use strict';

// netlify/functions/paradise.js
// Integração PIX TriboPay — Rota 22 Premiações

const API_BASE = 'https://api.tribopay.com.br/api/public/v1';

const MIN_QUANTITY = 60;
const MAX_QUANTITY = 5000;
const UNIT_PRICE_CENTS = 17;

const DISCOUNT_TIERS = [
  { quantity: 500, discountCents: 3500 },
  { quantity: 200, discountCents: 1200 },
  { quantity: 100, discountCents: 500 }
];

const REQUEST_TIMEOUT_MS = 25000;

function buildHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';

  const allowedOrigins = [
    process.env.TRIBOPAY_ALLOWED_ORIGINS,
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    'https://trucksoficial.netlify.app',
    'https://oficialrota22.netlify.app'
  ]
    .filter(Boolean)
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(Boolean);

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (!origin) {
    headers['Access-Control-Allow-Origin'] =
      allowedOrigins[0] || 'https://oficialrota22.netlify.app';
  } else if (allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function reply(event, statusCode, payload) {
  return {
    statusCode,
    headers: buildHeaders(event),
    body: payload === '' ? '' : JSON.stringify(payload)
  };
}

function readBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '{}');

  return JSON.parse(raw);
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function cleanText(value, maxLength = 300) {
  if (typeof value !== 'string') return '';

  return value
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}

function isValidCpf(value) {
  const cpf = digits(value);

  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  for (let length = 9; length <= 10; length++) {
    let sum = 0;

    for (let i = 0; i < length; i++) {
      sum += Number(cpf[i]) * (length + 1 - i);
    }

    let check = (sum * 10) % 11;

    if (check === 10) check = 0;

    if (check !== Number(cpf[length])) {
      return false;
    }
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

function makeApiUrl(path, apiToken) {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('api_token', apiToken);
  return url.toString();
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const raw = await response.text();

    let data = {};

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (_) {
      console.error('[TriboPay] Resposta não JSON:', {
        httpStatus: response.status,
        elapsedMs: Date.now() - startedAt
      });

      throw new Error(
        `A TriboPay retornou uma resposta inválida (HTTP ${response.status}).`
      );
    }

    console.log('[TriboPay] Resposta recebida:', {
      httpStatus: response.status,
      elapsedMs: Date.now() - startedAt,
      responseKeys:
        data && typeof data === 'object'
          ? Object.keys(data)
          : []
    });

    return { response, data };

  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(
        'Tempo limite excedido ao conectar à TriboPay.'
      );

      timeoutError.name = 'AbortError';
      throw timeoutError;
    }

    throw error;

  } finally {
    clearTimeout(timeout);
  }
}

function getProviderObjects(data) {
  const root = data && typeof data === 'object' ? data : {};

  const nested =
    root.data && typeof root.data === 'object'
      ? root.data
      : {};

  const transaction =
    nested.transaction && typeof nested.transaction === 'object'
      ? nested.transaction
      : (
          root.transaction && typeof root.transaction === 'object'
            ? root.transaction
            : {}
        );

  return [transaction, nested, root];
}

function firstValue(objects, paths) {
  for (const object of objects) {
    for (const path of paths) {
      let value = object;

      for (const key of path.split('.')) {
        value = value?.[key];
      }

      if (
        value !== undefined &&
        value !== null &&
        value !== ''
      ) {
        return value;
      }
    }
  }

  return undefined;
}

function providerMessage(data, fallback) {
  const objects = getProviderObjects(data);

  const value = firstValue(objects, [
    'message',
    'error.message',
    'errors.0.message',
    'detail',
    'error_description',
    'error'
  ]);

  if (typeof value === 'string' && value.trim()) {
    return value.trim().slice(0, 240);
  }

  return fallback;
}

function providerErrorCode(data) {
  const objects = getProviderObjects(data);

  const value = firstValue(objects, [
    'code',
    'error_code',
    'error.code',
    'errors.0.code'
  ]);

  return (typeof value === 'string' || typeof value === 'number')
    ? String(value).slice(0, 100)
    : '';
}

function normalizePaymentStatus(value) {
  const status = String(value ?? '').trim().toLowerCase();

  const aliases = {
    chargedback: 'chargeback',
    refused: 'failed',
    antifraud: 'failed',
    canceled: 'cancelled'
  };

  return aliases[status] || status;
}

function requiredEnvironment() {
  const apiToken = process.env.TRIBOPAY_API_TOKEN;
  const offerHash = process.env.TRIBOPAY_OFFER_HASH;
  const productHash = process.env.TRIBOPAY_PRODUCT_HASH;

  const missing = [];

  if (!apiToken) missing.push('TRIBOPAY_API_TOKEN');
  if (!offerHash) missing.push('TRIBOPAY_OFFER_HASH');
  if (!productHash) missing.push('TRIBOPAY_PRODUCT_HASH');

  return {
    apiToken,
    offerHash,
    productHash,
    missing
  };
}

// ==========================================
// CRIAR PIX
// ==========================================

async function createPix(event, config) {
  if (event.httpMethod !== 'POST') {
    return reply(event, 405, {
      status: 'error',
      error: 'Método não permitido. Use POST para criar o Pix.'
    });
  }

  let body;

  try {
    body = readBody(event);
  } catch (_) {
    return reply(event, 400, {
      status: 'error',
      error: 'Corpo da requisição inválido.'
    });
  }

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return reply(event, 400, {
      status: 'error',
      error: 'Corpo JSON inválido.'
    });
  }

  const name = cleanText(body.name, 120);
  const email = cleanText(body.email, 180).toLowerCase();
  const phone = digits(body.phone);
  const document = digits(body.document);

  const quantity = Number(body.quantity);
  const amountReais = Number(body.amount);

  if (
    !name ||
    name.length < 3 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return reply(event, 400, {
      status: 'error',
      error: 'Informe nome completo e e-mail válido.'
    });
  }

  if (!isValidCpf(document)) {
    return reply(event, 400, {
      status: 'error',
      error: 'O CPF informado é inválido.'
    });
  }

  if (!/^\d{11}$/.test(phone)) {
    return reply(event, 400, {
      status: 'error',
      error: 'Informe um telefone com DDD e 11 dígitos.'
    });
  }

  if (
    !Number.isInteger(quantity) ||
    quantity < MIN_QUANTITY ||
    quantity > MAX_QUANTITY
  ) {
    return reply(event, 400, {
      status: 'error',
      error: `A quantidade deve estar entre ${MIN_QUANTITY} e ${MAX_QUANTITY} cotas.`
    });
  }

  // O index envia o valor em REAIS.
  // Conferimos o total com a mesma regra de descontos da página.

  const amountCentsFromPage = Math.round(amountReais * 100);
  const expectedAmountCents = calculateAmountCents(quantity);

  if (
    !Number.isFinite(amountReais) ||
    amountReais <= 0 ||
    amountCentsFromPage !== expectedAmountCents
  ) {
    console.error('[TriboPay] Divergência no valor:', {
      quantity,
      amountCentsFromPage,
      expectedAmountCents
    });

    return reply(event, 400, {
      status: 'error',
      error: 'O valor do checkout não corresponde à quantidade selecionada. Atualize a página e tente novamente.'
    });
  }

  const amountCents = expectedAmountCents;

  const referenceInput = cleanText(body.reference, 80);

  const reference =
    /^[A-Za-z0-9._:-]+$/.test(referenceInput)
      ? referenceInput
      : `ROTA22-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)
          .toUpperCase()}`;

  const description =
    cleanText(body.description, 120) ||
    'Cotas Rota 22 Premiações';

  const trackingInput =
    body.tracking && typeof body.tracking === 'object'
      ? body.tracking
      : {};

  const tracking = {};

  for (const key of [
    'src',
    'utm_source',
    'utm_campaign',
    'utm_medium',
    'utm_content',
    'utm_term',
    'sck'
  ]) {
    const value = cleanText(trackingInput[key], 300);

    if (value) {
      tracking[key] = value;
    }
  }

  // Estrutura da cobrança TriboPay.

  const payload = {
    amount: amountCents,
    offer_hash: config.offerHash,
    payment_method: 'pix',

    customer: {
      name,
      email,
      phone_number: phone,
      document
    },

    cart: [
      {
        product_hash: config.productHash,
        title: description,
        price: amountCents,
        quantity: 1,
        operation_type: 1,
        tangible: false
      }
    ]
  };

  if (Object.keys(tracking).length) {
    payload.tracking = tracking;
  }

  if (process.env.TRIBOPAY_POSTBACK_URL) {
    payload.postback_url = process.env.TRIBOPAY_POSTBACK_URL;
  }

  const { response, data } = await fetchJson(
    makeApiUrl('/transactions', config.apiToken),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  const objects = getProviderObjects(data);

  if (!response.ok) {
    const apiMessage = providerMessage(
      data,
      `A TriboPay não conseguiu criar a cobrança (HTTP ${response.status}).`
    );

    console.error('[TriboPay] Falha ao criar PIX:', {
      httpStatus: response.status,
      providerCode: providerErrorCode(data),
      providerMessage: apiMessage,
      responseKeys:
        data && typeof data === 'object'
          ? Object.keys(data)
          : [],
      reference
    });

    return reply(event, 502, {
      status: 'error',
      error: apiMessage
    });
  }

  // Identificador da transação.

  const transactionHash = String(
    firstValue(objects, [
      'hash',
      'transaction_hash',
      'transactionHash',
      'transaction.hash'
    ]) ?? ''
  ).trim();

  // PIX copia e cola.

  const qrCode = String(
    firstValue(objects, [
      'pix.pix_qr_code',
      'pix.qr_code',
      'pix.pix_code',
      'pix.copy_paste',
      'pix.payload',
      'pix_qr_code',
      'qr_code',
      'pix_code'
    ]) ?? ''
  ).trim();

  // Imagem do QR Code, quando disponibilizada.

  let qrCodeBase64 = String(
    firstValue(objects, [
      'pix.qr_code_base64',
      'pix.pix_qr_code_base64',
      'qr_code_base64'
    ]) ?? ''
  ).trim();

  if (
    qrCodeBase64 &&
    !qrCodeBase64.startsWith('data:image/')
  ) {
    qrCodeBase64 = `data:image/png;base64,${qrCodeBase64}`;
  }

  const expiresAt = String(
    firstValue(objects, [
      'pix.expiration_date',
      'pix.expires_at',
      'expiration_date',
      'expires_at'
    ]) ?? ''
  );

  const apiStatus = String(
    firstValue(objects, ['status', 'payment_status']) ?? ''
  ).toLowerCase();

  if (
    apiStatus === 'error' ||
    apiStatus === 'failed' ||
    apiStatus === 'refused'
  ) {
    return reply(event, 502, {
      status: 'error',
      error: providerMessage(
        data,
        'A TriboPay recusou a criação do PIX.'
      )
    });
  }

  if (
    !transactionHash ||
    transactionHash.length > 160 ||
    !/^[A-Za-z0-9._:-]+$/.test(transactionHash) ||
    !qrCode
  ) {
    console.error('[TriboPay] Resposta sem hash ou código PIX:', {
      httpStatus: response.status,
      responseKeys:
        data && typeof data === 'object'
          ? Object.keys(data)
          : [],
      transactionHashPresent: Boolean(transactionHash),
      qrCodePresent: Boolean(qrCode),
      base64Present: Boolean(qrCodeBase64),
      reference
    });

    return reply(event, 502, {
      status: 'error',
      error: 'A TriboPay respondeu, mas não retornou o identificador da transação ou o código PIX. Confira os logs da função no Netlify.'
    });
  }

  console.log('[TriboPay] PIX criado:', {
    transactionHash,
    quantity,
    amountCents,
    hasQrCodeBase64: Boolean(qrCodeBase64),
    reference
  });

  // Mantém o mesmo formato que o front-end atual espera.

  return reply(event, 200, {
    status: 'success',
    transaction_id: transactionHash,
    id: transactionHash,
    reference,
    qr_code: qrCode,
    qr_code_base64: qrCodeBase64,
    expires_at: expiresAt,
    quantity,
    amount_cents: amountCents,
    amount_reais: amountCents / 100,
    amount_reais_formatted: formatBrazilianAmount(amountCents)
  });
}

// ==========================================
// CONSULTAR STATUS DO PIX
// ==========================================

async function queryPix(event, config) {
  if (event.httpMethod !== 'GET') {
    return reply(event, 405, {
      status: 'error',
      error: 'Método não permitido. Use GET para consultar o Pix.'
    });
  }

  const transactionHash = String(
    event.queryStringParameters?.id ?? ''
  ).trim();

  if (
    !transactionHash ||
    transactionHash.length > 160 ||
    !/^[A-Za-z0-9._:-]+$/.test(transactionHash)
  ) {
    return reply(event, 400, {
      status: 'error',
      error: 'Informe um identificador válido da transação TriboPay.'
    });
  }

  const { response, data } = await fetchJson(
    makeApiUrl(
      `/transactions/${encodeURIComponent(transactionHash)}`,
      config.apiToken
    ),
    {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    console.error('[TriboPay] Falha na consulta:', {
      httpStatus: response.status,
      providerCode: providerErrorCode(data),
      providerMessage: providerMessage(data, ''),
      transactionHash
    });

    return reply(event, 502, {
      status: 'error',
      error: providerMessage(
        data,
        `Não foi possível consultar o pagamento (HTTP ${response.status}).`
      )
    });
  }

  const objects = getProviderObjects(data);

  const rawStatus = firstValue(objects, [
    'payment_status',
    'status',
    'transaction.payment_status',
    'transaction.status'
  ]);

  const status = normalizePaymentStatus(rawStatus);

  if (!status) {
    return reply(event, 502, {
      status: 'error',
      error: 'A TriboPay não retornou o status da transação.'
    });
  }

  return reply(event, 200, {
    status,
    transaction_id: String(
      firstValue(objects, ['hash', 'transaction_hash']) ??
      transactionHash
    ),
    reference: String(
      firstValue(objects, ['reference', 'external_id']) ?? ''
    )
  });
}

// ==========================================
// FUNÇÃO PRINCIPAL NETLIFY
// ==========================================

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return reply(event, 204, '');
  }

  const action = String(
    event.queryStringParameters?.action ?? ''
  ).toLowerCase();

  const config = requiredEnvironment();

  if (config.missing.length) {
    return reply(event, 500, {
      status: 'error',
      error: `Configure no Netlify: ${config.missing.join(', ')}.`
    });
  }

  try {
    if (action === 'create') {
      return await createPix(event, config);
    }

    if (action === 'query') {
      return await queryPix(event, config);
    }

    return reply(event, 400, {
      status: 'error',
      error: 'Ação inválida. Use ?action=create ou ?action=query.'
    });

  } catch (error) {
    const isTimeout = error?.name === 'AbortError';

    console.error('[TriboPay] Erro interno:', {
      name: error?.name || 'Error',
      message: error?.message || 'Falha desconhecida',
      stack: typeof error?.stack === 'string'
        ? error.stack.split('\n').slice(0, 8).join('\n')
        : ''
    });

    return reply(
      event,
      isTimeout ? 504 : 500,
      {
        status: 'error',
        error: isTimeout
          ? 'Tempo limite excedido ao conectar à TriboPay (25 segundos). Consulte os logs da função no Netlify.'
          : 'Falha interna ao processar o PIX. Consulte os logs da função no Netlify.'
      }
    );
  }
};
