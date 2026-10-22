import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { imagemDoPlaywright, roteiroNoConteiner } from './testes-visuais.ts';

describe('testes visuais no Docker', () => {
  it('usa a imagem oficial na mesma versão do @playwright/test', () => {
    expect(imagemDoPlaywright(path.resolve(import.meta.dirname, '..'))).toMatch(
      /^mcr\.microsoft\.com\/playwright:v\d+\.\d+\.\d+-noble$/u,
    );
  });

  it('o CI usa a mesma imagem, para comparar no mesmo ambiente em que a base foi gerada', () => {
    const raiz = path.resolve(import.meta.dirname, '..');
    const ci = readFileSync(path.join(raiz, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).toContain(`image: ${imagemDoPlaywright(raiz)}`);
  });

  it('só atualiza a base com --atualizar', () => {
    expect(roteiroNoConteiner(true)).toContain('visual:atualizar');
    expect(roteiroNoConteiner(false)).not.toContain('visual:atualizar');
  });

  it('copia o repositório sem node_modules', () => {
    expect(roteiroNoConteiner(false)).toContain('--exclude=node_modules');
  });
});
