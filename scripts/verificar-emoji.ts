import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { encontrarEmojis } from '../pacotes/config/src/emoji.ts';

const ARQUIVOS_IGNORADOS: ReadonlySet<string> = new Set(['pnpm-lock.yaml']);
const BYTES_INSPECIONADOS_PARA_BINARIO = 8000;

export interface ViolacaoEmoji {
  readonly arquivo: string;
  readonly linha: number;
  readonly coluna: number;
  readonly codigo: string;
}

export function ehBinario(conteudo: Buffer): boolean {
  return conteudo.subarray(0, BYTES_INSPECIONADOS_PARA_BINARIO).includes(0);
}

export function verificarConteudo(arquivo: string, conteudo: Buffer): ViolacaoEmoji[] {
  if (ehBinario(conteudo)) {
    return [];
  }
  return conteudo
    .toString('utf8')
    .split('\n')
    .flatMap((texto, indice) =>
      encontrarEmojis(texto).map((ocorrencia) => ({
        arquivo,
        linha: indice + 1,
        coluna: ocorrencia.indice + 1,
        codigo: ocorrencia.codigo,
      })),
    );
}

export function listarArquivosVersionados(raiz: string): string[] {
  const saida = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: raiz,
    encoding: 'utf8',
  });
  return [...new Set(saida.split('\0').filter((arquivo) => arquivo.length > 0))];
}

export function verificarRepositorio(raiz: string): ViolacaoEmoji[] {
  return listarArquivosVersionados(raiz)
    .filter((arquivo) => !ARQUIVOS_IGNORADOS.has(path.basename(arquivo)))
    .filter((arquivo) => lstatSync(path.join(raiz, arquivo)).isFile())
    .flatMap((arquivo) => verificarConteudo(arquivo, readFileSync(path.join(raiz, arquivo))));
}

function executar(): void {
  const violacoes = verificarRepositorio(process.cwd());
  if (violacoes.length === 0) {
    console.log('verificar-emoji: nenhum emoji encontrado nos arquivos versionados.');
    return;
  }
  for (const violacao of violacoes) {
    console.error(
      `${violacao.arquivo}:${String(violacao.linha)}:${String(violacao.coluna)} emoji ${violacao.codigo}`,
    );
  }
  console.error(
    `verificar-emoji: ${String(violacoes.length)} ocorrência(s). O projeto proíbe emoji (CLAUDE.md).`,
  );
  process.exitCode = 1;
}

if (import.meta.main) {
  executar();
}
