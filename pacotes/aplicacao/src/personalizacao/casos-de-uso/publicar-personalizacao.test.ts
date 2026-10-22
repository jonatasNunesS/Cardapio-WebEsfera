import { CODIGOS, type DadosDaPersonalizacao } from '@cardapio/dominio';
import { describe, expect, it } from 'vitest';
import { PersonalizacoesEmMemoria } from '../../testes/dobles.ts';
import { consultarPersonalizacao } from './consultar-personalizacao.ts';
import { publicarPersonalizacao } from './publicar-personalizacao.ts';

const DADOS: DadosDaPersonalizacao = {
  corMarca: '#b4441f',
  logoUrl: null,
  capaUrl: null,
  frase: 'Fogo e fermentação natural',
  linkAvaliacaoGoogle: 'https://g.page/r/brasa/review',
  textos: { boasVindas: 'Olá', aoChamarGarcom: 'Já vamos', restauranteFechado: 'Fechado' },
};
const DONO = { restauranteId: 'r1', papel: 'dono' } as const;

describe('PublicarPersonalizacao', () => {
  it('publica com as cores calculadas no servidor e sobe a versão', async () => {
    const personalizacoes = new PersonalizacoesEmMemoria();
    const resultado = await publicarPersonalizacao({ personalizacoes }, DONO, DADOS);

    expect(resultado.ok && resultado.valor).toMatchObject({
      corMarca: '#B4441F',
      corSobreMarca: '#FFFFFF',
      corMarcaTexto: '#B4441F',
      versao: 1,
    });
    await publicarPersonalizacao({ personalizacoes }, DONO, DADOS);
    expect((await consultarPersonalizacao({ personalizacoes }, DONO)).versao).toBe(2);
  });

  it('recusa cor sem contraste mesmo que o front envie, e devolve a sugestão', async () => {
    const personalizacoes = new PersonalizacoesEmMemoria();
    const resultado = await publicarPersonalizacao({ personalizacoes }, DONO, {
      ...DADOS,
      corMarca: '#E0B000',
    });

    expect(!resultado.ok && resultado.erro).toMatchObject({
      codigo: CODIGOS.PERSONALIZACAO_PUBLICAR_COR_SEM_CONTRASTE,
      detalhes: { sugestao: '#A88400' },
    });
    expect(personalizacoes.porRestaurante.size).toBe(0);
  });

  it('recusa link que não é do Google', async () => {
    const personalizacoes = new PersonalizacoesEmMemoria();
    const resultado = await publicarPersonalizacao({ personalizacoes }, DONO, {
      ...DADOS,
      linkAvaliacaoGoogle: 'https://avaliacoes-falsas.com/google',
    });
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.PERSONALIZACAO_PUBLICAR_LINK_INVALIDO);
  });

  it('cozinha não publica', async () => {
    const personalizacoes = new PersonalizacoesEmMemoria();
    const resultado = await publicarPersonalizacao(
      { personalizacoes },
      { restauranteId: 'r1', papel: 'cozinha' },
      DADOS,
    );
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.PERSONALIZACAO_PUBLICAR_SEM_PERMISSAO);
  });

  it('consultar sem personalização gravada: erro inesperado', async () => {
    await expect(
      consultarPersonalizacao({ personalizacoes: new PersonalizacoesEmMemoria() }, DONO),
    ).rejects.toMatchObject({ codigo: CODIGOS.PERSONALIZACAO_CONSULTAR_AUSENTE });
  });
});
