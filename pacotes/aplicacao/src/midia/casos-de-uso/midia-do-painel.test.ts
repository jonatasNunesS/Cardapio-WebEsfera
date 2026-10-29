import { CODIGOS } from '@cardapio/dominio';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AcessoAoRestaurante } from '../../compartilhado/acesso.ts';
import { ArmazenamentoEmMemoria, idDeTeste, MidiasEmMemoria } from '../../testes/midia-em-memoria.ts';
import { confirmarEnvioDeMidia } from './confirmar-envio-de-midia.ts';
import { consultarMidiasDoPrato } from './consultar-midias-do-prato.ts';
import { removerMidiaDoPrato } from './remover-midia-do-prato.ts';
import { solicitarEnvioDeMidia } from './solicitar-envio-de-midia.ts';
import { tentarProcessarMidiaDeNovo } from './tentar-processar-midia-de-novo.ts';

const A = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4aaa';
const B = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4bbb';
const DONO: AcessoAoRestaurante = { restauranteId: A, papel: 'dono' };
const GARCOM: AcessoAoRestaurante = { restauranteId: A, papel: 'garcom' };
const DONO_DE_B: AcessoAoRestaurante = { restauranteId: B, papel: 'dono' };
const VIDEO = { tipoConteudo: 'video/mp4', tamanhoBytes: 5_000_000 };

let midias: MidiasEmMemoria;
let armazenamento: ArmazenamentoEmMemoria;
let pratoId: string;

function dependencias() {
  return { midias, armazenamento };
}

async function enviada(acesso = DONO) {
  const envio = await solicitarEnvioDeMidia(dependencias(), acesso, pratoId, VIDEO);
  if (!envio.ok) {
    throw new Error(envio.erro.codigo);
  }
  const midia = await midias.obter(acesso.restauranteId, envio.valor.midiaId);
  armazenamento.objetos.originais.set(midia?.caminhoOriginal ?? '', {
    tamanhoBytes: VIDEO.tamanhoBytes,
    tipoConteudo: VIDEO.tipoConteudo,
  });
  return envio.valor.midiaId;
}

beforeEach(() => {
  midias = new MidiasEmMemoria();
  armazenamento = new ArmazenamentoEmMemoria();
  pratoId = idDeTeste();
  midias.adicionarPrato(A, pratoId);
});

describe('solicitar envio', () => {
  it('cria a mídia enviando e devolve a URL assinada do caminho do restaurante, válida por 10 min', async () => {
    const resultado = await solicitarEnvioDeMidia(dependencias(), DONO, pratoId, VIDEO);

    expect(resultado.ok).toBe(true);
    const envio = resultado.ok ? resultado.valor : undefined;
    expect(envio?.url).toBe(
      `https://armazenamento.exemplo/r/${A}/midias/${envio?.midiaId ?? ''}/original?validade=600`,
    );
    expect(envio?.cabecalhos).toEqual({ 'content-type': 'video/mp4' });
    expect((await midias.obter(A, envio?.midiaId ?? ''))?.situacao).toBe('enviando');
  });

  it('recusa quem não é dono nem gerente', async () => {
    const resultado = await solicitarEnvioDeMidia(dependencias(), GARCOM, pratoId, VIDEO);
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.MIDIA_EDITAR_SEM_PERMISSAO);
  });

  it('recusa tipo e tamanho fora do aceito', async () => {
    const tipo = await solicitarEnvioDeMidia(dependencias(), DONO, pratoId, {
      ...VIDEO,
      tipoConteudo: 'image/gif',
    });
    const tamanho = await solicitarEnvioDeMidia(dependencias(), DONO, pratoId, {
      ...VIDEO,
      tamanhoBytes: 200e6,
    });
    expect(!tipo.ok && tipo.erro.codigo).toBe(CODIGOS.MIDIA_ENVIAR_TIPO_RECUSADO);
    expect(!tamanho.ok && tamanho.erro.codigo).toBe(CODIGOS.MIDIA_ENVIAR_TAMANHO_RECUSADO);
  });

  it('prato de outro restaurante é como prato inexistente', async () => {
    const resultado = await solicitarEnvioDeMidia(dependencias(), DONO_DE_B, pratoId, VIDEO);
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.CARDAPIO_EDITAR_NAO_ENCONTRADO);
  });

  it('um envio novo descarta o pendente anterior (trocar antes de processar)', async () => {
    const primeira = await enviada();
    const segunda = await enviada();
    expect((await midias.obter(A, primeira))?.descartada).toBe(true);
    expect(midias.eventos).toContainEqual({ restauranteId: A, tipo: 'MidiaDescartada', midiaId: primeira });
    expect((await midias.listarDoPrato(A, pratoId))?.pendente?.id).toBe(segunda);
  });
});

