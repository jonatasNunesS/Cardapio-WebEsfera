import { CODIGOS, ErroAplicacao } from '@cardapio/aplicacao';

const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PADRAO_SEGMENTO = /^[A-Za-z0-9_-]{1,64}$/;

function invalida(nome: string): ErroAplicacao {
  return new ErroAplicacao(CODIGOS.REDIS_CHAVE_INVALIDA, `Valor inválido para ${nome} na chave do Redis`, {
    modulo: 'redis',
    casoDeUso: 'montarChave',
  });
}

function exigir(valor: string, padrao: RegExp, nome: string): string {
  if (!padrao.test(valor)) {
    throw invalida(nome);
  }
  return valor;
}

const restaurante = (restauranteId: string) => `r:${exigir(restauranteId, PADRAO_UUID, 'restauranteId')}`;

export const chavesRedis = {
  cardapio: (restauranteId: string, versao: number) => {
    if (!Number.isInteger(versao) || versao < 0) {
      throw invalida('versao');
    }
    return `${restaurante(restauranteId)}:cardapio:v${String(versao)}`;
  },
  personalizacao: (restauranteId: string) => `${restaurante(restauranteId)}:personalizacao`,
  assinatura: (restauranteId: string) => `${restaurante(restauranteId)}:assinatura`,
  mesaPorCodigo: (codigo: string) => `qr:${exigir(codigo, /^[A-Za-z0-9_-]{22}$/, 'codigo')}`,
  limite: (escopo: string, chave: string) =>
    `limite:${exigir(escopo, PADRAO_SEGMENTO, 'escopo')}:${exigir(chave, PADRAO_SEGMENTO, 'chave')}`,
} as const;
