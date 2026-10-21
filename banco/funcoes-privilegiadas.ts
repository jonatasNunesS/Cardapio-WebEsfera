export interface FuncaoPrivilegiada {
  readonly nome: string;
  readonly argumentos: string;
  readonly papel: 'app_runtime' | 'app_sistema';
  readonly motivo: string;
  readonly adr: string;
}

export const FUNCOES_PRIVILEGIADAS: readonly FuncaoPrivilegiada[] = [
  {
    nome: 'app.resolver_mesa',
    argumentos: 'p_slug text, p_numero integer, p_codigo text',
    papel: 'app_runtime',
    motivo: 'Resolver o QR Code da mesa antes de existir restaurante no contexto; devolve só ids e situação.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
];
