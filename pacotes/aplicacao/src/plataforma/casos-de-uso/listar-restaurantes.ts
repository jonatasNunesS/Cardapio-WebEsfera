import { diasRestantesDeTeste, situacaoExibida, type SituacaoExibida } from '@cardapio/dominio';
import type { DependenciasDaPlataforma } from '../dependencias.ts';
import type { AcessoDoAdmin } from '../portas/repositorio-da-plataforma.ts';

export interface RestauranteListado {
  readonly nome: string;
  readonly slug: string;
  readonly situacao: SituacaoExibida;
  readonly diasDeTeste: number | null;
}

export async function listarRestaurantes(
  dependencias: DependenciasDaPlataforma,
  acesso: AcessoDoAdmin,
): Promise<readonly RestauranteListado[]> {
  const agora = dependencias.relogio.agora();
  const lista = await dependencias.plataforma.listar(acesso);
  return lista.map((restaurante) => ({
    nome: restaurante.nome,
    slug: restaurante.slug,
    situacao: situacaoExibida(restaurante),
    diasDeTeste:
      restaurante.situacao === 'teste' ? diasRestantesDeTeste(restaurante.testeTerminaEm, agora) : null,
  }));
}
