interface ConexaoComEconomia {
  readonly saveData?: boolean;
}

export function prefereMovimentoReduzido(): boolean {
  return (
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function economizaDados(): boolean {
  const conexao = (navigator as Navigator & { connection?: ConexaoComEconomia }).connection;
  return conexao?.saveData === true;
}

export function podeTocarSozinho(): boolean {
  return !prefereMovimentoReduzido() && !economizaDados();
}
