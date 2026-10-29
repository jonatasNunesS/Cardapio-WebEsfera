import { describe, expect, it } from 'vitest';
import { CODIGOS } from '../compartilhado/codigos.ts';
import { ErroInvarianteDominio } from '../compartilhado/erro-invariante-dominio.ts';
import { largurasDaImagem, planejarProcessamento, type SondaDeVideo } from './analise.ts';
import { caminhoDoDerivado, caminhoDoOriginal, pertenceAoRestaurante } from './caminhos.ts';
import { LIMITES_DA_MIDIA, validarEnvio } from './midia.ts';

const RESTAURANTE_A = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const RESTAURANTE_B = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const MIDIA = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a60';

const VIDEO: SondaDeVideo = {
  tipo: 'video',
  formato: 'mov,mp4,m4a,3gp,3g2,mj2',
  temVideo: true,
  duracaoMs: 8000,
  largura: 1920,
  altura: 1080,
};

describe('envio de mídia', () => {
  it('aceita foto e vídeo dos tipos conhecidos, sem diferenciar maiúsculas', () => {
    expect(validarEnvio({ tipoConteudo: 'Video/MP4', tamanhoBytes: 1000 })).toEqual({
      ok: true,
      valor: { tipo: 'video', tipoConteudo: 'video/mp4', tamanhoBytes: 1000 },
    });
    expect(validarEnvio({ tipoConteudo: 'image/webp', tamanhoBytes: 1 }).ok).toBe(true);
  });

  it.each(['image/gif', 'audio/mpeg', 'text/html', 'application/octet-stream', ''])(
    'recusa o tipo %s',
    (tipo) => {
      const resultado = validarEnvio({ tipoConteudo: tipo, tamanhoBytes: 1000 });
      expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.MIDIA_ENVIAR_TIPO_RECUSADO);
    },
  );

  it.each([0, -1, 1.5, LIMITES_DA_MIDIA.tamanhoMaximoBytes + 1, Number.NaN])(
    'recusa o tamanho %s',
    (tamanho) => {
      const resultado = validarEnvio({ tipoConteudo: 'video/mp4', tamanhoBytes: tamanho });
      expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.MIDIA_ENVIAR_TAMANHO_RECUSADO);
    },
  );

  it('aceita exatamente 100 MB', () => {
    expect(validarEnvio({ tipoConteudo: 'video/mp4', tamanhoBytes: 100 * 1024 * 1024 }).ok).toBe(true);
  });
});

describe('caminhos da mídia', () => {
  it('sempre começam pelo restaurante e pela mídia', () => {
    expect(caminhoDoOriginal(RESTAURANTE_A, MIDIA)).toBe(`r/${RESTAURANTE_A}/midias/${MIDIA}/original`);
    expect(caminhoDoDerivado(RESTAURANTE_A, MIDIA, 'imagem-640.avif')).toBe(
      `r/${RESTAURANTE_A}/midias/${MIDIA}/imagem-640.avif`,
    );
  });

  it('distingue o caminho de outro restaurante', () => {
    const caminho = caminhoDoOriginal(RESTAURANTE_A, MIDIA);
    expect(pertenceAoRestaurante(caminho, RESTAURANTE_A)).toBe(true);
    expect(pertenceAoRestaurante(caminho, RESTAURANTE_B)).toBe(false);
  });

  it.each(['../outro', `${RESTAURANTE_A}/x`, '', RESTAURANTE_A.toUpperCase()])(
    'recusa identificador fora do padrão (%s)',
    (id) => {
      expect(() => caminhoDoOriginal(id, MIDIA)).toThrow(ErroInvarianteDominio);
      expect(() => caminhoDoOriginal(RESTAURANTE_A, id)).toThrow(ErroInvarianteDominio);
    },
  );
});

describe('plano de processamento', () => {
  it('vídeo curto não é cortado', () => {
    expect(planejarProcessamento('video', VIDEO)).toEqual({
      ok: true,
      valor: { tipo: 'video', duracaoMs: 8000, cortar: false },
    });
  });

  it('vídeo de 10 a 60 s é cortado em 10 s', () => {
    expect(planejarProcessamento('video', { ...VIDEO, duracaoMs: 45_000 })).toEqual({
      ok: true,
      valor: { tipo: 'video', duracaoMs: 10_000, cortar: true },
    });
  });

  it.each([
    ['sem faixa de vídeo (só áudio)', { ...VIDEO, temVideo: false }, 'sem_video'],
    ['só áudio, sem dimensões', { ...VIDEO, temVideo: false, largura: 0, altura: 0 }, 'sem_video'],
    ['acima de 60 s', { ...VIDEO, duracaoMs: 60_001 }, 'longo_demais'],
    ['sem duração', { ...VIDEO, duracaoMs: null }, 'tipo_nao_reconhecido'],
    ['formato desconhecido', { ...VIDEO, formato: 'mp3' }, 'tipo_nao_reconhecido'],
    ['resolução enorme', { ...VIDEO, largura: 9000 }, 'resolucao_invalida'],
  ] as const)('recusa vídeo %s', (_caso, sonda, motivo) => {
    expect(planejarProcessamento('video', sonda)).toEqual({ ok: false, erro: motivo });
  });

  it('recusa arquivo que não é mídia (sonda vazia)', () => {
    expect(planejarProcessamento('foto', null)).toEqual({ ok: false, erro: 'tipo_nao_reconhecido' });
  });

  it('recusa quando o conteúdo real diverge do tipo declarado', () => {
    expect(planejarProcessamento('foto', VIDEO)).toEqual({ ok: false, erro: 'tipo_divergente' });
  });

  it('foto gera as larguras que cabem no original', () => {
    expect(
      planejarProcessamento('foto', { tipo: 'foto', formato: 'jpeg', largura: 1000, altura: 800 }),
    ).toEqual({
      ok: true,
      valor: { tipo: 'foto', larguras: [320, 640, 960] },
    });
    expect(largurasDaImagem(200)).toEqual([200]);
    expect(largurasDaImagem(4000)).toEqual([320, 640, 960, 1280]);
  });

  it('recusa foto em formato fora da lista', () => {
    expect(
      planejarProcessamento('foto', { tipo: 'foto', formato: 'svg', largura: 100, altura: 100 }),
    ).toEqual({
      ok: false,
      erro: 'tipo_nao_reconhecido',
    });
  });
});
