import { criarCategoria, criarPrato, type RepositorioDeMidias } from '@cardapio/aplicacao';
import type { Derivados } from '@cardapio/dominio';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AcessoAoBanco } from '../banco.ts';
import { criarFonteDoCardapioPublico } from '../cardapio/fonte-do-cardapio-publico.ts';
import { criarRepositorioDoCardapio } from '../cardapio/repositorio-do-cardapio.ts';
import { criarRepositorioDeMidias } from '../midia/repositorio-de-midias.ts';
import { abrirBanco, consultarComoAdmin, criarRestauranteDeTeste } from './apoio.ts';

function derivadosDe(restauranteId: string, midiaId: string): Derivados {
  const prefixo = `r/${restauranteId}/midias/${midiaId}/`;
  return {
    tipo: 'video',
    capa: { caminho: `${prefixo}capa.jpg`, bytes: 30_000 },
    mp4: { caminho: `${prefixo}video.mp4`, bytes: 400_000 },
    webm: { caminho: `${prefixo}video.webm`, bytes: 380_000 },
    duracaoMs: 10_000,
    imagem: {
      largura: 1280,
      altura: 720,
      variantes: [{ caminho: `${prefixo}imagem-320.webp`, bytes: 9000, formato: 'webp', largura: 320 }],
    },
  };
}

async function eventos(restauranteId: string) {
  return consultarComoAdmin<{ tipo_evento: string; carga: { midiaId: string; tentativa?: number } }>(
    `SELECT tipo_evento, carga FROM caixa_saida WHERE restaurante_id = $1 AND tipo_evento LIKE 'Midia%' ORDER BY criado_em, id`,
    [restauranteId],
  );
}

async function versaoDoCardapio(restauranteId: string): Promise<number> {
  const [linha] = await consultarComoAdmin<{ versao: string }>(
    'SELECT versao_cardapio AS versao FROM restaurantes WHERE id = $1',
    [restauranteId],
  );
  return Number(linha?.versao);
}

