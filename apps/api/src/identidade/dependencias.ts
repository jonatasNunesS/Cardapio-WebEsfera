import type {
  DependenciasDeConcluirCadastro,
  DependenciasDeConfirmarRedefinicao,
  DependenciasDeConfirmarSegundoFator,
  DependenciasDeCriarConta,
  DependenciasDeCriarRestaurante,
  DependenciasDeEntrar,
  DependenciasDeEntrarComoAdmin,
  DependenciasDeIniciarCadastro,
  DependenciasDePedirRedefinicao,
  RepositorioDeHorarios,
  RepositorioDePersonalizacao,
} from '@cardapio/aplicacao';

export type DependenciasDeIdentidade = DependenciasDeCriarConta &
  DependenciasDeEntrar &
  DependenciasDePedirRedefinicao &
  DependenciasDeConfirmarRedefinicao &
  DependenciasDeCriarRestaurante &
  DependenciasDeEntrarComoAdmin &
  DependenciasDeConfirmarSegundoFator &
  DependenciasDeIniciarCadastro &
  DependenciasDeConcluirCadastro & {
    readonly horarios: RepositorioDeHorarios;
    readonly personalizacoes: RepositorioDePersonalizacao;
  };

export interface HostsDosApps {
  readonly painel: string;
  readonly admin: string;
}
