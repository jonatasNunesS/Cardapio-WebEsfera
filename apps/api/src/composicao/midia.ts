import type { DependenciasDaMidia } from '@cardapio/aplicacao';
import { criarRepositorioDeMidias, type AcessoAoBanco, type ArmazenamentoS3 } from '@cardapio/infraestrutura';

export function comporMidia(banco: AcessoAoBanco, armazenamento: ArmazenamentoS3): DependenciasDaMidia {
  return { midias: criarRepositorioDeMidias(banco), armazenamento };
}
