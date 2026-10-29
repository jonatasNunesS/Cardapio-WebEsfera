import jsqr from 'jsqr';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { geradorDeCodigoDeMesa } from './adaptadores.ts';
import { cartoesDeQr, gerarCartao, matrizDoQr, PARAMETROS_DO_CARTAO } from './cartoes-de-qr.ts';

const LINK = 'https://cardapio.webesfera.com.br/brasa-e-trigo/mesa/12?c=Zm9vYmFyX2Jhei1xdXV4MTI';

async function lerQr(png: Uint8Array): Promise<string | null> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsqr.default(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}

interface ArquivoDoZip {
  readonly nome: string;
  readonly conteudo: Buffer;
}

function lerZipSemCompressao(zip: Buffer): ArquivoDoZip[] {
  const arquivos: ArquivoDoZip[] = [];
  let posicao = zip.indexOf('PK\u0003\u0004', 0, 'latin1');
  while (posicao >= 0 && posicao < zip.length) {
    const tamanho = zip.readUInt32LE(posicao + 18);
    const tamanhoDoNome = zip.readUInt16LE(posicao + 26);
    const tamanhoExtra = zip.readUInt16LE(posicao + 28);
    const inicio = posicao + 30 + tamanhoDoNome + tamanhoExtra;
    arquivos.push({
      nome: zip.toString('utf8', posicao + 30, posicao + 30 + tamanhoDoNome),
      conteudo: zip.subarray(inicio, inicio + tamanho),
    });
    posicao = zip.indexOf('PK\u0003\u0004', inicio + tamanho, 'latin1');
  }
  return arquivos;
}

describe('QR e cartão da mesa', () => {
  it('o cartão PNG decodifica de volta no link exato', async () => {
    const png = await gerarCartao({
      link: LINK,
      numero: 12,
      nomeDaMesa: 'Varanda',
      nomeDoRestaurante: 'Brasa & Trigo',
    });
    const meta = await sharp(png).metadata();

    expect(meta.format).toBe('png');
    expect({ largura: meta.width, altura: meta.height }).toEqual({
      largura: PARAMETROS_DO_CARTAO.largura,
      altura: PARAMETROS_DO_CARTAO.altura,
    });
    expect(await lerQr(png)).toBe(LINK);
  });

  it('o QR usa correção M e o logo fica fora do código (área do QR só preta e branca)', async () => {
    const png = await gerarCartao({ link: LINK, numero: 1, nomeDaMesa: null, nomeDoRestaurante: 'Brasa' });
    const lado =
      (matrizDoQr(LINK).modulos + PARAMETROS_DO_CARTAO.margemEmModulos * 2) *
      Math.floor(PARAMETROS_DO_CARTAO.ladoMaximoDoQr / (matrizDoQr(LINK).modulos + 8));
    const recorte = await sharp(png)
      .extract({
        left: Math.floor((PARAMETROS_DO_CARTAO.largura - lado) / 2),
        top: PARAMETROS_DO_CARTAO.topoDoQr,
        width: lado,
        height: lado,
      })
      .greyscale()
      .raw()
      .toBuffer();

    expect(PARAMETROS_DO_CARTAO.correcao).toBe('M');
    expect(new Set(recorte)).toEqual(new Set([0, 255]));
    expect(
      await lerQr(
        await sharp(recorte, { raw: { width: lado, height: lado, channels: 1 } })
          .png()
          .toBuffer(),
      ),
    ).toBe(LINK);
  });

  it('o ZIP traz um PNG por mesa, cada um com o seu link', async () => {
    const mesas = [3, 7, 12].map((numero) => ({
      link: `${LINK.split('/mesa/')[0] ?? ''}/mesa/${String(numero)}?c=${geradorDeCodigoDeMesa.gerar()}`,
      numero,
      nomeDaMesa: null,
      nomeDoRestaurante: 'Brasa',
    }));
    const partes: Uint8Array[] = [];
    for await (const parte of cartoesDeQr.zip(mesas)) {
      partes.push(parte);
    }
    const arquivos = lerZipSemCompressao(Buffer.concat(partes));

    expect(arquivos.map((arquivo) => arquivo.nome)).toEqual(['mesa-3.png', 'mesa-7.png', 'mesa-12.png']);
    for (const [indice, arquivo] of arquivos.entries()) {
      expect(await lerQr(arquivo.conteudo)).toBe(mesas[indice]?.link);
    }
  });

  it('código da mesa: 22 caracteres base64url, sem repetição em 10 mil gerações', () => {
    const codigos = Array.from({ length: 10_000 }, () => geradorDeCodigoDeMesa.gerar());

    expect(codigos.every((codigo) => /^[A-Za-z0-9_-]{22}$/.test(codigo))).toBe(true);
    expect(new Set(codigos).size).toBe(codigos.length);
    const caracteres = new Set(codigos.join(''));
    expect(caracteres.size).toBe(64);
  });
});
