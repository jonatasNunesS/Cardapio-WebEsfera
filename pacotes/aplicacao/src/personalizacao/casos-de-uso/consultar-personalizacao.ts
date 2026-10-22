import { CODIGOS } from '@cardapio/dominio';
import { ErroEstadoInconsistente } from '../../compartilhado/erros/erro-estado-inconsistente.ts';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import type {
  PersonalizacaoGuardada,
  RepositorioDePersonalizacao,
} from '../portas/repositorio-de-personalizacao.ts';

export async function consultarPersonalizacao(
  dependencias: { readonly personalizacoes: RepositorioDePersonalizacao },
  acesso: AcessoAoRestaurante,
): Promise<PersonalizacaoGuardada> {
  const guardada = await dependencias.personalizacoes.buscar(acesso.restauranteId);
  if (guardada === null) {
    throw new ErroEstadoInconsistente(
      CODIGOS.PERSONALIZACAO_CONSULTAR_AUSENTE,
      'Restaurante sem personalização: toda criação grava a padrão',
      { modulo: 'personalizacao', casoDeUso: 'ConsultarPersonalizacao', restauranteId: acesso.restauranteId },
    );
  }
  return guardada;
}
