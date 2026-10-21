export interface ErroDeNegocio {
  readonly tipo: 'erro-de-negocio';
  readonly codigo: string;
  readonly mensagem: string;
  readonly detalhes?: Readonly<Record<string, unknown>>;
}

export function criarErroDeNegocio(
  codigo: string,
  mensagem: string,
  detalhes?: Readonly<Record<string, unknown>>,
): ErroDeNegocio {
  return detalhes === undefined
    ? { tipo: 'erro-de-negocio', codigo, mensagem }
    : { tipo: 'erro-de-negocio', codigo, mensagem, detalhes };
}

export function ehErroDeNegocio(valor: unknown): valor is ErroDeNegocio {
  return typeof valor === 'object' && valor !== null && 'tipo' in valor && valor.tipo === 'erro-de-negocio';
}
