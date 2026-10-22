import {
  CODIGOS,
  criarErroDeNegocio,
  prepararNovoRestaurante,
  Resultado,
  type ErroDeNegocio,
} from '@cardapio/dominio';
import type { Relogio } from '../../compartilhado/portas/relogio.ts';
import type { RepositorioDeSessoes } from '../../identidade/portas/repositorio-de-sessoes.ts';
import { ErroEstadoInconsistente } from '../../compartilhado/erros/erro-estado-inconsistente.ts';
import { personalizacaoPadrao } from '../../personalizacao/personalizacao-padrao.ts';
import type { RepositorioDeRestaurantes, RestauranteCriado } from '../portas/repositorio-de-restaurantes.ts';

export interface DependenciasDeCriarRestaurante {
  readonly restaurantes: RepositorioDeRestaurantes;
  readonly sessoes: RepositorioDeSessoes;
  readonly relogio: Relogio;
}

export interface EntradaDeCriarRestaurante {
  readonly usuarioId: string;
  readonly hashDaSessao: string;
  readonly nome: string;
}

export async function criarRestaurante(
  dependencias: DependenciasDeCriarRestaurante,
  entrada: EntradaDeCriarRestaurante,
): Promise<Resultado<RestauranteCriado, ErroDeNegocio>> {
  const novo = prepararNovoRestaurante(entrada.nome, dependencias.relogio.agora());
  if (!novo.ok) {
    return novo;
  }
  const criado = await dependencias.restaurantes.criar({
    nome: novo.valor.nome,
    candidatosDeSlug: novo.valor.candidatosDeSlug,
    testeTerminaEm: novo.valor.testeTerminaEm,
    donoId: entrada.usuarioId,
    personalizacao: personalizacaoPadrao(),
  });
  if (criado === null) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.RESTAURANTE_CRIAR_SLUG_OCUPADO,
        'Já existe um restaurante com esse nome. Acrescente o bairro ou a cidade.',
        { campo: 'nome' },
      ),
    );
  }
  if (!(await dependencias.sessoes.definirRestaurante(entrada.hashDaSessao, criado.restauranteId))) {
    throw new ErroEstadoInconsistente(
      CODIGOS.SESSAO_CRIAR_RECUSADA,
      'A sessão não aceitou o restaurante criado',
      {
        modulo: 'restaurantes',
        casoDeUso: 'CriarRestaurante',
        restauranteId: criado.restauranteId,
      },
    );
  }
  return Resultado.ok(criado);
}