describe('confirmar envio', () => {
  it('com o arquivo no armazenamento, passa a processando e grava o evento para o worker', async () => {
    const midiaId = await enviada();
    const resultado = await confirmarEnvioDeMidia(dependencias(), DONO, midiaId);

    expect(resultado.ok).toBe(true);
    expect(await midias.obter(A, midiaId)).toMatchObject({ situacao: 'processando', tentativa: 1 });
    expect(midias.eventos).toEqual([{ restauranteId: A, tipo: 'MidiaEnviada', midiaId }]);
  });

  it('sem o arquivo, recusa e não enfileira', async () => {
    const envio = await solicitarEnvioDeMidia(dependencias(), DONO, pratoId, VIDEO);
    const midiaId = envio.ok ? envio.valor.midiaId : '';
    const resultado = await confirmarEnvioDeMidia(dependencias(), DONO, midiaId);
    expect(!resultado.ok && resultado.erro.codigo).toBe(CODIGOS.MIDIA_CONFIRMAR_ARQUIVO_AUSENTE);
    expect(midias.eventos).toEqual([]);
  });

  it('arquivo com tamanho ou tipo diferente do declarado é recusado', async () => {
    const midiaId = await enviada();
    const caminho = (await midias.obter(A, midiaId))?.caminhoOriginal ?? '';
    armazenamento.objetos.originais.set(caminho, { tamanhoBytes: 1, tipoConteudo: 'video/mp4' });
    const tamanho = await confirmarEnvioDeMidia(dependencias(), DONO, midiaId);
    armazenamento.objetos.originais.set(caminho, {
      tamanhoBytes: VIDEO.tamanhoBytes,
      tipoConteudo: 'text/html',
    });
    const tipo = await confirmarEnvioDeMidia(dependencias(), DONO, midiaId);

    expect(!tamanho.ok && tamanho.erro.codigo).toBe(CODIGOS.MIDIA_CONFIRMAR_ARQUIVO_DIVERGENTE);
    expect(!tipo.ok && tipo.erro.codigo).toBe(CODIGOS.MIDIA_CONFIRMAR_ARQUIVO_DIVERGENTE);
  });

  it('confirmar duas vezes não enfileira de novo', async () => {
    const midiaId = await enviada();
    await confirmarEnvioDeMidia(dependencias(), DONO, midiaId);
    const segunda = await confirmarEnvioDeMidia(dependencias(), DONO, midiaId);
    expect(!segunda.ok && segunda.erro.codigo).toBe(CODIGOS.MIDIA_EDITAR_SITUACAO_INVALIDA);
    expect(midias.eventos).toHaveLength(1);
  });

  it('mídia de A não existe para B, e o garçom não confirma', async () => {
    const midiaId = await enviada();
    const deB = await confirmarEnvioDeMidia(dependencias(), DONO_DE_B, midiaId);
    const garcom = await confirmarEnvioDeMidia(dependencias(), GARCOM, midiaId);
    expect(!deB.ok && deB.erro.codigo).toBe(CODIGOS.MIDIA_EDITAR_NAO_ENCONTRADA);
    expect(!garcom.ok && garcom.erro.codigo).toBe(CODIGOS.MIDIA_EDITAR_SEM_PERMISSAO);
  });
});

