import type { DependenciasDoCardapio, DependenciasDoCardapioPublico } from '@cardapio/aplicacao';
import {
  criarCacheDoCardapio,
  criarFonteDoCardapioPublico,
  criarRepositorioDoCardapio,
  type AcessoAoBanco,
  type criarRedis,
} from '@cardapio/infraestrutura';

export function comporCardapio(
  banco: AcessoAoBanco,
  redis: ReturnType<typeof criarRedis>,
): DependenciasDoCardapio & DependenciasDoCardapioPublico {
  return {
    cardapio: criarRepositorioDoCardapio(banco),
    fonte: criarFonteDoCardapioPublico(banco),
    cache: criarCacheDoCardapio(redis),
    relogio: { agora: () => new Date() },
  };
}
