import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { CODIGOS, ErroEstadoInconsistente, type Cifra } from '@cardapio/aplicacao';

const VERSAO = 'v1';
const ALGORITMO = 'aes-256-gcm';
const BYTES_DA_CHAVE = 32;
const BYTES_DO_IV = 12;

function falhaDeDecifrar(causa?: unknown): ErroEstadoInconsistente {
  return new ErroEstadoInconsistente(
    CODIGOS.SEGREDO_DECIFRAR_FALHOU,
    'Não foi possível decifrar um segredo guardado',
    { modulo: 'admin', casoDeUso: 'decifrar' },
    causa,
  );
}

export function lerChaveDeCifra(base64: string): Buffer {
  const chave = Buffer.from(base64, 'base64');
  if (chave.length !== BYTES_DA_CHAVE) {
    throw new ErroEstadoInconsistente(
      CODIGOS.SEGREDO_CHAVE_INVALIDA,
      'A chave de cifra precisa ter 32 bytes',
      {
        modulo: 'admin',
        casoDeUso: 'configurarCifra',
      },
    );
  }
  return chave;
}

export function criarCifraAesGcm(chave: Buffer): Cifra {
  return {
    cifrar(texto) {
      const iv = randomBytes(BYTES_DO_IV);
      const cifrador = createCipheriv(ALGORITMO, chave, iv);
      const cifrado = Buffer.concat([cifrador.update(texto, 'utf8'), cifrador.final()]);
      return [VERSAO, iv, cifrador.getAuthTag(), cifrado]
        .map((parte) => (typeof parte === 'string' ? parte : parte.toString('base64url')))
        .join('.');
    },
    decifrar(guardado) {
      const [versao, iv = '', etiqueta = '', cifrado = ''] = guardado.split('.');
      if (versao !== VERSAO) {
        throw falhaDeDecifrar();
      }
      try {
        const decifrador = createDecipheriv(ALGORITMO, chave, Buffer.from(iv, 'base64url'));
        decifrador.setAuthTag(Buffer.from(etiqueta, 'base64url'));
        return Buffer.concat([
          decifrador.update(Buffer.from(cifrado, 'base64url')),
          decifrador.final(),
        ]).toString('utf8');
      } catch (erro) {
        throw falhaDeDecifrar(erro);
      }
    },
  };
}
