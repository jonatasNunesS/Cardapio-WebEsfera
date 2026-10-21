export interface ContextoDoErro {
  readonly modulo: string;
  readonly casoDeUso?: string;
  readonly restauranteId?: string;
  readonly entidade?: string;
  readonly entidadeId?: string;
  readonly dados?: Readonly<Record<string, unknown>>;
}

export class ErroAplicacao extends Error {
  readonly codigo: string;
  readonly contexto: ContextoDoErro;

  constructor(codigo: string, mensagem: string, contexto: ContextoDoErro, causa?: unknown) {
    super(mensagem, causa === undefined ? undefined : { cause: causa });
    this.name = new.target.name;
    this.codigo = codigo;
    this.contexto = contexto;
  }
}
