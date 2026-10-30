import { z } from 'zod';

export type FonteAmbiente = Readonly<Record<string, string | undefined>>;

export interface ProblemaAmbiente {
  readonly variavel: string;
  readonly motivo: 'ausente' | 'inválida';
}

export type ResultadoAmbiente<T> =
  | { readonly ok: true; readonly valor: T }
  | { readonly ok: false; readonly problemas: readonly ProblemaAmbiente[] };

export const esquemaAmbienteBase = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  APP_ENV: z.enum(['local', 'preview', 'homologacao', 'producao']),
});

export const camposDoArmazenamento = {
  URL_ARMAZENAMENTO: z.url(),
  URL_ENVIO_ARMAZENAMENTO: z.url().optional(),
  REGIAO_ARMAZENAMENTO: z.string().min(1),
  CHAVE_ARMAZENAMENTO: z.string().min(1),
  SEGREDO_ARMAZENAMENTO: z.string().min(1),
  BUCKET_ORIGINAIS: z.string().min(1),
  BUCKET_PUBLICO: z.string().min(1),
  URL_PUBLICA_MIDIA: z.url(),
};

export const URL_DA_API_DO_MERCADO_PAGO = 'https://api.mercadopago.com';

export const camposDoMercadoPago = {
  URL_MERCADO_PAGO: z.url().default(URL_DA_API_DO_MERCADO_PAGO),
  MP_ACCESS_TOKEN: z.string().min(1),
};

export function exigirMercadoPagoReal(ambiente: {
  readonly APP_ENV: string;
  readonly URL_MERCADO_PAGO: string;
}): boolean {
  return ambiente.APP_ENV === 'local' || ambiente.URL_MERCADO_PAGO === URL_DA_API_DO_MERCADO_PAGO;
}

function listarProblemas(issues: readonly z.core.$ZodIssue[], fonte: FonteAmbiente): ProblemaAmbiente[] {
  const variaveis = [...new Set(issues.map((issue) => issue.path.map(String).join('.')))];
  return variaveis.map((variavel) => ({
    variavel,
    motivo: fonte[variavel] === undefined ? 'ausente' : 'inválida',
  }));
}

export function validarAmbiente<E extends z.ZodType>(
  esquema: E,
  fonte: FonteAmbiente,
): ResultadoAmbiente<z.output<E>> {
  const resultado = esquema.safeParse(fonte);
  if (resultado.success) {
    return { ok: true, valor: resultado.data };
  }
  return { ok: false, problemas: listarProblemas(resultado.error.issues, fonte) };
}

export function formatarProblemasAmbiente(problemas: readonly ProblemaAmbiente[]): string {
  const linhas = problemas.map((problema) => `- ${problema.variavel}: ${problema.motivo}`);
  return ['Variáveis de ambiente com problema:', ...linhas].join('\n');
}

export function carregarAmbiente<E extends z.ZodType>(
  esquema: E,
  fonte: FonteAmbiente = process.env,
): z.output<E> {
  const resultado = validarAmbiente(esquema, fonte);
  if (resultado.ok) {
    return resultado.valor;
  }
  process.stderr.write(`${formatarProblemasAmbiente(resultado.problemas)}\n`);
  return process.exit(1);
}
