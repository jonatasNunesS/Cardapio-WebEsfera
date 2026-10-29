import {
  caminhoDoOriginal,
  nomeDaImagem,
  Resultado,
  type Derivados,
  type MotivoDaRecusa,
  type PlanoDeProcessamento,
  type SondaDoArquivo,
} from '@cardapio/dominio';
import type { FilaDeJobs, JobEnfileirado, PedidoDeJob } from '../filas/portas/fila-de-jobs.ts';
import type {
  AreaDoArmazenamento,
  ArmazenamentoDeMidia,
  ArquivoParaEnviar,
  ObjetoArmazenado,
  PedidoDeUrlDeEnvio,
} from '../midia/portas/armazenamento-de-midia.ts';
import type {
  ArquivoGerado,
  ArquivosGerados,
  PastaTemporaria,
  ProcessadorDeMidia,
} from '../midia/portas/processador-de-midia.ts';
import type {
  DesfechoDaConclusao,
  MidiaRegistrada,
  MidiasDoPrato,
  NovaMidia,
  RepositorioDeMidias,
} from '../midia/portas/repositorio-de-midias.ts';

interface EventoGravado {
  readonly restauranteId: string;
  readonly tipo: 'MidiaEnviada' | 'MidiaDescartada';
  readonly midiaId: string;
}

let sequencia = 0;

export function idDeTeste(): string {
  sequencia += 1;
  return `0190a1b2-c3d4-7e5f-8a9b-${sequencia.toString(16).padStart(12, '0')}`;
}

export class MidiasEmMemoria implements RepositorioDeMidias {
  readonly midias = new Map<string, MidiaRegistrada & { readonly restauranteId: string }>();
  readonly pratos = new Map<string, { restauranteId: string; midiaId: string | null }>();
  readonly eventos: EventoGravado[] = [];

  adicionarPrato(restauranteId: string, pratoId: string): void {
    this.pratos.set(pratoId, { restauranteId, midiaId: null });
  }

  private daqui(restauranteId: string, midiaId: string) {
    const midia = this.midias.get(midiaId);
    return midia?.restauranteId === restauranteId ? midia : undefined;
  }

  private mudar(midiaId: string, mudanca: Partial<MidiaRegistrada>): void {
    const atual = this.midias.get(midiaId);
    if (atual !== undefined) {
      this.midias.set(midiaId, { ...atual, ...mudanca });
    }
  }

  private descartar(restauranteId: string, midiaId: string): void {
    this.mudar(midiaId, { descartada: true });
    this.eventos.push({ restauranteId, tipo: 'MidiaDescartada', midiaId });
  }

  private pendentes(restauranteId: string, pratoId: string) {
    const atual = this.pratos.get(pratoId)?.midiaId;
    return [...this.midias.values()].filter(
      (midia) =>
        midia.restauranteId === restauranteId &&
        midia.pratoId === pratoId &&
        !midia.descartada &&
        midia.id !== atual,
    );
  }

  criar(restauranteId: string, nova: NovaMidia) {
    if (this.pratos.get(nova.pratoId)?.restauranteId !== restauranteId) {
      return Promise.resolve({ tipo: 'prato-inexistente' as const });
    }
    for (const antiga of this.pendentes(restauranteId, nova.pratoId)) {
      this.descartar(restauranteId, antiga.id);
    }
    const id = idDeTeste();
    const caminhoOriginal = caminhoDoOriginal(restauranteId, id);
    this.midias.set(id, {
      ...nova,
      restauranteId,
      id,
      situacao: 'enviando',
      caminhoOriginal,
      tentativa: 0,
      motivoFalha: null,
      derivados: null,
      originalApagado: false,
      descartada: false,
    });
    return Promise.resolve({ tipo: 'criada' as const, midiaId: id, caminhoOriginal });
  }

  obter(restauranteId: string, midiaId: string) {
    return Promise.resolve(this.daqui(restauranteId, midiaId) ?? null);
  }

