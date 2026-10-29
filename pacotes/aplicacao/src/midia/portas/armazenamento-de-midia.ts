export type AreaDoArmazenamento = 'originais' | 'publica';

export interface PedidoDeUrlDeEnvio {
  readonly caminho: string;
  readonly tipoConteudo: string;
  readonly tamanhoBytes: number;
  readonly validadeS: number;
}

export interface UrlDeEnvio {
  readonly url: string;
  readonly cabecalhos: Readonly<Record<string, string>>;
  readonly expiraEm: Date;
}

export interface ObjetoArmazenado {
  readonly tamanhoBytes: number;
  readonly tipoConteudo: string | null;
}

export interface ArquivoParaEnviar {
  readonly caminho: string;
  readonly arquivoLocal: string;
  readonly tipoConteudo: string;
}

export interface ArmazenamentoDeMidia {
  urlDeEnvio(pedido: PedidoDeUrlDeEnvio): Promise<UrlDeEnvio>;
  consultar(area: AreaDoArmazenamento, caminho: string): Promise<ObjetoArmazenado | null>;
  baixar(area: AreaDoArmazenamento, caminho: string, arquivoLocal: string): Promise<void>;
  enviar(area: AreaDoArmazenamento, arquivo: ArquivoParaEnviar): Promise<void>;
  apagar(area: AreaDoArmazenamento, caminho: string): Promise<void>;
  apagarPrefixo(area: AreaDoArmazenamento, prefixo: string): Promise<number>;
  urlPublica(caminho: string): string;
}
