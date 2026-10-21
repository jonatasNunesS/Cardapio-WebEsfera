import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verificarConteudo } from './verificar-emoji.ts';

const SCRIPT = fileURLToPath(new URL('./verificar-emoji.ts', import.meta.url));
const FOGUETE = String.fromCodePoint(0x1f680);
const MARKDOWN_LIMPO = '# Cardápio\n\nPedido enviado à cozinha.\n';
const MARKDOWN_COM_EMOJI = `# Cardápio\n\nPedido enviado à cozinha ${FOGUETE}\n`;

describe('verificarConteudo', () => {
  it('recusa Markdown com pictograma, apontando linha e código', () => {
    expect(verificarConteudo('leia.md', Buffer.from(MARKDOWN_COM_EMOJI))).toEqual([
      { arquivo: 'leia.md', linha: 3, coluna: 26, codigo: 'U+1F680' },
    ]);
  });

  it('aceita o mesmo Markdown sem o pictograma', () => {
    expect(verificarConteudo('leia.md', Buffer.from(MARKDOWN_LIMPO))).toEqual([]);
  });

  it('ignora arquivo binário mesmo que os bytes formem um emoji', () => {
    const binario = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]), Buffer.from(FOGUETE)]);
    expect(verificarConteudo('imagem.png', binario)).toEqual([]);
  });
});

describe('script verificar-emoji sobre um repositório git', () => {
  let repositorio = '';

  beforeEach(() => {
    repositorio = mkdtempSync(path.join(tmpdir(), 'verificar-emoji-'));
    execFileSync('git', ['init', '--quiet'], { cwd: repositorio });
  });

  afterEach(() => {
    rmSync(repositorio, { recursive: true, force: true });
  });

  function executarScript() {
    return spawnSync(process.execPath, [SCRIPT], { cwd: repositorio, encoding: 'utf8' });
  }

  it('falha com o arquivo Markdown com emoji', () => {
    writeFileSync(path.join(repositorio, 'leia.md'), MARKDOWN_COM_EMOJI);

    const resultado = executarScript();

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain('leia.md:3:26 emoji U+1F680');
  });

  it('passa com o mesmo arquivo sem emoji e ignora o lockfile', () => {
    writeFileSync(path.join(repositorio, 'leia.md'), MARKDOWN_LIMPO);
    writeFileSync(path.join(repositorio, 'pnpm-lock.yaml'), `nome: ${FOGUETE}\n`);

    const resultado = executarScript();

    expect(resultado.status).toBe(0);
  });
});
