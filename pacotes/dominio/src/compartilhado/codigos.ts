export const CODIGOS = {
  SISTEMA_FALHA_NAO_TIPADA: 'SISTEMA_FALHA_NAO_TIPADA',
  HTTP_ENTRADA_INVALIDA: 'HTTP_ENTRADA_INVALIDA',
  HTTP_REQUISICAO_INVALIDA: 'HTTP_REQUISICAO_INVALIDA',
  HTTP_ROTA_INEXISTENTE: 'HTTP_ROTA_INEXISTENTE',
  HTTP_REQUISICAO_FALHOU: 'HTTP_REQUISICAO_FALHOU',
  HTTP_DEPENDENCIA_INDISPONIVEL: 'HTTP_DEPENDENCIA_INDISPONIVEL',
  DEPURACAO_ERRO_PROVOCADO: 'DEPURACAO_ERRO_PROVOCADO',
  BANCO_ISOLAMENTO_VIOLADO: 'BANCO_ISOLAMENTO_VIOLADO',
  BANCO_CONSULTA_FALHOU: 'BANCO_CONSULTA_FALHOU',
  BANCO_CONEXAO_FALHOU: 'BANCO_CONEXAO_FALHOU',
  BANCO_CONTEXTO_INVALIDO: 'BANCO_CONTEXTO_INVALIDO',
  BANCO_MIGRACAO_INVALIDA: 'BANCO_MIGRACAO_INVALIDA',
  BANCO_MIGRACAO_ALTERADA: 'BANCO_MIGRACAO_ALTERADA',
  MESA_RESOLUCAO_CODIGO_DIVERGENTE: 'MESA_RESOLUCAO_CODIGO_DIVERGENTE',
  REDIS_CHAVE_INVALIDA: 'REDIS_CHAVE_INVALIDA',
} as const;

export type Codigo = (typeof CODIGOS)[keyof typeof CODIGOS];

const PADRAO_CODIGO = /^[A-Z]+(?:_[A-Z]+){2,}$/;

export function validarCodigos(codigos: Readonly<Record<string, string>>): string[] {
  const vistos = new Set<string>();
  return Object.entries(codigos).flatMap(([chave, valor]) => {
    const problemas: string[] = [];
    if (!PADRAO_CODIGO.test(valor)) {
      problemas.push(`${valor}: fora do padrão MODULO_ACAO_MOTIVO`);
    }
    if (chave !== valor) {
      problemas.push(`${chave}: a chave difere do valor ${valor}`);
    }
    if (vistos.has(valor)) {
      problemas.push(`${valor}: código repetido`);
    }
    vistos.add(valor);
    return problemas;
  });
}
