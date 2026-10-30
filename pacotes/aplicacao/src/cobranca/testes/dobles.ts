import type { EstadoDaCobranca } from '@cardapio/dominio';
import type { PedidoDeJob } from '../../filas/portas/fila-de-jobs.ts';
import type {
  AvisoRecebido,
  EventoEmProcessamento,
  EventoRegistrado,
} from '../portas/eventos-de-pagamento.ts';
import type {
  AssinaturaNoProvedor,
  CobrancaNoProvedor,
  GatewayPagamento,
  PedidoDeAssinatura,
} from '../portas/gateway-pagamento.ts';
import type {
  AlvoDaAlteracao,
  AssinaturaGuardada,
  CobrancaGuardada,
  DesfechoDaAlteracao,
  EventoDeCobranca,
  EstadoTravado,
  MudancaDaCobranca,
  NovaAssinatura,
  PlanoOferecido,
  RepositorioDeAssinaturas,
} from '../portas/repositorio-de-assinaturas.ts';

export const PLANOS: readonly PlanoOferecido[] = [
  {
    id: '0190a1b2-c3d4-7e5f-8a9b-000000000001',
    codigo: 'basico',
    nome: 'Básico',
    precoCentavos: 9900,
    limiteMesas: 10,
  },
  {
    id: '0190a1b2-c3d4-7e5f-8a9b-000000000002',
    codigo: 'pro',
    nome: 'Pro',
    precoCentavos: 14900,
    limiteMesas: 30,
  },
];

export const RESTAURANTE = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

interface Linha {
  restaurante: EstadoDaCobranca;
  assinaturas: AssinaturaGuardada[];
  cobrancas: Map<string, CobrancaGuardada>;
}

export class AssinaturasEmMemoria implements RepositorioDeAssinaturas {
  readonly linhas = new Map<string, Linha>();
  readonly eventos: EventoDeCobranca[] = [];
  alteracoes = 0;
  private proximoId = 1;

  constructor(estado: Partial<EstadoDaCobranca> = {}) {
    this.linhas.set(RESTAURANTE, {
      restaurante: {
        situacaoAtual: 'teste',
        testeTerminaEm: new Date('2026-11-01T15:00:00Z'),
        pagoAte: null,
        fusoHorario: 'America/Sao_Paulo',
        ...estado,
      },
      assinaturas: [],
      cobrancas: new Map(),
    });
  }

  linha(restauranteId = RESTAURANTE): Linha {
    const linha = this.linhas.get(restauranteId);
    if (linha === undefined) {
      throw new Error(`restaurante ${restauranteId} inexistente`);
    }
    return linha;
  }

  listarPlanos() {
    return Promise.resolve(PLANOS);
  }

  assinaturaAtual(restauranteId: string) {
    return Promise.resolve(
      this.linha(restauranteId).assinaturas.find((a) => a.situacao !== 'cancelada') ?? null,
    );
  }

  historico(restauranteId: string) {
    return Promise.resolve([...this.linha(restauranteId).cobrancas.values()]);
  }

  estadoDaCobranca(restauranteId: string) {
    return Promise.resolve(this.linha(restauranteId).restaurante);
  }

  guardarNova(restauranteId: string, nova: NovaAssinatura) {
    const linha = this.linha(restauranteId);
    const existente = linha.assinaturas.find((a) => a.mpAssinaturaId === nova.mpAssinaturaId);
    if (existente !== undefined) {
      return Promise.resolve(existente);
    }
    linha.assinaturas = linha.assinaturas.map((a) =>
      a.situacao === 'pendente' ? { ...a, situacao: 'cancelada' as const } : a,
    );
    const plano = PLANOS.find((item) => item.id === nova.planoId);
    if (plano === undefined) {
      throw new Error('plano inexistente');
    }
    const guardada: AssinaturaGuardada = {
      id: `0190a1b2-c3d4-7e5f-8a9b-1000000000${String(this.proximoId++).padStart(2, '0')}`,
      plano,
      mpAssinaturaId: nova.mpAssinaturaId,
      situacao: nova.situacao,
      initPoint: nova.initPoint,
      pagoAte: null,
      proximaCobrancaEm: nova.proximaCobrancaEm,
    };
    linha.assinaturas.push(guardada);
    return Promise.resolve(guardada);
  }

  alterarComTrava(
    alvo: AlvoDaAlteracao,
    decidir: (estado: EstadoTravado) => MudancaDaCobranca | null,
  ): Promise<DesfechoDaAlteracao> {
    const linha = this.linhas.get(alvo.restauranteId);
    const assinatura =
      alvo.mpAssinaturaId === null
        ? (linha?.assinaturas.find((a) => a.situacao !== 'cancelada') ?? null)
        : (linha?.assinaturas.find((a) => a.mpAssinaturaId === alvo.mpAssinaturaId) ?? null);
    if (linha === undefined || (alvo.mpAssinaturaId !== null && assinatura === null)) {
      return Promise.resolve('assinatura-desconhecida');
    }
    const pagoAte = linha.assinaturas
      .map((a) => a.pagoAte)
      .reduce<Date | null>(
        (maior, data) => (data !== null && (maior === null || data > maior) ? data : maior),
        null,
      );
    const mudanca = decidir({
      restaurante: { ...linha.restaurante, pagoAte },
      assinatura,
      cobrancas: [...linha.cobrancas.values()],
    });
    if (mudanca === null) {
      return Promise.resolve('sem-mudanca');
    }
    this.aplicar(linha, assinatura, mudanca);
    return Promise.resolve('aplicada');
  }

