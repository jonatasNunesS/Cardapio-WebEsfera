import type { CartoesDeQr, DadosDoCartao } from '@cardapio/aplicacao';
import qrcode from 'qrcode-generator';
import sharp from 'sharp';
import { ZipFile } from 'yazl';

export const PARAMETROS_DO_CARTAO = {
  largura: 800,
  altura: 1040,
  topoDoQr: 250,
  ladoMaximoDoQr: 600,
  margemEmModulos: 4,
  correcao: 'M',
} as const;

export interface MatrizDoQr {
  readonly modulos: number;
  escuro(linha: number, coluna: number): boolean;
}

export function matrizDoQr(texto: string): MatrizDoQr {
  const qr = qrcode(0, PARAMETROS_DO_CARTAO.correcao);
  qr.addData(texto, 'Byte');
  qr.make();
  return { modulos: qr.getModuleCount(), escuro: (linha, coluna) => qr.isDark(linha, coluna) };
}

export function pixelsDoQr(matriz: MatrizDoQr, tamanhoDoModulo: number) {
  const margem = PARAMETROS_DO_CARTAO.margemEmModulos;
  const lado = (matriz.modulos + margem * 2) * tamanhoDoModulo;
  const pixels = Buffer.alloc(lado * lado, 255);
  for (let y = 0; y < lado; y += 1) {
    const linha = Math.floor(y / tamanhoDoModulo) - margem;
    for (let x = 0; x < lado; x += 1) {
      const coluna = Math.floor(x / tamanhoDoModulo) - margem;
      const dentro = linha >= 0 && coluna >= 0 && linha < matriz.modulos && coluna < matriz.modulos;
      if (dentro && matriz.escuro(linha, coluna)) {
        pixels[y * lado + x] = 0;
      }
    }
  }
  return { pixels, lado };
}

function escaparXml(texto: string): string {
  return texto.replace(/[<>&"']/g, (caractere) => `&#${String(caractere.charCodeAt(0))};`);
}

function textoDoCartao(dados: DadosDoCartao): Buffer {
  const { largura, altura } = PARAMETROS_DO_CARTAO;
  const nomeDaMesa = dados.nomeDaMesa === null ? '' : escaparXml(dados.nomeDaMesa);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${String(largura)}" height="${String(altura)}">
  <style>text { font-family: 'DejaVu Sans', sans-serif; fill: rgb(31 26 23); text-anchor: middle; }</style>
  <text x="${String(largura / 2)}" y="80" font-size="36">${escaparXml(dados.nomeDoRestaurante)}</text>
  <text x="${String(largura / 2)}" y="170" font-size="72" font-weight="bold">Mesa ${String(dados.numero)}</text>
  <text x="${String(largura / 2)}" y="215" font-size="28">${nomeDaMesa}</text>
  <text x="${String(largura / 2)}" y="${String(altura - 60)}" font-size="28">Aponte a câmera para ver o cardápio</text>
</svg>`;
  return Buffer.from(svg);
}

export async function gerarCartao(dados: DadosDoCartao): Promise<Buffer> {
  const { largura, altura, topoDoQr, ladoMaximoDoQr, margemEmModulos } = PARAMETROS_DO_CARTAO;
  const matriz = matrizDoQr(dados.link);
  const tamanhoDoModulo = Math.floor(ladoMaximoDoQr / (matriz.modulos + margemEmModulos * 2));
  const { pixels, lado } = pixelsDoQr(matriz, tamanhoDoModulo);
  const qr = await sharp(pixels, { raw: { width: lado, height: lado, channels: 1 } })
    .png()
    .toBuffer();
  return sharp({
    create: { width: largura, height: altura, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([
      { input: qr, top: topoDoQr, left: Math.floor((largura - lado) / 2) },
      { input: textoDoCartao(dados), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}

async function adicionarCartoes(zip: ZipFile, cartoes: readonly DadosDoCartao[]): Promise<void> {
  for (const cartao of cartoes) {
    zip.addBuffer(await gerarCartao(cartao), `mesa-${String(cartao.numero)}.png`, { compress: false });
  }
  zip.end();
}

async function* lerZip(cartoes: readonly DadosDoCartao[]): AsyncIterable<Uint8Array> {
  const zip = new ZipFile();
  const saida = zip.outputStream as NodeJS.ReadableStream & { destroy(erro?: Error): void };
  adicionarCartoes(zip, cartoes).catch((erro: unknown) => {
    saida.destroy(erro instanceof Error ? erro : new Error(String(erro)));
  });
  for await (const parte of saida) {
    yield typeof parte === 'string' ? Buffer.from(parte) : parte;
  }
}

export const cartoesDeQr: CartoesDeQr = {
  cartao: gerarCartao,
  zip: lerZip,
};
