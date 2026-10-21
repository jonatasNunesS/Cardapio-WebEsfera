import { describe, expect, it } from 'vitest';
import CSS from './tokens.css?raw';

type Tema = 'cardapio' | 'painel' | 'tv';
type Par = readonly [frente: string, fundo: string];

function bloco(seletor: string): Record<string, string> {
  const inicio = CSS.indexOf(`${seletor} {`);
  const corpo = CSS.slice(inicio, CSS.indexOf('}', inicio));
  const variaveis: Record<string, string> = {};
  for (const [, nome = '', valor = ''] of corpo.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    variaveis[nome] = valor.trim();
  }
  return variaveis;
}

function variaveisDoTema(tema: Tema): Record<string, string> {
  const raiz = bloco(':root');
  return tema === 'cardapio' ? raiz : { ...raiz, ...bloco(`[data-tema='${tema}']`) };
}

function canal(valor: number): number {
  const c = valor / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex: string): number {
  const cheio = hex.length === 4 ? hex.replace(/[0-9a-f]/gi, (c) => c + c) : hex;
  const [r, g, b] = [1, 3, 5].map((i) => canal(Number.parseInt(cheio.slice(i, i + 2), 16)));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function razaoDeContraste(a: string, b: string): number {
  const [clara, escura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((clara ?? 0) + 0.05) / ((escura ?? 0) + 0.05);
}

const TEXTO: readonly Par[] = [
  ['--cor-texto', '--cor-fundo'],
  ['--cor-texto', '--cor-superficie'],
  ['--cor-texto-secundario', '--cor-fundo'],
  ['--cor-texto-secundario', '--cor-superficie'],
  ['--cor-texto-secundario', '--cor-superficie-suave'],
  ['--cor-texto-secundario', '--cor-neutro-fundo'],
  ['--cor-texto-inverso', '--cor-texto'],
  ['--cor-sobre-marca', '--cor-marca'],
  ['--cor-marca-texto', '--cor-fundo'],
  ['--cor-marca-texto', '--cor-superficie'],
  ['--cor-info', '--cor-info-fundo'],
  ['--cor-sucesso', '--cor-sucesso-fundo'],
  ['--cor-aviso', '--cor-aviso-fundo'],
  ['--cor-perigo', '--cor-perigo-fundo'],
  ['--cor-sucesso', '--cor-superficie'],
  ['--cor-aviso', '--cor-superficie'],
  ['--cor-perigo', '--cor-superficie'],
];

const BORDA_FOCO_E_ICONE: readonly Par[] = [
  ['--cor-borda-campo', '--cor-superficie'],
  ['--cor-borda-campo', '--cor-fundo'],
  ['--cor-foco', '--cor-fundo'],
  ['--cor-foco', '--cor-superficie'],
  ['--cor-texto-secundario', '--cor-superficie'],
];

const TEMAS: readonly Tema[] = ['cardapio', 'painel', 'tv'];

function casos(pares: readonly Par[]) {
  return TEMAS.flatMap((tema) => pares.map(([frente, fundo]) => [tema, frente, fundo] as const));
}

describe('contraste dos tokens', () => {
  it.each(casos(TEXTO))('%s: texto %s sobre %s tem 4,5:1', (tema, frente, fundo) => {
    const cores = variaveisDoTema(tema);
    expect(razaoDeContraste(cores[frente] ?? '', cores[fundo] ?? '')).toBeGreaterThanOrEqual(4.5);
  });

  it.each(casos(BORDA_FOCO_E_ICONE))('%s: %s sobre %s tem 3:1', (tema, frente, fundo) => {
    const cores = variaveisDoTema(tema);
    expect(razaoDeContraste(cores[frente] ?? '', cores[fundo] ?? '')).toBeGreaterThanOrEqual(3);
  });

  it('a marca WebEsfera usa texto escuro: o ciano com branco é proibido', () => {
    const painel = variaveisDoTema('painel');
    expect(painel['--cor-sobre-marca']).toBe('#303642');
    expect(razaoDeContraste('#00c2cb', '#fff')).toBeLessThan(3);
  });

  it('a TV usa texto de 24 px no mínimo', () => {
    const tv = variaveisDoTema('tv');
    const tamanhos = Object.entries(tv).filter(([nome]) => nome.startsWith('--tamanho-'));
    expect(tamanhos).toHaveLength(6);
    for (const [, valor] of tamanhos) {
      expect(Number.parseFloat(valor) * 16).toBeGreaterThanOrEqual(24);
    }
  });

  it('o corpo do texto tem 16 px no mínimo e o alvo de toque 44 px', () => {
    const raiz = variaveisDoTema('cardapio');
    expect(raiz['--tamanho-3']).toBe('1rem');
    expect(raiz['--alvo-toque']).toBe('44px');
  });

  it('movimento reduzido zera a duração', () => {
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*:root \{\s*--duracao: 0ms;/);
  });

  it('todo valor de cor dos temas é hexadecimal válido ou rgb com alfa', () => {
    for (const tema of TEMAS) {
      for (const [nome, valor] of Object.entries(variaveisDoTema(tema)).filter(([n]) =>
        n.startsWith('--cor-'),
      )) {
        expect(valor, `${tema} ${nome}`).toMatch(/^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(\d+ \d+ \d+ \/ \d+%\))$/);
      }
    }
  });
});
