export {
  CODIGOS,
  ErroAplicacao,
  ErroInvarianteDominio,
  Resultado,
  criarErroDeNegocio,
  ehErroDeNegocio,
} from '@cardapio/dominio';
export type { Codigo, ContextoDoErro, ErroDeNegocio } from '@cardapio/dominio';
export { ErroDependenciaExterna } from './erros/erro-dependencia-externa.ts';
export type { DadosDaDependencia } from './erros/erro-dependencia-externa.ts';
export { ErroIsolamentoInquilino } from './erros/erro-isolamento-inquilino.ts';
export type { PassoDeRastreio, RelatorDeErros } from './portas/relator-de-erros.ts';
export { propagadorNulo } from './portas/propagador-de-contexto.ts';
export type { PropagadorDeContexto } from './portas/propagador-de-contexto.ts';
