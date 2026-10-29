import { beforeEach, describe, expect, it } from 'vitest';
import {
  ArmazenamentoEmMemoria,
  FilaDeTeste,
  idDeTeste,
  MidiasEmMemoria,
  pastaDeTeste,
  ProcessadorFalso,
} from '../../testes/midia-em-memoria.ts';
import { apagarOriginalDaMidia } from './apagar-original-da-midia.ts';
import { descartarMidia } from './descartar-midia.ts';
import { processarMidia } from './processar-midia.ts';
import { registrarFalhaDoProcessamento } from './registrar-falha-do-processamento.ts';

const A = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4aaa';
const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

let midias: MidiasEmMemoria;
let armazenamento: ArmazenamentoEmMemoria;
let processador: ProcessadorFalso;
let filas: FilaDeTeste;
let pratoId: string;

function dependencias() {
  return { midias, armazenamento, processador, filas, pasta: pastaDeTeste };
}

async function emProcessamento(tipo: 'foto' | 'video' = 'video') {
  const criacao = await midias.criar(A, {
    pratoId,
    tipo,
    tipoConteudo: tipo === 'foto' ? 'image/jpeg' : 'video/mp4',
    tamanhoBytes: 1000,
  });
  const midiaId = criacao.tipo === 'criada' ? criacao.midiaId : '';
  armazenamento.objetos.originais.set(criacao.tipo === 'criada' ? criacao.caminhoOriginal : '', {
    tamanhoBytes: 1000,
    tipoConteudo: 'video/mp4',
  });
  const tentativa = (await midias.solicitarProcessamento(A, midiaId, 'enviando')) ?? 0;
  return { restauranteId: A, midiaId, tentativa };
}

beforeEach(() => {
  midias = new MidiasEmMemoria();
  armazenamento = new ArmazenamentoEmMemoria();
  processador = new ProcessadorFalso();
  filas = new FilaDeTeste();
  pratoId = idDeTeste();
  midias.adicionarPrato(A, pratoId);
});

