import type { DependenciasDoCardapio, DependenciasDoCardapioPublico } from '@cardapio/aplicacao';
import {
  criarCacheDoCardapio,
  criarFonteDoCardapioPublico,
  criarRepositorioDoCardapio,
  type AcessoAoBanco,
  type ArmazenamentoS3,
  type criarRedis,
} from '@cardapio/infraestrutura';

export function comporCardapio(
  banco: AcessoAoBanco,
  redis: ReturnType<typeof criarRedis>,
  armazenamento: ArmazenamentoS3,
): DependenciasDoCardapio & DependenciasDoCardapioPublico {
  return {
    cardapio: criarRepositorioDoCardapio(banco),
    fonte: criarFonteDoCardapioPublico(banco),
    cache: criarCacheDoCardapio(redis),
    relogio: { agora: () => new Date() },
    enderecos: armazenamento,
  };
}
