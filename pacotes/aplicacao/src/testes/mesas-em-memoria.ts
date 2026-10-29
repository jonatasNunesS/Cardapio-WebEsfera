import type { DadosDoCartao, CartoesDeQr } from '../mesas/portas/cartoes-de-qr.ts';
import type {
  Autoria,
  DesfechoDaMesa,
  GeradorDeCodigoDeMesa,
  MesaGuardada,
  NovaMesa,
  RepositorioDeMesas,
} from '../mesas/portas/repositorio-de-mesas.ts';
import type { RepositorioMesas, ResolucaoDeMesa } from '../mesas/portas/repositorio-mesas.ts';
import type { ContadorDeTentativasInvalidas, SessoesDeMesa } from '../mesas/portas/sessoes-de-mesa.ts';

interface Restaurante {
  slug: string;
  nome: string;
  cancelado: boolean;
}

interface Auditoria {
  readonly restauranteId: string;
  readonly acao: string;
  readonly mesaId: string;
  readonly usuarioId: string | null;
}

let sequencia = 0;

function proximoId(): string {
  sequencia += 1;
  return `0190a1b2-c3d4-7e5f-8a9b-${sequencia.toString(16).padStart(12, '0')}`;
}

export class MesasEmMemoria implements RepositorioDeMesas, RepositorioMesas {
  readonly restaurantes = new Map<string, Restaurante>();
  readonly mesas = new Map<string, MesaGuardada & { readonly restauranteId: string }>();
  readonly historicoDeNumeros: { mesaId: string; numero: number }[] = [];
  readonly auditoria: Auditoria[] = [];

  adicionarRestaurante(id: string, slug: string): void {
    this.restaurantes.set(id, { slug, nome: `Restaurante ${slug}`, cancelado: false });
  }

  private doRestaurante(restauranteId: string) {
    return [...this.mesas.values()].filter((mesa) => mesa.restauranteId === restauranteId);
  }

  private daqui(restauranteId: string, mesaId: string) {
    const mesa = this.mesas.get(mesaId);
    return mesa?.restauranteId === restauranteId ? mesa : undefined;
  }

  private auditar(restauranteId: string, mesaId: string, acao: string, autoria: Autoria) {
    this.auditoria.push({ restauranteId, mesaId, acao, usuarioId: autoria.usuarioId });
  }

  private numeroOcupado(restauranteId: string, numero: number, outra?: string) {
    return this.doRestaurante(restauranteId).some((mesa) => mesa.numero === numero && mesa.id !== outra);
  }

  private mudar(restauranteId: string, mesaId: string, mudanca: Partial<MesaGuardada>): DesfechoDaMesa {
    const mesa = this.daqui(restauranteId, mesaId);
    if (mesa === undefined) {
      return { tipo: 'nao-encontrada' };
    }
    const nova = { ...mesa, ...mudanca };
    this.mesas.set(mesaId, nova);
    return { tipo: 'ok', mesa: nova };
  }

  listar(restauranteId: string) {
    const restaurante = this.restaurantes.get(restauranteId);
    return Promise.resolve({
      slug: restaurante?.slug ?? '',
      nomeDoRestaurante: restaurante?.nome ?? '',
      mesas: this.doRestaurante(restauranteId).sort((a, b) => a.numero - b.numero),
    });
  }

  criar(restauranteId: string, nova: NovaMesa, limite: number, autoria: Autoria) {
    if (this.doRestaurante(restauranteId).filter((mesa) => mesa.ativa).length >= limite) {
      return Promise.resolve<DesfechoDaMesa>({ tipo: 'limite' });
    }
    if (this.numeroOcupado(restauranteId, nova.numero)) {
      return Promise.resolve<DesfechoDaMesa>({ tipo: 'numero-repetido' });
    }
    if ([...this.mesas.values()].some((mesa) => mesa.codigo === nova.codigo)) {
      return Promise.resolve<DesfechoDaMesa>({ tipo: 'codigo-repetido' });
    }
    const mesa = { ...nova, id: proximoId(), ativa: true, restauranteId };
    this.mesas.set(mesa.id, mesa);
    this.auditar(restauranteId, mesa.id, 'criar', autoria);
    return Promise.resolve<DesfechoDaMesa>({ tipo: 'ok', mesa });
  }

  editar(restauranteId: string, mesaId: string, dados: Pick<NovaMesa, 'nome' | 'area'>) {
    return Promise.resolve(this.mudar(restauranteId, mesaId, dados));
  }