  solicitarProcessamento(restauranteId: string, midiaId: string, situacaoEsperada: 'enviando' | 'falhou') {
    const midia = this.daqui(restauranteId, midiaId);
    if (midia?.situacao !== situacaoEsperada || midia.descartada) {
      return Promise.resolve(null);
    }
    const tentativa = midia.tentativa + 1;
    this.mudar(midiaId, { situacao: 'processando', tentativa, motivoFalha: null });
    this.eventos.push({ restauranteId, tipo: 'MidiaEnviada', midiaId });
    return Promise.resolve(tentativa);
  }

  iniciarProcessamento(restauranteId: string, midiaId: string, tentativa: number) {
    const midia = this.daqui(restauranteId, midiaId);
    const valida = midia?.situacao === 'processando' && midia.tentativa === tentativa && !midia.descartada;
    return Promise.resolve(valida ? midia : null);
  }

  concluir(restauranteId: string, midiaId: string, tentativa: number, derivados: Derivados) {
    const midia = this.daqui(restauranteId, midiaId);
    if (midia?.situacao !== 'processando' || midia.tentativa !== tentativa) {
      return Promise.resolve<DesfechoDaConclusao>('obsoleta');
    }
    this.mudar(midiaId, { situacao: 'pronta', derivados });
    if (midia.descartada) {
      this.eventos.push({ restauranteId, tipo: 'MidiaDescartada', midiaId });
      return Promise.resolve<DesfechoDaConclusao>('descartada');
    }
    const prato = this.pratos.get(midia.pratoId);
    if (prato?.midiaId != null) {
      this.descartar(restauranteId, prato.midiaId);
    }
    this.pratos.set(midia.pratoId, { restauranteId, midiaId });
    return Promise.resolve<DesfechoDaConclusao>('publicada');
  }

  falhar(restauranteId: string, midiaId: string, tentativa: number, motivo: MotivoDaRecusa) {
    const midia = this.daqui(restauranteId, midiaId);
    if (midia?.situacao !== 'processando' || midia.tentativa !== tentativa) {
      return Promise.resolve(false);
    }
    this.mudar(midiaId, { situacao: 'falhou', motivoFalha: motivo });
    return Promise.resolve(true);
  }

  listarDoPrato(restauranteId: string, pratoId: string) {
    const prato = this.pratos.get(pratoId);
    if (prato?.restauranteId !== restauranteId) {
      return Promise.resolve(null);
    }
    const atual = prato.midiaId === null ? null : (this.midias.get(prato.midiaId) ?? null);
    const pendente = this.pendentes(restauranteId, pratoId).at(-1) ?? null;
    return Promise.resolve<MidiasDoPrato>({ atual, pendente });
  }

  removerDoPrato(restauranteId: string, pratoId: string) {
    const prato = this.pratos.get(pratoId);
    if (prato?.restauranteId !== restauranteId) {
      return Promise.resolve(false);
    }
    const ids = [prato.midiaId, ...this.pendentes(restauranteId, pratoId).map((midia) => midia.id)];
    for (const id of ids) {
      if (id !== null) {
        this.descartar(restauranteId, id);
      }
    }
    this.pratos.set(pratoId, { restauranteId, midiaId: null });
    return Promise.resolve(true);
  }

  marcarOriginalApagado(_restauranteId: string, midiaId: string) {
    this.mudar(midiaId, { originalApagado: true });
    return Promise.resolve();
  }
}

export class ArmazenamentoEmMemoria implements ArmazenamentoDeMidia {
  readonly objetos: Record<AreaDoArmazenamento, Map<string, ObjetoArmazenado>> = {
    originais: new Map(),
    publica: new Map(),
  };
  readonly baixados: string[] = [];
  falharAoEnviar = false;

  urlDeEnvio(pedido: PedidoDeUrlDeEnvio) {
    return Promise.resolve({
      url: `https://armazenamento.exemplo/${pedido.caminho}?validade=${String(pedido.validadeS)}`,
      cabecalhos: { 'content-type': pedido.tipoConteudo },
      expiraEm: new Date(Date.UTC(2026, 9, 22, 20, 10)),
    });
  }

