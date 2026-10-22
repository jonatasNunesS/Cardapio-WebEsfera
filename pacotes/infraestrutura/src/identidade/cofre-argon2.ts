import type { CofreDeSenhas } from '@cardapio/aplicacao';
import { hash, verify } from '@node-rs/argon2';

export const PARAMETROS_ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

const SENHA_DA_SIMULACAO = 'senha-da-simulacao-de-tempo-constante';

export function criarCofreArgon2(): CofreDeSenhas {
  let hashDaSimulacao: Promise<string> | undefined;
  return {
    resumir: (senha) => hash(senha, PARAMETROS_ARGON2),
    async conferir(hashGuardado, senha) {
      if (hashGuardado === null) {
        hashDaSimulacao ??= hash(SENHA_DA_SIMULACAO, PARAMETROS_ARGON2);
        await verify(await hashDaSimulacao, senha);
        return false;
      }
      return verify(hashGuardado, senha);
    },
  };
}