  renumerar(restauranteId: string, mesaId: string, numero: number, autoria: Autoria) {
    const mesa = this.daqui(restauranteId, mesaId);
    if (mesa !== undefined && this.numeroOcupado(restauranteId, numero, mesaId)) {
      return Promise.resolve<DesfechoDaMesa>({ tipo: 'numero-repetido' });
    }
    if (mesa !== undefined && mesa.numero !== numero) {
      this.historicoDeNumeros.push({ mesaId, numero: mesa.numero });
      this.auditar(restauranteId, mesaId, 'renumerar', autoria);
    }
    return Promise.resolve(this.mudar(restauranteId, mesaId, { numero }));
  }

  alterarAtiva(restauranteId: string, mesaId: string, ativa: boolean, limite: number, autoria: Autoria) {
    const ativas = this.doRestaurante(restauranteId).filter(
      (mesa) => mesa.ativa && mesa.id !== mesaId,
    ).length;
    if (ativa && this.daqui(restauranteId, mesaId)?.ativa === false && ativas >= limite) {
      return Promise.resolve<DesfechoDaMesa>({ tipo: 'limite' });
    }
    const desfecho = this.mudar(restauranteId, mesaId, { ativa });
    if (desfecho.tipo === 'ok') {
      this.auditar(restauranteId, mesaId, ativa ? 'ativar' : 'desativar', autoria);
    }
    return Promise.resolve(desfecho);
  }

  trocarCodigo(restauranteId: string, mesaId: string, codigo: string, autoria: Autoria) {
    const desfecho = this.mudar(restauranteId, mesaId, { codigo });
    if (desfecho.tipo === 'ok') {
      this.auditar(restauranteId, mesaId, 'trocar_codigo', autoria);
    }
    return Promise.resolve(desfecho);
  }

  resolverMesa(slug: string, numero: number, codigo: string): Promise<ResolucaoDeMesa> {
    const mesa = [...this.mesas.values()].find((item) => item.codigo === codigo);
    const restaurante = mesa === undefined ? undefined : this.restaurantes.get(mesa.restauranteId);
    if (mesa === undefined || restaurante === undefined) {
      return Promise.resolve({ situacao: 'desconhecido' });
    }
    if (restaurante.cancelado) {
      return Promise.resolve({ situacao: 'cancelado' });
    }
    if (!mesa.ativa) {
      return Promise.resolve({ situacao: 'inativa' });
    }
    const atual = restaurante.slug === slug && mesa.numero === numero;
    return Promise.resolve({
      situacao: atual ? 'valida' : 'redirecionar',
      restauranteId: mesa.restauranteId,
      mesaId: mesa.id,
      slugAtual: restaurante.slug,
      numeroAtual: mesa.numero,
    });
  }
}

export class CodigosDeTeste implements GeradorDeCodigoDeMesa {
  readonly fila: string[] = [];
  private contador = 0;

  gerar(): string {
    const proximo = this.fila.shift();
    if (proximo !== undefined) {
      return proximo;
    }
    this.contador += 1;
    return `codigo${String(this.contador).padStart(16, '0')}`;
  }
}

export class SessoesDeMesaEmMemoria implements SessoesDeMesa {
  readonly abertas = new Map<string, { sessaoId: string; expiraEm: Date }>();

  abrirOuReusar(restauranteId: string, mesaId: string, agora: Date, expiraEm: Date) {
    const chave = `${restauranteId}:${mesaId}`;
    const existente = this.abertas.get(chave);
    if (existente !== undefined && existente.expiraEm > agora) {
      return Promise.resolve(existente);
    }
    const nova = { sessaoId: proximoId(), expiraEm };
    this.abertas.set(chave, nova);
    return Promise.resolve(nova);
  }
}

export class ContadorDeTeste implements ContadorDeTentativasInvalidas {
  readonly contagem = new Map<string, number>();

  registrar(origem: string) {
    const total = (this.contagem.get(origem) ?? 0) + 1;
    this.contagem.set(origem, total);
    return Promise.resolve(total);
  }
}

export class CartoesDeTeste implements CartoesDeQr {
  readonly pedidos: DadosDoCartao[] = [];

  cartao(dados: DadosDoCartao) {
    this.pedidos.push(dados);
    return Promise.resolve(Uint8Array.from(dados.link, (letra) => letra.charCodeAt(0)));
  }

  async *zip(cartoes: readonly DadosDoCartao[]) {
    for (const cartao of cartoes) {
      yield await this.cartao(cartao);
    }
  }
}