describe('tentar de novo', () => {
  it('só vale para mídia que falhou, e gera uma nova tentativa', async () => {
    const midiaId = await enviada();
    await confirmarEnvioDeMidia(dependencias(), DONO, midiaId);
    const cedo = await tentarProcessarMidiaDeNovo(dependencias(), DONO, midiaId);
    await midias.falhar(A, midiaId, 1, 'erro_no_processamento');
    const depois = await tentarProcessarMidiaDeNovo(dependencias(), DONO, midiaId);

    expect(!cedo.ok && cedo.erro.codigo).toBe(CODIGOS.MIDIA_EDITAR_SITUACAO_INVALIDA);
    expect(depois.ok).toBe(true);
    expect(await midias.obter(A, midiaId)).toMatchObject({
      situacao: 'processando',
      tentativa: 2,
      motivoFalha: null,
    });
  });

  it('recusa sem permissão e mídia de outro restaurante', async () => {
    const midiaId = await enviada();
    const garcom = await tentarProcessarMidiaDeNovo(dependencias(), GARCOM, midiaId);
    const deB = await tentarProcessarMidiaDeNovo(dependencias(), DONO_DE_B, midiaId);
    expect(!garcom.ok && garcom.erro.codigo).toBe(CODIGOS.MIDIA_EDITAR_SEM_PERMISSAO);
    expect(!deB.ok && deB.erro.codigo).toBe(CODIGOS.MIDIA_EDITAR_NAO_ENCONTRADA);
  });
});

describe('remover e consultar', () => {
  it('remover tira a mídia do prato e manda os arquivos para a limpeza', async () => {
    const midiaId = await enviada();
    const resultado = await removerMidiaDoPrato(dependencias(), DONO, pratoId);

    expect(resultado.ok).toBe(true);
    expect(midias.eventos).toContainEqual({ restauranteId: A, tipo: 'MidiaDescartada', midiaId });
    expect(await midias.listarDoPrato(A, pratoId)).toEqual({ atual: null, pendente: null });
  });

  it('remover recusa garçom e prato de outro restaurante', async () => {
    const garcom = await removerMidiaDoPrato(dependencias(), GARCOM, pratoId);
    const deB = await removerMidiaDoPrato(dependencias(), DONO_DE_B, pratoId);
    expect(!garcom.ok && garcom.erro.codigo).toBe(CODIGOS.MIDIA_EDITAR_SEM_PERMISSAO);
    expect(!deB.ok && deB.erro.codigo).toBe(CODIGOS.CARDAPIO_EDITAR_NAO_ENCONTRADO);
  });

  it('consulta mostra a pendente com a situação e o motivo', async () => {
    const midiaId = await enviada();
    await confirmarEnvioDeMidia(dependencias(), DONO, midiaId);
    await midias.falhar(A, midiaId, 1, 'sem_video');
    const resultado = await consultarMidiasDoPrato(dependencias(), DONO, pratoId);

    expect(resultado.ok && resultado.valor).toEqual({
      atual: null,
      pendente: { id: midiaId, tipo: 'video', situacao: 'falhou', motivoFalha: 'sem_video', publicada: null },
    });
  });

  it('consulta recusa garçom e prato de outro restaurante', async () => {
    const garcom = await consultarMidiasDoPrato(dependencias(), GARCOM, pratoId);
    const deB = await consultarMidiasDoPrato(dependencias(), DONO_DE_B, pratoId);
    expect(!garcom.ok && garcom.erro.codigo).toBe(CODIGOS.MIDIA_EDITAR_SEM_PERMISSAO);
    expect(!deB.ok && deB.erro.codigo).toBe(CODIGOS.CARDAPIO_EDITAR_NAO_ENCONTRADO);
  });
});
