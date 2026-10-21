import {
  CODIGOS,
  ErroAplicacao,
  ErroDependenciaExterna,
  ErroIsolamentoInquilino,
  type ContextoDoErro,
} from '@cardapio/aplicacao';

interface ErroDoPostgres extends Error {
  readonly code: string;
  readonly table?: string;
  readonly constraint?: string;
}

const CODIGOS_DE_CONEXAO: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  '53300',
  '57P01',
  '57P02',
  '57P03',
  '3D000',
]);

const CLASSES_DE_CONEXAO = ['08', '28'];

function ehFalhaDeConexao(codigo: string): boolean {
  return CODIGOS_DE_CONEXAO.has(codigo) || CLASSES_DE_CONEXAO.includes(codigo.slice(0, 2));
}

function ehErroDoPostgres(valor: unknown): valor is ErroDoPostgres {
  return valor instanceof Error && 'code' in valor && typeof valor.code === 'string';
}

export function encontrarErroDoPostgres(erro: unknown): ErroDoPostgres | undefined {
  let atual: unknown = erro;
  for (let profundidade = 0; profundidade < 5 && atual instanceof Error; profundidade += 1) {
    if (ehErroDoPostgres(atual)) {
      return atual;
    }
    atual = atual.cause;
  }
  return undefined;
}

function tabelaDoErro(erro: ErroDoPostgres): string | undefined {
  return erro.table ?? /(?:for table|relation) "?([a-z_]+)"?/.exec(erro.message)?.[1];
}

export interface ContextoDoBanco {
  readonly casoDeUso: string;
  readonly restauranteId?: string;
  readonly escopo: 'restaurante' | 'sistema' | 'sem-restaurante';
}

function contextoDoErro(contexto: ContextoDoBanco, erro: ErroDoPostgres): ContextoDoErro {
  const tabela = tabelaDoErro(erro);
  return {
    modulo: 'banco',
    casoDeUso: contexto.casoDeUso,
    ...(contexto.restauranteId === undefined ? {} : { restauranteId: contexto.restauranteId }),
    ...(tabela === undefined ? {} : { entidade: tabela }),
    dados: { sqlstate: erro.code, escopo: contexto.escopo, restricao: erro.constraint },
  };
}

export function traduzirErroDoBanco(erro: unknown, contexto: ContextoDoBanco): unknown {
  if (erro instanceof ErroAplicacao) {
    return erro;
  }
  const doPostgres = encontrarErroDoPostgres(erro);
  if (doPostgres === undefined) {
    return erro;
  }
  if (doPostgres.code === '42501') {
    return new ErroIsolamentoInquilino(
      CODIGOS.BANCO_ISOLAMENTO_VIOLADO,
      'O banco recusou um acesso fora do restaurante do contexto',
      contextoDoErro(contexto, doPostgres),
      doPostgres,
    );
  }
  if (ehFalhaDeConexao(doPostgres.code)) {
    return new ErroDependenciaExterna(
      CODIGOS.BANCO_CONEXAO_FALHOU,
      'O PostgreSQL não respondeu',
      contextoDoErro(contexto, doPostgres),
      { provedor: 'postgresql', operacao: contexto.casoDeUso },
      doPostgres,
    );
  }
  return new ErroAplicacao(
    CODIGOS.BANCO_CONSULTA_FALHOU,
    `O PostgreSQL recusou a consulta (${doPostgres.code})`,
    contextoDoErro(contexto, doPostgres),
    doPostgres,
  );
}

export function falhaDeConexao(erro: unknown, casoDeUso: string): ErroDependenciaExterna {
  if (erro instanceof ErroDependenciaExterna) {
    return erro;
  }
  return new ErroDependenciaExterna(
    CODIGOS.BANCO_CONEXAO_FALHOU,
    'O PostgreSQL não respondeu',
    { modulo: 'banco', casoDeUso, dados: { sqlstate: encontrarErroDoPostgres(erro)?.code } },
    { provedor: 'postgresql', operacao: casoDeUso },
    encontrarErroDoPostgres(erro) ?? erro,
  );
}
