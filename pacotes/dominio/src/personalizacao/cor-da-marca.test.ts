import { CASOS_DE_COR_DA_MARCA, CASOS_DE_RAZAO, CORES_DE_REFERENCIA } from '@cardapio/contratos';
import { describe, expect, it } from 'vitest';
import { CODIGOS } from '../compartilhado/codigos.ts';
import { razaoDeContraste } from './contraste.ts';
import {
  avaliarCorDaMarca,
  criarCorDaMarca,
  FUNDO_DO_CARDAPIO,
  sugerirCorDaMarca,
  TEXTO_PADRAO,
} from './cor-da-marca.ts';

describe('contraste (vetores compartilhados com o ui)', () => {
  it.each(CASOS_DE_RAZAO)('$frente sobre $fundo dá $razao:1', ({ frente, fundo, razao }) => {
    expect(Math.round(razaoDeContraste(frente, fundo) * 100) / 100).toBe(razao);
  });

  it('usa o mesmo fundo e o mesmo texto padrão do ui', () => {
    expect(FUNDO_DO_CARDAPIO).toBe(CORES_DE_REFERENCIA.fundo);
    expect(TEXTO_PADRAO).toBe(CORES_DE_REFERENCIA.textoPadrao);
  });
});

describe('CorDaMarca', () => {
  it.each(CASOS_DE_COR_DA_MARCA)('$nome ($cor)', ({ cor, corSobreMarca, corMarcaTexto, passa, sugestao }) => {
    const avaliacao = avaliarCorDaMarca(cor);
    expect(avaliacao).toMatchObject({ corSobreMarca, corMarcaTexto, passa });
    const resultado = criarCorDaMarca(cor);
    expect(resultado.ok).toBe(passa);
    if (!resultado.ok) {
      expect(resultado.erro.codigo).toBe(CODIGOS.PERSONALIZACAO_PUBLICAR_COR_SEM_CONTRASTE);
      expect(resultado.erro.detalhes?.sugestao).toBe(sugestao);
    }
  });

  it('terracota passa com 5,5:1 no botão e 5,0:1 contra o fundo, como no protótipo', () => {
    const avaliacao = avaliarCorDaMarca('#b4441f');
    expect(avaliacao.contrasteTexto).toBeGreaterThanOrEqual(5.5);
    expect(avaliacao.contrasteFundo).toBeGreaterThanOrEqual(5);
    expect(avaliacao.cor).toBe('#B4441F');
  });

  it('a sugestão sempre passa', () => {
    for (let cor = 0; cor <= 0xffffff; cor += 0x0f0f0f) {
      const hex = `#${cor.toString(16).padStart(6, '0')}`.toUpperCase();
      expect(avaliarCorDaMarca(sugerirCorDaMarca(hex)).passa, hex).toBe(true);
    }
  });

  it('a sugestão é o primeiro tom mais escuro que passa (passos de 5%)', () => {
    const sugestao = sugerirCorDaMarca('#E0B000');
    expect(sugestao).toBe('#A88400');
    expect(avaliarCorDaMarca('#B38D00').passa).toBe(false);
  });

  it.each(['red', '#FFF', 'B4441F', '#B4441FF', '#GGGGGG', ''])('recusa formato "%s"', (cor) => {
    const resultado = criarCorDaMarca(cor);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.erro.codigo).toBe(CODIGOS.PERSONALIZACAO_PUBLICAR_COR_INVALIDA);
    }
  });

  it('o contraste informado nunca arredonda para cima', () => {
    const resultado = criarCorDaMarca('#E0B000');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.erro.detalhes?.contrasteFundo).toBe(1.84);
    }
  });
});
