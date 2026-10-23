import type {
  MotivoDaRecusa,
  NomeDoDerivado,
  PlanoDeProcessamento,
  Resultado,
  SondaDoArquivo,
  TipoDeMidia,
} from '@cardapio/dominio';

export interface ArquivoGerado {
  readonly nome: NomeDoDerivado;
  readonly arquivoLocal: string;
  readonly tipoConteudo: string;
  readonly bytes: number;
  readonly largura?: number;
}

export interface ArquivosGerados {
  readonly largura: number;
  readonly altura: number;
  readonly duracaoMs: number | null;
  readonly arquivos: readonly ArquivoGerado[];
}

export interface ProcessadorDeMidia {
  sondar(arquivoLocal: string, tipo: TipoDeMidia): Promise<SondaDoArquivo | null>;
  gerar(
    arquivoLocal: string,
    plano: PlanoDeProcessamento,
    pasta: string,
  ): Promise<Resultado<ArquivosGerados, MotivoDaRecusa>>;
}

export interface PastaTemporaria {
  comPasta<T>(executar: (pasta: string) => Promise<T>): Promise<T>;
}