  private aplicar(linha: Linha, assinatura: AssinaturaGuardada | null, mudanca: MudancaDaCobranca) {
    this.alteracoes += 1;
    if (assinatura !== null && mudanca.assinatura !== null) {
      const alterada = { ...assinatura, ...mudanca.assinatura };
      linha.assinaturas = linha.assinaturas.map((a) => (a.id === assinatura.id ? alterada : a));
    }
    for (const cobranca of mudanca.cobrancas) {
      linha.cobrancas.set(cobranca.mpCobrancaId, cobranca);
    }
    if (mudanca.situacaoDoRestaurante !== null) {
      linha.restaurante = { ...linha.restaurante, situacaoAtual: mudanca.situacaoDoRestaurante };
    }
    this.eventos.push(...mudanca.eventos);
  }
}

export class GatewayFalso implements GatewayPagamento {
  readonly assinaturas = new Map<string, AssinaturaNoProvedor>();
  readonly cobrancas = new Map<string, CobrancaNoProvedor>();
  readonly pedidos: PedidoDeAssinatura[] = [];
  falhar = false;
  consultas = 0;

  criarAssinatura(pedido: PedidoDeAssinatura) {
    this.pedidos.push(pedido);
    const id = `preapproval-${String(this.pedidos.length)}`;
    const criada: AssinaturaNoProvedor = {
      id,
      situacao: 'pendente',
      referenciaExterna: pedido.referenciaExterna,
      initPoint: `https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=${id}`,
      proximaCobrancaEm: null,
    };
    this.assinaturas.set(id, criada);
    return Promise.resolve(criada);
  }

  private consultar<T>(valor: T): Promise<T> {
    this.consultas += 1;
    return this.falhar ? Promise.reject(new Error('Mercado Pago fora')) : Promise.resolve(valor);
  }

  consultarAssinatura(id: string) {
    return this.consultar(this.assinaturas.get(id) ?? null);
  }

  consultarCobranca(id: string) {
    return this.consultar(this.cobrancas.get(id) ?? null);
  }

  listarCobrancas(assinaturaId: string) {
    return this.consultar([...this.cobrancas.values()].filter((c) => c.assinaturaId === assinaturaId));
  }

  autorizar(id: string, mudancas: Partial<AssinaturaNoProvedor> = {}): void {
    const atual = this.assinaturas.get(id);
    if (atual !== undefined) {
      this.assinaturas.set(id, { ...atual, situacao: 'autorizada', ...mudancas });
    }
  }
}

export class EventosEmMemoria {
  readonly eventos = new Map<
    string,
    AvisoRecebido & { processadoEm: Date | null; recebidoEm: Date; falha: string | null }
  >();
  private proximo = 1;

  registrar(aviso: AvisoRecebido, recebidoEm = new Date('2026-11-01T12:00:00Z')): Promise<EventoRegistrado> {
    for (const [eventoId, evento] of this.eventos) {
      if (evento.xRequestId === aviso.xRequestId) {
        return Promise.resolve({ eventoId, processado: evento.processadoEm !== null });
      }
    }
    const eventoId = `0190a1b2-c3d4-7e5f-8a9b-2000000000${String(this.proximo++).padStart(2, '0')}`;
    this.eventos.set(eventoId, { ...aviso, processadoEm: null, recebidoEm, falha: null });
    return Promise.resolve({ eventoId, processado: false });
  }

  iniciar(eventoId: string): Promise<EventoEmProcessamento | null> {
    const evento = this.eventos.get(eventoId);
    return Promise.resolve(
      evento?.processadoEm === null ? { topico: evento.topico, recursoId: evento.recursoId } : null,
    );
  }

  concluir(eventoId: string, agora: Date): Promise<void> {
    const evento = this.eventos.get(eventoId);
    if (evento !== undefined) {
      evento.processadoEm = agora;
    }
    return Promise.resolve();
  }

  registrarFalha(eventoId: string, codigo: string): Promise<void> {
    const evento = this.eventos.get(eventoId);
    if (evento !== undefined) {
      evento.falha = codigo;
    }
    return Promise.resolve();
  }

  listarPendentes(recebidosAntesDe: Date): Promise<readonly string[]> {
    return Promise.resolve(
      [...this.eventos]
        .filter(([, evento]) => evento.processadoEm === null && evento.recebidoEm < recebidosAntesDe)
        .map(([eventoId]) => eventoId),
    );
  }
}

export class FilaEmMemoria {
  readonly pedidos: PedidoDeJob[] = [];

  enfileirar(pedido: PedidoDeJob) {
    const duplicado = this.pedidos.some((item) => item.idDoJob === pedido.idDoJob);
    if (!duplicado) {
      this.pedidos.push(pedido);
    }
    return Promise.resolve({
      situacao: duplicado ? ('duplicado' as const) : ('enfileirado' as const),
      atrasoMs: 0,
    });
  }
}
