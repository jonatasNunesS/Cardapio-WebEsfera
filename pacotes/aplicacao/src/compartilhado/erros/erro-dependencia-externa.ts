import { ErroAplicacao, type ContextoDoErro } from '@cardapio/dominio';

export interface DadosDaDependencia {
  readonly provedor: string;
  readonly operacao: string;
  readonly statusHttp?: number;
  readonly tentativa?: number;
  readonly tentativasMaximas?: number;
  readonly duracaoMs?: number;
}

export class ErroDependenciaExterna extends ErroAplicacao {
  readonly dependencia: DadosDaDependencia;

  constructor(
    codigo: string,
    mensagem: string,
    contexto: ContextoDoErro,
    dependencia: DadosDaDependencia,
    causa?: unknown,
  ) {
    super(codigo, mensagem, contexto, causa);
    this.dependencia = dependencia;
  }
}
