export const OCULTO = '[oculto]';

const CHAVES_SENSIVEIS: ReadonlySet<string> = new Set([
  'cookie',
  'cookies',
  'set-cookie',
  'authorization',
  'proxy-authorization',
  'senha',
  'token',
  'email',
  'documento',
  'cpf',
  'cnpj',
]);

const CABECALHOS_PERMITIDOS: ReadonlySet<string> = new Set([
  'accept',
  'content-length',
  'content-type',
  'user-agent',
  'x-id-rastreio',
]);

const SUBSTITUICOES: readonly (readonly [RegExp, string])[] = [
  [/((?:^|[?&])c=)[^&#\s"']*/g, `$1${OCULTO}`],
  [/(\/mesa\/)[^/?#\s"']+/g, `$1${OCULTO}`],
  [/[\w.+-]+@(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi, '[email]'],
  [/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[cnpj]'],
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[cpf]'],
  [/\b\d{14}\b/g, '[cnpj]'],
  [/\b\d{11}\b/g, '[cpf]'],
];

export function mascararTexto(texto: string): string {
  return SUBSTITUICOES.reduce((resultado, [padrao, troca]) => resultado.replace(padrao, troca), texto);
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

export function limparValor(valor: unknown): unknown {
  if (typeof valor === 'string') {
    return mascararTexto(valor);
  }
  if (Array.isArray(valor)) {
    return valor.map(limparValor);
  }
  if (!ehObjeto(valor)) {
    return valor;
  }
  return Object.fromEntries(
    Object.entries(valor).map(([chave, item]) => [
      chave,
      CHAVES_SENSIVEIS.has(chave.toLowerCase()) ? OCULTO : limparValor(item),
    ]),
  );
}

function limparCabecalhos(cabecalhos: unknown): Record<string, unknown> {
  if (!ehObjeto(cabecalhos)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(cabecalhos).filter(([nome]) => CABECALHOS_PERMITIDOS.has(nome.toLowerCase())),
  );
}

function limparConsulta(consulta: unknown): unknown {
  if (!Array.isArray(consulta)) {
    return consulta;
  }
  return consulta.map((par: unknown) => (Array.isArray(par) && par[0] === 'c' ? ['c', OCULTO] : par));
}

function semChaves(objeto: Record<string, unknown>, chaves: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(objeto).filter(([chave]) => !chaves.includes(chave)));
}

function limparRequisicao(requisicao: unknown): unknown {
  if (!ehObjeto(requisicao)) {
    return requisicao;
  }
  const limpa = {
    ...semChaves(requisicao, ['cookies', 'data']),
    headers: limparCabecalhos(requisicao.headers),
  };
  return requisicao.query_string === undefined
    ? limpa
    : { ...limpa, query_string: limparConsulta(requisicao.query_string) };
}

export function limparEvento<T extends object>(evento: T): T {
  const original = evento as Record<string, unknown>;
  const resto = semChaves(original, ['user', 'request']);
  const semPessoa =
    original.request === undefined ? resto : { ...resto, request: limparRequisicao(original.request) };
  return limparValor(semPessoa) as T;
}

export function limparBreadcrumb<T extends object>(breadcrumb: T): T {
  return limparValor(breadcrumb) as T;
}

export function limparSpan<T extends object>(span: T): T {
  return limparValor(span) as T;
}