describe('mídias no Postgres', () => {
  let banco: AcessoAoBanco;
  let midias: RepositorioDeMidias;

  beforeAll(() => {
    banco = abrirBanco('worker');
    midias = criarRepositorioDeMidias(banco);
  });

  afterAll(async () => {
    await banco.encerrar();
  });

  async function pratoDeTeste() {
    const restaurante = await criarRestauranteDeTeste(banco);
    const acesso = { restauranteId: restaurante.id, papel: 'dono' } as const;
    const dependencias = { cardapio: criarRepositorioDoCardapio(banco) };
    const categoria = await criarCategoria(dependencias, acesso, { nome: 'Principais' });
    const prato = await criarPrato(dependencias, acesso, {
      categoriaId: categoria.ok ? categoria.valor.id : '',
      nome: 'Costela',
      descricao: '',
      precoCentavos: 8900,
      disponivel: true,
      destaque: false,
    });
    return { restauranteId: restaurante.id, pratoId: prato.ok ? prato.valor.id : '' };
  }

  async function processando(restauranteId: string, pratoId: string) {
    const criacao = await midias.criar(restauranteId, {
      pratoId,
      tipo: 'video',
      tipoConteudo: 'video/mp4',
      tamanhoBytes: 5_000_000,
    });
    if (criacao.tipo !== 'criada') {
      throw new Error('prato inexistente');
    }
    const tentativa = await midias.solicitarProcessamento(restauranteId, criacao.midiaId, 'enviando');
    return { midiaId: criacao.midiaId, tentativa: tentativa ?? 0 };
  }

  it('ciclo completo: enviando, processando (evento na outbox), pronta e publicada no prato', async () => {
    const { restauranteId, pratoId } = await pratoDeTeste();
    const { midiaId, tentativa } = await processando(restauranteId, pratoId);
    const versaoAntes = await versaoDoCardapio(restauranteId);

    expect(tentativa).toBe(1);
    expect(await eventos(restauranteId)).toEqual([
      { tipo_evento: 'MidiaEnviada', carga: { versao: 1, midiaId, tentativa: 1 } },
    ]);
    expect((await midias.iniciarProcessamento(restauranteId, midiaId, 1))?.caminhoOriginal).toBe(
      `r/${restauranteId}/midias/${midiaId}/original`,
    );
    expect(await midias.concluir(restauranteId, midiaId, 1, derivadosDe(restauranteId, midiaId))).toBe(
      'publicada',
    );
    expect(await versaoDoCardapio(restauranteId)).toBeGreaterThan(versaoAntes);

    const doPrato = await midias.listarDoPrato(restauranteId, pratoId);
    expect(doPrato?.atual).toMatchObject({ id: midiaId, situacao: 'pronta', derivados: { tipo: 'video' } });
    expect(doPrato?.pendente).toBeNull();
    const publico = await criarFonteDoCardapioPublico(banco).ler(restauranteId);
    expect(publico.midias[pratoId]).toEqual(derivadosDe(restauranteId, midiaId));
  });

  it('job de tentativa antiga não inicia nem conclui; falhar só vale para a tentativa atual', async () => {
    const { restauranteId, pratoId } = await pratoDeTeste();
    const { midiaId } = await processando(restauranteId, pratoId);

    expect(await midias.iniciarProcessamento(restauranteId, midiaId, 2)).toBeNull();
    expect(await midias.concluir(restauranteId, midiaId, 2, derivadosDe(restauranteId, midiaId))).toBe(
      'obsoleta',
    );
    expect(await midias.falhar(restauranteId, midiaId, 2, 'sem_video')).toBe(false);
    expect(await midias.falhar(restauranteId, midiaId, 1, 'sem_video')).toBe(true);
    expect(await midias.solicitarProcessamento(restauranteId, midiaId, 'falhou')).toBe(2);
    expect(await midias.obter(restauranteId, midiaId)).toMatchObject({
      situacao: 'processando',
      motivoFalha: null,
    });
  });

  it('trocar: a nova pronta substitui a antiga, que é descartada com evento para a limpeza', async () => {
    const { restauranteId, pratoId } = await pratoDeTeste();
    const antiga = await processando(restauranteId, pratoId);
    await midias.concluir(restauranteId, antiga.midiaId, 1, derivadosDe(restauranteId, antiga.midiaId));
    const nova = await processando(restauranteId, pratoId);

    expect((await midias.listarDoPrato(restauranteId, pratoId))?.pendente?.id).toBe(nova.midiaId);
    expect(
      await midias.concluir(restauranteId, nova.midiaId, 1, derivadosDe(restauranteId, nova.midiaId)),
    ).toBe('publicada');
    expect(await midias.obter(restauranteId, antiga.midiaId)).toMatchObject({ descartada: true });
    expect((await eventos(restauranteId)).map((evento) => evento.tipo_evento)).toEqual([
      'MidiaEnviada',
      'MidiaEnviada',
      'MidiaDescartada',
    ]);
  });

  it('envio novo antes de processar descarta o pendente; remover descarta tudo e limpa o prato', async () => {
    const { restauranteId, pratoId } = await pratoDeTeste();
    const primeira = await processando(restauranteId, pratoId);
    const segunda = await processando(restauranteId, pratoId);
    await midias.concluir(restauranteId, segunda.midiaId, 1, derivadosDe(restauranteId, segunda.midiaId));

    expect(await midias.obter(restauranteId, primeira.midiaId)).toMatchObject({ descartada: true });
    expect(await midias.removerDoPrato(restauranteId, pratoId)).toBe(true);
    expect(await midias.listarDoPrato(restauranteId, pratoId)).toEqual({ atual: null, pendente: null });
    expect((await criarFonteDoCardapioPublico(banco).ler(restauranteId)).midias).toEqual({});
    const descartadas = (await eventos(restauranteId)).filter(
      (evento) => evento.tipo_evento === 'MidiaDescartada',
    );
    expect(descartadas.map((evento) => evento.carga.midiaId).sort()).toEqual(
      [primeira.midiaId, segunda.midiaId].sort(),
    );
  });

  it('mídia removida durante o processamento não volta ao prato e gera novo evento de limpeza', async () => {
    const { restauranteId, pratoId } = await pratoDeTeste();
    const { midiaId } = await processando(restauranteId, pratoId);
    await midias.iniciarProcessamento(restauranteId, midiaId, 1);
    await midias.removerDoPrato(restauranteId, pratoId);

    expect(await midias.concluir(restauranteId, midiaId, 1, derivadosDe(restauranteId, midiaId))).toBe(
      'descartada',
    );
    expect((await midias.listarDoPrato(restauranteId, pratoId))?.atual).toBeNull();
    const descartes = (await eventos(restauranteId)).filter(
      (evento) => evento.tipo_evento === 'MidiaDescartada',
    );
    expect(descartes).toHaveLength(2);
  });

  it('isolamento: B não lê, não processa e não remove a mídia de A, nem cria mídia no prato de A', async () => {
    const a = await pratoDeTeste();
    const b = await pratoDeTeste();
    const { midiaId } = await processando(a.restauranteId, a.pratoId);

    expect(await midias.obter(b.restauranteId, midiaId)).toBeNull();
    expect(await midias.iniciarProcessamento(b.restauranteId, midiaId, 1)).toBeNull();
    expect(await midias.falhar(b.restauranteId, midiaId, 1, 'sem_video')).toBe(false);
    expect(await midias.listarDoPrato(b.restauranteId, a.pratoId)).toBeNull();
    expect(await midias.removerDoPrato(b.restauranteId, a.pratoId)).toBe(false);
    expect(
      await midias.criar(b.restauranteId, {
        pratoId: a.pratoId,
        tipo: 'foto',
        tipoConteudo: 'image/jpeg',
        tamanhoBytes: 1,
      }),
    ).toEqual({ tipo: 'prato-inexistente' });
    expect(await midias.obter(a.restauranteId, midiaId)).toMatchObject({ situacao: 'processando' });
  });

  it('o banco recusa caminho de outro restaurante, apagar de verdade e original já apagado reprocessado', async () => {
    const a = await pratoDeTeste();
    const b = await pratoDeTeste();
    const { midiaId } = await processando(a.restauranteId, a.pratoId);

    await expect(
      banco.comRestaurante(a.restauranteId, (transacao) =>
        transacao.execute(sql`
          INSERT INTO midias (restaurante_id, prato_id, tipo, tipo_conteudo, tamanho_bytes, caminho_original)
          VALUES (${a.restauranteId}, ${a.pratoId}, 'foto', 'image/jpeg', 1, ${`r/${b.restauranteId}/midias/x/original`})`),
      ),
    ).rejects.toThrow();
    await expect(
      banco.comRestaurante(a.restauranteId, (transacao) =>
        transacao.execute(sql`DELETE FROM midias WHERE id = ${midiaId}`),
      ),
    ).rejects.toThrow();
    await midias.falhar(a.restauranteId, midiaId, 1, 'erro_no_processamento');
    await midias.marcarOriginalApagado(a.restauranteId, midiaId);
    expect(await midias.solicitarProcessamento(a.restauranteId, midiaId, 'falhou')).toBeNull();
  });
});