describe('processar mídia', () => {
  it('vídeo de 15 s: corta em 10 s, sobe os derivados, publica no prato e agenda o original para 7 dias', async () => {
    const pedido = await emProcessamento();
    const desfecho = await processarMidia(dependencias(), pedido);

    expect(desfecho).toBe('publicada');
    expect(processador.planos).toEqual([{ tipo: 'video', duracaoMs: 10_000, cortar: true }]);
    const prefixo = `r/${A}/midias/${pedido.midiaId}/`;
    expect([...armazenamento.objetos.publica.keys()].sort()).toEqual(
      ['capa.jpg', 'imagem-320.avif', 'imagem-320.webp', 'video.mp4', 'video.webm'].map(
        (nome) => prefixo + nome,
      ),
    );
    expect(await midias.obter(A, pedido.midiaId)).toMatchObject({ situacao: 'pronta' });
    expect(midias.pratos.get(pratoId)?.midiaId).toBe(pedido.midiaId);
    expect(filas.pedidos).toEqual([
      {
        nome: 'apagar-original-midia',
        idDoJob: `apagar-original-${pedido.midiaId}`,
        dados: { midiaId: pedido.midiaId },
        restauranteId: A,
        atrasoMs: SETE_DIAS_MS,
      },
    ]);
  });

  it('foto gera AVIF e WebP nas larguras planejadas', async () => {
    processador.sonda = { tipo: 'foto', formato: 'jpeg', largura: 1000, altura: 800 };
    const pedido = await emProcessamento('foto');
    await processarMidia(dependencias(), pedido);

    const midia = await midias.obter(A, pedido.midiaId);
    expect(midia?.derivados?.tipo).toBe('foto');
    expect(
      midia?.derivados?.imagem.variantes.map((variante) => `${variante.formato}-${String(variante.largura)}`),
    ).toEqual(['avif-320', 'webp-320', 'avif-640', 'webp-640']);
  });

  it.each([
    [
      'só áudio',
      { tipo: 'video', formato: 'mp4', temVideo: false, duracaoMs: 5000, largura: 0, altura: 0 },
      'sem_video',
    ],
    [
      'acima de 60 s',
      { tipo: 'video', formato: 'mp4', temVideo: true, duracaoMs: 90_000, largura: 640, altura: 360 },
      'longo_demais',
    ],
    ['tipo errado', null, 'tipo_nao_reconhecido'],
  ] as const)(
    'arquivo ruim (%s) vira falhou, sem subir nada e sem tocar no prato',
    async (_caso, sonda, motivo) => {
      processador.sonda = sonda;
      const pedido = await emProcessamento();

      expect(await processarMidia(dependencias(), pedido)).toBe('recusada');
      expect(await midias.obter(A, pedido.midiaId)).toMatchObject({
        situacao: 'falhou',
        motivoFalha: motivo,
      });
      expect(armazenamento.objetos.publica.size).toBe(0);
      expect(midias.pratos.get(pratoId)?.midiaId).toBeNull();
    },
  );

  it('derivado acima de 600 KB é recusado', async () => {
    processador.bytesDoVideo = 700 * 1024;
    const pedido = await emProcessamento();
    expect(await processarMidia(dependencias(), pedido)).toBe('recusada');
    expect(await midias.obter(A, pedido.midiaId)).toMatchObject({ motivoFalha: 'derivado_grande_demais' });
  });

  it('reprocessar a mesma mídia e tentativa é ignorado: não duplica derivados nem agendamentos', async () => {
    const pedido = await emProcessamento();
    await processarMidia(dependencias(), pedido);
    const antes = [...armazenamento.objetos.publica.keys()];

    expect(await processarMidia(dependencias(), pedido)).toBe('ignorado');
    expect([...armazenamento.objetos.publica.keys()]).toEqual(antes);
    expect(filas.pedidos).toHaveLength(1);
  });

  it('job de tentativa antiga é ignorado', async () => {
    const pedido = await emProcessamento();
    expect(await processarMidia(dependencias(), { ...pedido, tentativa: pedido.tentativa + 1 })).toBe(
      'ignorado',
    );
    expect(processador.planos).toEqual([]);
  });

  it('falha do armazenamento sobe o erro para a fila tentar de novo; na última, a mídia vira falhou', async () => {
    armazenamento.falharAoEnviar = true;
    const pedido = await emProcessamento();

    await expect(processarMidia(dependencias(), pedido)).rejects.toThrow('armazenamento fora do ar');
    expect(await midias.obter(A, pedido.midiaId)).toMatchObject({ situacao: 'processando' });
    expect(await registrarFalhaDoProcessamento(dependencias(), pedido)).toBe(true);
    expect(await midias.obter(A, pedido.midiaId)).toMatchObject({
      situacao: 'falhou',
      motivoFalha: 'erro_no_processamento',
    });
  });

  it('trocar: a nova mídia pronta substitui a antiga, que vai para a limpeza e some do armazenamento', async () => {
    const primeira = await emProcessamento();
    await processarMidia(dependencias(), primeira);
    const segunda = await emProcessamento();
    await processarMidia(dependencias(), segunda);

    expect(midias.pratos.get(pratoId)?.midiaId).toBe(segunda.midiaId);
    expect(midias.eventos).toContainEqual({
      restauranteId: A,
      tipo: 'MidiaDescartada',
      midiaId: primeira.midiaId,
    });
    const apagados = await descartarMidia(dependencias(), primeira);
    expect(apagados).toBe(6);
    const restantes = [...armazenamento.objetos.publica.keys(), ...armazenamento.objetos.originais.keys()];
    expect(restantes.some((caminho) => caminho.includes(primeira.midiaId))).toBe(false);
    expect(restantes.some((caminho) => caminho.includes(segunda.midiaId))).toBe(true);
  });

  it('mídia removida durante o processamento não é publicada e volta para a limpeza', async () => {
    const pedido = await emProcessamento();
    processador.aoGerar = () => midias.removerDoPrato(A, pratoId);

    expect(await processarMidia(dependencias(), pedido)).toBe('descartada');
    expect(midias.pratos.get(pratoId)?.midiaId).toBeNull();
    const descartes = midias.eventos.filter((evento) => evento.tipo === 'MidiaDescartada');
    expect(descartes).toEqual([
      { restauranteId: A, tipo: 'MidiaDescartada', midiaId: pedido.midiaId },
      { restauranteId: A, tipo: 'MidiaDescartada', midiaId: pedido.midiaId },
    ]);
    expect(filas.pedidos).toEqual([]);
  });
});

describe('limpeza', () => {
  it('descartar só apaga mídia marcada como descartada', async () => {
    const pedido = await emProcessamento();
    await processarMidia(dependencias(), pedido);
    expect(await descartarMidia(dependencias(), pedido)).toBeNull();
    expect(armazenamento.objetos.publica.size).toBeGreaterThan(0);
  });

  it('apagar o original só depois de pronta, uma vez, e mantém os derivados', async () => {
    const pedido = await emProcessamento();
    expect(await apagarOriginalDaMidia(dependencias(), pedido)).toBe(false);
    await processarMidia(dependencias(), pedido);

    expect(await apagarOriginalDaMidia(dependencias(), pedido)).toBe(true);
    expect(await apagarOriginalDaMidia(dependencias(), pedido)).toBe(false);
    expect(armazenamento.objetos.originais.size).toBe(0);
    expect(armazenamento.objetos.publica.size).toBe(5);
  });
});
