export interface PassoDeRastreio {
  readonly categoria: string;
  readonly mensagem: string;
  readonly dados?: Readonly<Record<string, unknown>>;
}

export interface RelatorDeErros {
  reportar(erro: unknown, extra?: Readonly<Record<string, unknown>>): string;
  registrarPasso(passo: PassoDeRastreio): void;
}
