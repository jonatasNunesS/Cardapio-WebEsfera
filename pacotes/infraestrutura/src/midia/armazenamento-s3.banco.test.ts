import { CODIGOS, ErroDependenciaExterna } from '@cardapio/aplicacao';
import { caminhoDoDerivado, caminhoDoOriginal, prefixoDaMidia } from '@cardapio/dominio';
import { request } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarArmazenamentoS3, type ArmazenamentoS3 } from './armazenamento-s3.ts';
import { ARMAZENAMENTO_DE_TESTE, ENDERECO_WEB_DE_TESTE } from './testes/armazenamento-de-teste.ts';

const A = uuidv7();
const B = uuidv7();
const CONTEUDO = 'quinze bytes!!!';

let armazenamento: ArmazenamentoS3;
let pasta: string;

function statusNaWeb(url: string): Promise<number> {
  const endereco = new URL(url);
  return new Promise((resolver, rejeitar) => {
    const pedido = request(
      {
        host: ENDERECO_WEB_DE_TESTE.host,
        port: ENDERECO_WEB_DE_TESTE.porta,
        path: endereco.pathname,
        headers: { host: endereco.hostname },
      },
      (resposta) => {
        resposta.resume();
        resolver(resposta.statusCode ?? 0);
      },
    );
    pedido.on('error', rejeitar);
    pedido.end();
  });
}

async function urlPara(caminho: string, validadeS = 600) {
  return armazenamento.urlDeEnvio({
    caminho,
    tipoConteudo: 'video/mp4',
    tamanhoBytes: CONTEUDO.length,
    validadeS,
  });
}

function enviar(url: string, corpo: string, tipo = 'video/mp4') {
  return fetch(url, { method: 'PUT', body: corpo, headers: { 'content-type': tipo } });
}

beforeAll(async () => {
  armazenamento = criarArmazenamentoS3(ARMAZENAMENTO_DE_TESTE);
  pasta = await mkdtemp(path.join(tmpdir(), 'cardapio-s3-'));
});

afterAll(async () => {
  armazenamento.encerrar();
  await rm(pasta, { recursive: true, force: true });
});

describe('armazenamento S3 (Garage)', () => {
  it('URL assinada aceita o envio exato e o original fica consultável', async () => {
    const caminho = caminhoDoOriginal(A, uuidv7());
    const envio = await urlPara(caminho);

    expect(envio.url).toContain(`/midia-originais/${caminho}?`);
    expect(envio.cabecalhos).toEqual({ 'content-type': 'video/mp4' });
    expect((await enviar(envio.url, CONTEUDO)).status).toBe(200);
    expect(await armazenamento.consultar('originais', caminho)).toEqual({
      tamanhoBytes: CONTEUDO.length,
      tipoConteudo: 'video/mp4',
    });
  });

  it('a URL só vale para o tamanho e o tipo assinados', async () => {
    const envio = await urlPara(caminhoDoOriginal(A, uuidv7()));

    expect((await enviar(envio.url, `${CONTEUDO}mais`)).status).toBe(403);
    expect((await enviar(envio.url, CONTEUDO, 'text/html')).status).toBe(403);
  });

  it('a URL de A não serve para o caminho de B nem para outra mídia de A', async () => {
    const midia = uuidv7();
    const envio = await urlPara(caminhoDoOriginal(A, midia));
    const paraB = envio.url.replace(caminhoDoOriginal(A, midia), caminhoDoOriginal(B, midia));
    const outraMidia = envio.url.replace(midia, uuidv7());

    expect((await enviar(paraB, CONTEUDO)).status).toBe(403);
    expect((await enviar(outraMidia, CONTEUDO)).status).toBe(403);
    expect(await armazenamento.consultar('originais', caminhoDoOriginal(B, midia))).toBeNull();
  });

  it('a URL expira', async () => {
    const envio = await urlPara(caminhoDoOriginal(A, uuidv7()), 1);
    await new Promise((resolver) => setTimeout(resolver, 2100));
    const resposta = await enviar(envio.url, CONTEUDO);

    expect(resposta.status).toBeGreaterThanOrEqual(400);
    expect(resposta.status).toBeLessThan(500);
  });

  it('original é privado; derivado é público com cache longo', async () => {
    const midia = uuidv7();
    const original = caminhoDoOriginal(A, midia);
    const capa = caminhoDoDerivado(A, midia, 'capa.jpg');
    const local = path.join(pasta, 'capa.jpg');
    await writeFile(local, 'jpeg');
    await enviar((await urlPara(original)).url, CONTEUDO);
    await armazenamento.enviar('publica', { caminho: capa, arquivoLocal: local, tipoConteudo: 'image/jpeg' });

    expect(armazenamento.urlPublica(capa)).toBe(`http://midia-publica.web.localhost:3902/${capa}`);
    expect(await statusNaWeb(armazenamento.urlPublica(capa))).toBe(200);
    expect(await statusNaWeb(`http://midia-originais.web.localhost:3902/${original}`)).toBe(404);
    expect(await statusNaWeb(armazenamento.urlPublica(original))).toBe(404);
  });

  it('baixa o original para um arquivo local', async () => {
    const caminho = caminhoDoOriginal(A, uuidv7());
    await enviar((await urlPara(caminho)).url, CONTEUDO);
    const destino = path.join(pasta, 'baixado');
    await armazenamento.baixar('originais', caminho, destino);

    expect(await readFile(destino, 'utf8')).toBe(CONTEUDO);
  });

  it('apagar por prefixo só leva a mídia certa', async () => {
    const midia = uuidv7();
    const vizinha = uuidv7();
    const local = path.join(pasta, 'arquivo');
    await writeFile(local, 'x');
    for (const nome of ['video.mp4', 'video.webm', 'capa.jpg'] as const) {
      await armazenamento.enviar('publica', {
        caminho: caminhoDoDerivado(A, midia, nome),
        arquivoLocal: local,
        tipoConteudo: 'video/mp4',
      });
    }
    await armazenamento.enviar('publica', {
      caminho: caminhoDoDerivado(A, vizinha, 'capa.jpg'),
      arquivoLocal: local,
      tipoConteudo: 'image/jpeg',
    });

    expect(await armazenamento.apagarPrefixo('publica', prefixoDaMidia(A, midia))).toBe(3);
    expect(await armazenamento.consultar('publica', caminhoDoDerivado(A, midia, 'video.mp4'))).toBeNull();
    expect(
      await armazenamento.consultar('publica', caminhoDoDerivado(A, vizinha, 'capa.jpg')),
    ).not.toBeNull();
    expect(await armazenamento.apagarPrefixo('publica', prefixoDaMidia(A, midia))).toBe(0);
  });

  it('falha do provedor vira ErroDependenciaExterna', async () => {
    const fora = criarArmazenamentoS3({ ...ARMAZENAMENTO_DE_TESTE, endpoint: 'http://127.0.0.1:1' });
    const erro = await fora.consultar('originais', caminhoDoOriginal(A, uuidv7())).then(
      () => null,
      (motivo: unknown) => motivo,
    );
    fora.encerrar();

    expect(erro).toBeInstanceOf(ErroDependenciaExterna);
    expect((erro as ErroDependenciaExterna).codigo).toBe(CODIGOS.MIDIA_ARMAZENAMENTO_OPERACAO_FALHOU);
  });
});
