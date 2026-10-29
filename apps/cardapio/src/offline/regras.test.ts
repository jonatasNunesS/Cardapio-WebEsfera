import { describe, expect, it } from 'vitest';
import { cachesAntigos, estrategiaPara, type PedidoObservado } from './regras.ts';

const ORIGEM = 'https://cardapio.webesfera.com.br';
const MIDIA = 'https://midia.webesfera.com.br';

function pedido(parcial: Partial<PedidoObservado>): PedidoObservado {
  return { metodo: 'GET', url: `${ORIGEM}/`, modo: 'cors', destino: '', referencia: '', ...parcial };
}

const estrategia = (parcial: Partial<PedidoObservado>) => estrategiaPara(pedido(parcial), ORIGEM, 'v1');

describe('regras do service worker', () => {
  it('cardápio público fica num cache só daquele restaurante', () => {
    expect(estrategia({ url: `${ORIGEM}/api/v1/cardapios/brasa-e-trigo` })).toEqual({
      tipo: 'cardapio',
      cache: 'cardapio-dados-brasa-e-trigo',
    });
    expect(estrategia({ url: `${ORIGEM}/api/v1/cardapios/outro` })).toEqual({
      tipo: 'cardapio',
      cache: 'cardapio-dados-outro',
    });
  });

  it('nunca guarda a rota da mesa, a busca, consulta com parâmetros nem escrita', () => {
    for (const url of [
      `${ORIGEM}/api/v1/cardapios/brasa/mesa/12?c=Zm9vYmFyX2Jhei1xdXV4MTI`,
      `${ORIGEM}/api/v1/cardapios/brasa/busca?termo=costela`,
      `${ORIGEM}/api/v1/cardapios/brasa?mesa=12`,
      `${ORIGEM}/api/v1/mesas`,
    ]) {
      expect(estrategia({ url })).toEqual({ tipo: 'rede' });
    }
    expect(estrategia({ metodo: 'POST', url: `${ORIGEM}/api/v1/cardapios/brasa` })).toEqual({ tipo: 'rede' });
  });

  it('página e arquivos do app vão para o cache da versão', () => {
    expect(estrategia({ modo: 'navigate', url: `${ORIGEM}/brasa/mesa/12?c=x` })).toEqual({
      tipo: 'pagina',
      cache: 'cardapio-app-v1',
    });
    expect(estrategia({ url: `${ORIGEM}/assets/index-abc.js` })).toEqual({
      tipo: 'arquivo-do-app',
      cache: 'cardapio-app-v1',
    });
  });

  it('imagem pública vai para o cache do restaurante da página; vídeo e outras origens passam direto', () => {
    expect(
      estrategia({
        url: `${MIDIA}/r/1/capa.webp`,
        destino: 'image',
        referencia: `${ORIGEM}/brasa/mesa/12?c=x`,
      }),
    ).toEqual({ tipo: 'imagem', cache: 'cardapio-imagens-brasa' });
    expect(
      estrategia({ url: `${MIDIA}/r/1/video.mp4`, destino: 'video', referencia: `${ORIGEM}/brasa/mesa/12` }),
    ).toEqual({ tipo: 'rede' });
    expect(
      estrategia({
        url: `${MIDIA}/r/1/capa.webp`,
        destino: 'image',
        referencia: 'https://outro.site/brasa/mesa/1',
      }),
    ).toEqual({ tipo: 'rede' });
    expect(estrategia({ url: `${MIDIA}/r/1/capa.webp`, destino: 'image' })).toEqual({ tipo: 'rede' });
  });

  it('na ativação, apaga só os caches de app de versões antigas', () => {
    expect(
      cachesAntigos(
        ['cardapio-app-v0', 'cardapio-app-v1', 'cardapio-dados-brasa', 'cardapio-imagens-brasa'],
        'v1',
      ),
    ).toEqual(['cardapio-app-v0']);
  });
});
