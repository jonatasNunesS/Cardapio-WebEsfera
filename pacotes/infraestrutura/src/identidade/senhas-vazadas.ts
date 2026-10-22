import { readFileSync } from 'node:fs';
import type { ListaDeSenhasVazadas } from '@cardapio/aplicacao';

export function carregarSenhasVazadas(
  arquivo: URL = new URL('./senhas-vazadas.txt', import.meta.url),
): ListaDeSenhasVazadas {
  const senhas = new Set(
    readFileSync(arquivo, 'utf8')
      .split('\n')
      .filter((linha) => linha !== ''),
  );
  return { contem: (senha) => senhas.has(senha.toLowerCase()) };
}
