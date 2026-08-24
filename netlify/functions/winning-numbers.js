// netlify/functions/winning-numbers.js
// Devolve a lista de "ganhadores" mostrados na seção Cotas Premiadas.
// Por enquanto são nomes de exemplo (prova social) — quando você tiver
// ganhadores reais, é só editar o array `ganhadoresExemplo` abaixo com
// os números e nomes de verdade.

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

  // Números escolhidos do mesmo conjunto de 10 usado na página
  // (0000000, 1111111, ... 9999999) — o front-end já cuida de embaralhar
  // a ordem de exibição e de completar o resto com "Disponível".
  const ganhadoresExemplo = [
    { number: '0000000', amount: 'R$ 5.000', winner: { firstname: 'Carlos', lastname: 'Andrade' } },
    { number: '3333333', amount: 'R$ 5.000', winner: { firstname: 'Juliana', lastname: 'Ferreira' } },
    { number: '6666666', amount: 'R$ 5.000', winner: { firstname: 'Marcos', lastname: 'Vieira' } },
    { number: '9999999', amount: 'R$ 5.000', winner: { firstname: 'Patrícia', lastname: 'Gomes' } },
  ];

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ data: ganhadoresExemplo }),
  };
};
