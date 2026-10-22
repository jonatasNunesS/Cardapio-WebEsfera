import { describe, expect, it } from 'vitest';
import { CODIGOS } from '../compartilhado/codigos.ts';
import { ehLinkDoGoogle } from './link-google.ts';
import { criarPersonalizacao, type DadosDaPersonalizacao } from './personalizacao.ts';

const VALIDA: DadosDaPersonalizacao = {
  corMarca: '#B4441F',
  frase: 'Cozinha de fogo e pão de fermentação natural',
  linkAvaliacaoGoogle: 'https://g.page/r/brasa-e-trigo/review',
  textos: {
    boasVindas: 'Boa noite! Peça pelo celular quando quiser.',
    aoChamarGarcom: 'Já avisamos a equipe.',
    restauranteFechado: 'Estamos fechados agora.',
  },
};

describe('link de avaliação do Google', () => {
  it.each([
    'https://g.page/r/abc/review',
    'https://goo.gl/maps/abc',
    'https://google.com/maps',
    'https://www.google.com/maps/place/x',
    'https://search.google.com/local/writereview?placeid=x',
    'https://maps.app.goo.gl/abc',
    'https://www.google.com:443/maps',
  ])('aceita %s', (link) => {
    expect(ehLinkDoGoogle(link)).toBe(true);
  });

  it.each([
    'http://g.page/r/abc',
    'https://google.com.evil.com/x',
    'https://evilgoogle.com/x',
    'https://g.page@evil.com/x',
    'https://user:senha@google.com/x',
    'https://google.com:8080/x',
    'javascript:alert(1)',
    'https://evil.com/?q=google.com',
    'g.page/r/abc',
    'https://g.page /x',
  ])('recusa %s', (link) => {
    expect(ehLinkDoGoogle(link)).toBe(false);
  });
});

describe('criarPersonalizacao', () => {
  it('aceita dados válidos e devolve as cores derivadas', () => {
    const resultado = criarPersonalizacao(VALIDA);
    expect(resultado.ok && resultado.valor.cor).toEqual({
      cor: '#B4441F',
      corSobreMarca: '#FFFFFF',
      corMarcaTexto: '#B4441F',
    });
  });

  it('link vazio vira nulo (o botão não aparece)', () => {
    const resultado = criarPersonalizacao({ ...VALIDA, linkAvaliacaoGoogle: '  ' });
    expect(resultado.ok && resultado.valor.linkAvaliacaoGoogle).toBeNull();
  });

  it('recusa link que não é do Google', () => {
    const resultado = criarPersonalizacao({
      ...VALIDA,
      linkAvaliacaoGoogle: 'https://avaliacoes.exemplo.com',
    });
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.PERSONALIZACAO_PUBLICAR_LINK_INVALIDO);
  });

  it('recusa cor sem contraste com a sugestão', () => {
    const resultado = criarPersonalizacao({ ...VALIDA, corMarca: '#E0B000' });
    expect(!resultado.ok && resultado.erro.detalhes?.sugestao).toBe('#A88400');
  });

  it('recusa texto acima do limite, dizendo o campo', () => {
    const resultado = criarPersonalizacao({
      ...VALIDA,
      textos: { ...VALIDA.textos, boasVindas: 'a'.repeat(141) },
    });
    expect(!resultado.ok && resultado.erro.detalhes).toEqual({ campo: 'boasVindas', limite: 140 });
  });

  it('conta caracteres, não unidades de código (acentos)', () => {
    const resultado = criarPersonalizacao({ ...VALIDA, frase: 'ã'.repeat(80) });
    expect(resultado.ok).toBe(true);
  });
});