  consultar(area: AreaDoArmazenamento, caminho: string) {
    return Promise.resolve(this.objetos[area].get(caminho) ?? null);
  }

  baixar(area: AreaDoArmazenamento, caminho: string) {
    this.baixados.push(`${area}:${caminho}`);
    return Promise.resolve();
  }

  enviar(area: AreaDoArmazenamento, arquivo: ArquivoParaEnviar) {
    if (this.falharAoEnviar) {
      return Promise.reject(new Error('armazenamento fora do ar'));
    }
    this.objetos[area].set(arquivo.caminho, { tamanhoBytes: 1, tipoConteudo: arquivo.tipoConteudo });
    return Promise.resolve();
  }

  apagar(area: AreaDoArmazenamento, caminho: string) {
    this.objetos[area].delete(caminho);
    return Promise.resolve();
  }

  apagarPrefixo(area: AreaDoArmazenamento, prefixo: string) {
    const caminhos = [...this.objetos[area].keys()].filter((caminho) => caminho.startsWith(prefixo));
    for (const caminho of caminhos) {
      this.objetos[area].delete(caminho);
    }
    return Promise.resolve(caminhos.length);
  }

  urlPublica(caminho: string) {
    return `https://midia.exemplo/${caminho}`;
  }
}

function imagens(larguras: readonly number[], pasta: string): ArquivoGerado[] {
  return larguras.flatMap((largura) =>
    (['avif', 'webp'] as const).map((formato) => ({
      nome: nomeDaImagem(largura, formato),
      arquivoLocal: `${pasta}/imagem-${String(largura)}.${formato}`,
      tipoConteudo: `image/${formato}`,
      bytes: 20_000,
      largura,
    })),
  );
}

export class ProcessadorFalso implements ProcessadorDeMidia {
  sonda: SondaDoArquivo | null = {
    tipo: 'video',
    formato: 'mov,mp4',
    temVideo: true,
    duracaoMs: 15_000,
    largura: 1920,
    altura: 1080,
  };
  bytesDoVideo = 400_000;
  aoGerar: () => Promise<unknown> = () => Promise.resolve();
  readonly planos: PlanoDeProcessamento[] = [];

  sondar() {
    return Promise.resolve(this.sonda);
  }

  async gerar(_arquivo: string, plano: PlanoDeProcessamento, pasta: string) {
    this.planos.push(plano);
    await this.aoGerar();
    if (plano.tipo === 'foto') {
      return Promise.resolve(
        Resultado.ok<ArquivosGerados>({
          largura: 1000,
          altura: 800,
          duracaoMs: null,
          arquivos: imagens([320, 640], pasta),
        }),
      );
    }
    const video = (nome: 'video.mp4' | 'video.webm' | 'capa.jpg', tipo: string): ArquivoGerado => ({
      nome,
      arquivoLocal: `${pasta}/${nome}`,
      tipoConteudo: tipo,
      bytes: this.bytesDoVideo,
    });
    return Promise.resolve(
      Resultado.ok<ArquivosGerados>({
        largura: 1280,
        altura: 720,
        duracaoMs: plano.duracaoMs,
        arquivos: [
          video('video.mp4', 'video/mp4'),
          video('video.webm', 'video/webm'),
          video('capa.jpg', 'image/jpeg'),
          ...imagens([320], pasta),
        ],
      }),
    );
  }
}

export const pastaDeTeste: PastaTemporaria = {
  comPasta: (executar) => executar('/tmp/midia-de-teste'),
};

export class FilaDeTeste implements FilaDeJobs {
  readonly pedidos: PedidoDeJob[] = [];

  enfileirar(pedido: PedidoDeJob) {
    const duplicado = this.pedidos.some((existente) => existente.idDoJob === pedido.idDoJob);
    if (!duplicado) {
      this.pedidos.push(pedido);
    }
    return Promise.resolve<JobEnfileirado>({
      situacao: duplicado ? 'duplicado' : 'enfileirado',
      atrasoMs: 0,
    });
  }
}
