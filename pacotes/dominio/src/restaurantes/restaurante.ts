import { CODIGOS } from '../compartilhado/codigos.ts';
import { contarCaracteres } from '../compartilhado/texto.ts';
import { criarErroDeNegocio, type ErroDeNegocio } from '../compartilhado/erro-de-negocio.ts';
import { Resultado } from '../compartilhado/resultado.ts';
import { candidatosDeSlug } from './slug.ts';

export const DIAS_DE_TESTE = 10;
export const TAMANHO_MAXIMO_DO_NOME = 80;
const MILISSEGUNDOS_POR_DIA = 86_400_000;

export type SituacaoDoRestaurante = 'teste' | 'ativo' | 'carencia' | 'inadimplente' | 'cancelado';

export interface NovoRestaurante {
  readonly nome: string;
  readonly situacao: 'teste';
  readonly testeTerminaEm: Date;
  readonly candidatosDeSlug: readonly string[];
}

export function prepararNovoRestaurante(
  nome: string,
  agora: Date,
): Resultado<NovoRestaurante, ErroDeNegocio> {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  const candidatos = candidatosDeSlug(limpo);
  if (limpo === '' || contarCaracteres(limpo) > TAMANHO_MAXIMO_DO_NOME || candidatos.length === 0) {
    return Resultado.falha(
      criarErroDeNegocio(
        CODIGOS.RESTAURANTE_CRIAR_NOME_INVALIDO,
        `Informe o nome do restaurante, com até ${String(TAMANHO_MAXIMO_DO_NOME)} caracteres e ao menos uma letra ou número.`,
        { campo: 'nome' },
      ),
    );
  }
  return Resultado.ok({
    nome: limpo,
    situacao: 'teste',
    testeTerminaEm: new Date(agora.getTime() + DIAS_DE_TESTE * MILISSEGUNDOS_POR_DIA),
    candidatosDeSlug: candidatos,
  });
}
