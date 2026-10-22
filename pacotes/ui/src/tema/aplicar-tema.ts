import type { ReportarErro } from './reportar-erro.ts';

export interface TemaRestaurante {
  readonly corMarca: string;
  readonly corSobreMarca: string;
  readonly corMarcaTexto: string;
}

export const CODIGO_TEMA_COR_INVALIDA = 'UI_TEMA_COR_INVALIDA';

const VARIAVEIS: Readonly<Record<keyof TemaRestaurante, string>> = {
  corMarca: '--cor-marca',
  corSobreMarca: '--cor-sobre-marca',
  corMarcaTexto: '--cor-marca-texto',
};

const HEXADECIMAL = /^#[0-9a-fA-F]{6}$/;

export class ErroTemaInvalido extends Error {
  readonly codigo = CODIGO_TEMA_COR_INVALIDA;
  readonly campo: keyof TemaRestaurante;

  constructor(campo: keyof TemaRestaurante) {
    super(`Cor do tema do restaurante fora do formato #RRGGBB: ${campo}`);
    this.name = 'ErroTemaInvalido';
    this.campo = campo;
  }
}

function campoInvalido(tema: TemaRestaurante): keyof TemaRestaurante | undefined {
  return (Object.keys(VARIAVEIS) as (keyof TemaRestaurante)[]).find(
    (campo) => !HEXADECIMAL.test(tema[campo]),
  );
}

export function aplicarTemaRestaurante(
  elemento: HTMLElement,
  tema: TemaRestaurante,
  reportar: ReportarErro,
): boolean {
  const invalido = campoInvalido(tema);
  for (const [campo, variavel] of Object.entries(VARIAVEIS)) {
    if (invalido === undefined) {
      elemento.style.setProperty(variavel, tema[campo as keyof TemaRestaurante]);
    } else {
      elemento.style.removeProperty(variavel);
    }
  }
  if (invalido !== undefined) {
    reportar(new ErroTemaInvalido(invalido), { codigo: CODIGO_TEMA_COR_INVALIDA, campo: invalido });
    return false;
  }
  return true;
}
