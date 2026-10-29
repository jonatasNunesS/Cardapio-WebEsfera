import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  CODIGOS,
  ErroDependenciaExterna,
  type AreaDoArmazenamento,
  type ArmazenamentoDeMidia,
} from '@cardapio/aplicacao';
import { LIMITES_DA_MIDIA } from '@cardapio/dominio';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface ConfiguracaoDoArmazenamento {
  readonly endpoint: string;
  readonly endpointDeEnvio?: string | undefined;
  readonly regiao: string;
  readonly chave: string;
  readonly segredo: string;
  readonly bucketOriginais: string;
  readonly bucketPublico: string;
  readonly urlPublica: string;
}

const CACHE_DOS_DERIVADOS = 'public, max-age=31536000, immutable';
const LOTE_DE_REMOCAO = 1000;

function criarCliente(configuracao: ConfiguracaoDoArmazenamento, endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: configuracao.regiao,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: configuracao.chave, secretAccessKey: configuracao.segredo },
  });
}

function falha(operacao: string, area: AreaDoArmazenamento, erro: unknown): ErroDependenciaExterna {
  return new ErroDependenciaExterna(
    CODIGOS.MIDIA_ARMAZENAMENTO_OPERACAO_FALHOU,
    'O armazenamento de mídia não respondeu como esperado',
    { modulo: 'midia', casoDeUso: operacao, dados: { area } },
    { provedor: 's3', operacao },
    erro,
  );
}

export interface ArmazenamentoS3 extends ArmazenamentoDeMidia {
  encerrar(): void;
}

export function criarArmazenamentoS3(configuracao: ConfiguracaoDoArmazenamento): ArmazenamentoS3 {
  const cliente = criarCliente(configuracao, configuracao.endpoint);
  const assinante = criarCliente(configuracao, configuracao.endpointDeEnvio ?? configuracao.endpoint);
  const bucket = (area: AreaDoArmazenamento) =>
    area === 'originais' ? configuracao.bucketOriginais : configuracao.bucketPublico;
  const base = configuracao.urlPublica.replace(/\/+$/, '');

  async function executar<T>(
    operacao: string,
    area: AreaDoArmazenamento,
    acao: () => Promise<T>,
  ): Promise<T> {
    try {
      return await acao();
    } catch (erro) {
      throw falha(operacao, area, erro);
    }
  }

  async function listarPagina(area: AreaDoArmazenamento, prefixo: string): Promise<string[]> {
    const pagina = await cliente.send(
      new ListObjectsV2Command({ Bucket: bucket(area), Prefix: prefixo, MaxKeys: LOTE_DE_REMOCAO }),
    );
    return (pagina.Contents ?? []).flatMap((objeto) => (objeto.Key === undefined ? [] : [objeto.Key]));
  }

  async function apagarChaves(area: AreaDoArmazenamento, chaves: readonly string[]): Promise<void> {
    const resposta = await cliente.send(
      new DeleteObjectsCommand({
        Bucket: bucket(area),
        Delete: { Objects: chaves.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if ((resposta.Errors ?? []).length > 0) {
      throw new AggregateError(resposta.Errors ?? [], 'O armazenamento recusou apagar parte dos objetos');
    }
  }

  return {
    async urlDeEnvio(pedido) {
      const comando = new PutObjectCommand({
        Bucket: configuracao.bucketOriginais,
        Key: pedido.caminho,
        ContentType: pedido.tipoConteudo,
        ContentLength: pedido.tamanhoBytes,
      });
      const url = await executar('urlDeEnvio', 'originais', () =>
        getSignedUrl(assinante, comando, {
          expiresIn: pedido.validadeS,
          signableHeaders: new Set(['content-type', 'content-length']),
        }),
      );
      return {
        url,
        cabecalhos: { 'content-type': pedido.tipoConteudo },
        expiraEm: new Date(Date.now() + pedido.validadeS * 1000),
      };
    },
    consultar: (area, caminho) =>
      executar('consultar', area, async () => {
        try {
          const objeto = await cliente.send(new HeadObjectCommand({ Bucket: bucket(area), Key: caminho }));
          return { tamanhoBytes: objeto.ContentLength ?? 0, tipoConteudo: objeto.ContentType ?? null };
        } catch (erro) {
          if (erro instanceof NotFound) {
            return null;
          }
          throw erro;
        }
      }),
    baixar: (area, caminho, arquivoLocal) =>
      executar('baixar', area, async () => {
        const objeto = await cliente.send(new GetObjectCommand({ Bucket: bucket(area), Key: caminho }));
        if ((objeto.ContentLength ?? 0) > LIMITES_DA_MIDIA.tamanhoMaximoBytes) {
          throw new RangeError('Objeto maior que o limite de mídia');
        }
        await pipeline(objeto.Body as Readable, createWriteStream(arquivoLocal));
      }),
    enviar: (area, arquivo) =>
      executar('enviar', area, async () => {
        const { size } = await stat(arquivo.arquivoLocal);
        await cliente.send(
          new PutObjectCommand({
            Bucket: bucket(area),
            Key: arquivo.caminho,
            Body: createReadStream(arquivo.arquivoLocal),
            ContentLength: size,
            ContentType: arquivo.tipoConteudo,
            ...(area === 'publica' ? { CacheControl: CACHE_DOS_DERIVADOS } : {}),
          }),
        );
      }),
    apagar: (area, caminho) =>
      executar('apagar', area, async () => {
        await cliente.send(new DeleteObjectCommand({ Bucket: bucket(area), Key: caminho }));
      }),
    apagarPrefixo: (area, prefixo) =>
      executar('apagarPrefixo', area, async () => {
        let apagados = 0;
        for (
          let chaves = await listarPagina(area, prefixo);
          chaves.length > 0;
          chaves = await listarPagina(area, prefixo)
        ) {
          await apagarChaves(area, chaves);
          apagados += chaves.length;
        }
        return apagados;
      }),
    urlPublica: (caminho) => `${base}/${caminho}`,
    encerrar() {
      cliente.destroy();
      assinante.destroy();
    },
  };
}

export interface VariaveisDoArmazenamento {
  readonly URL_ARMAZENAMENTO: string;
  readonly URL_ENVIO_ARMAZENAMENTO?: string | undefined;
  readonly REGIAO_ARMAZENAMENTO: string;
  readonly CHAVE_ARMAZENAMENTO: string;
  readonly SEGREDO_ARMAZENAMENTO: string;
  readonly BUCKET_ORIGINAIS: string;
  readonly BUCKET_PUBLICO: string;
  readonly URL_PUBLICA_MIDIA: string;
}

export function armazenamentoDoAmbiente(ambiente: VariaveisDoArmazenamento): ArmazenamentoS3 {
  return criarArmazenamentoS3({
    endpoint: ambiente.URL_ARMAZENAMENTO,
    endpointDeEnvio: ambiente.URL_ENVIO_ARMAZENAMENTO,
    regiao: ambiente.REGIAO_ARMAZENAMENTO,
    chave: ambiente.CHAVE_ARMAZENAMENTO,
    segredo: ambiente.SEGREDO_ARMAZENAMENTO,
    bucketOriginais: ambiente.BUCKET_ORIGINAIS,
    bucketPublico: ambiente.BUCKET_PUBLICO,
    urlPublica: ambiente.URL_PUBLICA_MIDIA,
  });
}
