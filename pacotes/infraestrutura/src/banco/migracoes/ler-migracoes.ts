import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CODIGOS, ErroAplicacao } from '@cardapio/aplicacao';

export const MARCA_SEM_TRANSACAO = '-- cardapio:sem-transacao';
export const MARCA_PASSO = '-- cardapio:passo';

const PADRAO_ARQUIVO = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export interface Migracao {
  readonly numero: number;
  readonly nome: string;
  readonly sql: string;
  readonly checksum: string;
  readonly semTransacao: boolean;
}

function falhaDeMigracao(mensagem: string, arquivo: string): ErroAplicacao {
  return new ErroAplicacao(CODIGOS.BANCO_MIGRACAO_INVALIDA, mensagem, {
    modulo: 'banco',
    casoDeUso: 'Migrar',
    entidade: 'migracao',
    dados: { arquivo },
  });
}

function primeirasInstrucoes(sql: string): string[] {
  return sql
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha !== '' && !linha.startsWith('--'))
    .slice(0, 2);
}

function validarCabecalho(arquivo: string, sql: string, semTransacao: boolean): void {
  const local = semTransacao ? '' : 'LOCAL ';
  const esperado = [`SET ${local}lock_timeout`, `SET ${local}statement_timeout`];
  const [primeira = '', segunda = ''] = primeirasInstrucoes(sql);
  if (!primeira.startsWith(esperado[0] ?? '') || !segunda.startsWith(esperado[1] ?? '')) {
    throw falhaDeMigracao(`A migração precisa começar com ${esperado.join(' e ')}`, arquivo);
  }
}

function lerMigracao(pasta: string, arquivo: string, posicao: number): Migracao {
  const partes = PADRAO_ARQUIVO.exec(arquivo);
  if (partes === null) {
    throw falhaDeMigracao('Nome fora do padrão 0001_nome.sql', arquivo);
  }
  const numero = Number(partes[1]);
  if (numero !== posicao + 1) {
    throw falhaDeMigracao(`Numeração fora de sequência: esperado ${String(posicao + 1)}`, arquivo);
  }
  const sql = readFileSync(path.join(pasta, arquivo), 'utf8');
  const semTransacao = sql.trimStart().startsWith(MARCA_SEM_TRANSACAO);
  validarCabecalho(arquivo, sql, semTransacao);
  return {
    numero,
    nome: partes[2] ?? '',
    sql,
    checksum: createHash('sha256').update(sql).digest('hex'),
    semTransacao,
  };
}

export function lerMigracoes(pasta: string): Migracao[] {
  return readdirSync(pasta)
    .filter((arquivo) => arquivo.endsWith('.sql'))
    .sort()
    .map((arquivo, posicao) => lerMigracao(pasta, arquivo, posicao));
}
