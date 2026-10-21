export interface Ok<S> {
  readonly ok: true;
  readonly valor: S;
}

export interface Falha<F> {
  readonly ok: false;
  readonly erro: F;
}

export type Resultado<S, F> = Ok<S> | Falha<F>;

function ok<S>(valor: S): Ok<S> {
  return { ok: true, valor };
}

function falha<F>(erro: F): Falha<F> {
  return { ok: false, erro };
}

function ehOk<S, F>(resultado: Resultado<S, F>): resultado is Ok<S> {
  return resultado.ok;
}

function ehFalha<S, F>(resultado: Resultado<S, F>): resultado is Falha<F> {
  return !resultado.ok;
}

function mapear<S, F, T>(resultado: Resultado<S, F>, transformar: (valor: S) => T): Resultado<T, F> {
  return resultado.ok ? ok(transformar(resultado.valor)) : resultado;
}

export const Resultado = { ok, falha, ehOk, ehFalha, mapear } as const;
