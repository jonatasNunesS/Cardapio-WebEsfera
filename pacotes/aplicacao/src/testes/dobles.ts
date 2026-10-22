import type { Horario, Publico } from '@cardapio/dominio';
import type {
  AutenticadorTotp,
  Cifra,
  ConclusaoDoCadastro,
  GeradorDeCodigosDeRecuperacao,
  RepositorioDeAdmins,
  SegundoFatorGuardado,
} from '../admin/index.ts';
import type { Relogio } from '../compartilhado/index.ts';
import type {
  CofreDeSenhas,
  EnviadorDeEmail,
  GeradorDeSegredos,
  ListaDeSenhasVazadas,
  MensagemDeEmail,
  NovaSessao,
  PedidoDeRedefinicao,
  RegistroDeTentativas,
  RepositorioDeContas,
  RepositorioDeSessoes,
  SessaoGuardada,
  TentativasDoAlvo,
  Vinculo,
} from '../identidade/index.ts';
import type {
  PersonalizacaoGuardada,
  PersonalizacaoPublicada,
  RepositorioDePersonalizacao,
} from '../personalizacao/index.ts';
import type {
  RepositorioDeHorarios,
  RepositorioDeRestaurantes,
  RestauranteNovo,
  ResumoDoRestaurante,
} from '../restaurantes/index.ts';

export const INICIO = new Date('2026-10-22T20:00:00Z');

export class RelogioDeTeste implements Relogio {
  atual = INICIO;

  agora(): Date {
    return this.atual;
  }

  avancar(ms: number): void {
    this.atual = new Date(this.atual.getTime() + ms);
  }
}

export class SegredosDeTeste implements GeradorDeSegredos {
  private gerados = 0;

  token(): string {
    this.gerados += 1;
    return `token-${String(this.gerados)}`;
  }

  resumo(valor: string): string {
    return `resumo(${valor})`;
  }
}

export class CofreDeTeste implements CofreDeSenhas {
  conferencias: (string | null)[] = [];

  resumir(senha: string): Promise<string> {
    return Promise.resolve(`$argon2id$teste$${senha}`);
  }

  conferir(hash: string | null, senha: string): Promise<boolean> {
    this.conferencias.push(hash);
    return Promise.resolve(hash === `$argon2id$teste$${senha}`);
  }
}

export const senhasVazadasDeTeste: ListaDeSenhasVazadas = {
  contem: (senha) => ['1234567890', 'senhasenha'].includes(senha),
};

export class EmailDeTeste implements EnviadorDeEmail {
  enviados: MensagemDeEmail[] = [];

  enviar(mensagem: MensagemDeEmail): Promise<void> {
    this.enviados.push(mensagem);
    return Promise.resolve();
  }
}

interface UsuarioGuardado {
  id: string;
  nome: string;
  email: string;
  hashSenha: string;
}

interface TokenGuardado {
  usuarioId: string;
  hashToken: string;
  expiraEm: Date;
  usado: boolean;
}

export class ContasEmMemoria implements RepositorioDeContas {
  usuarios: UsuarioGuardado[] = [];
  vinculos: (Vinculo & { usuarioId: string })[] = [];
  tokens: TokenGuardado[] = [];
  aoRedefinir: (usuarioId: string) => void = () => undefined;

  criarUsuario(nome: string, email: string, hashSenha: string): Promise<string | null> {
    if (this.usuarios.some((usuario) => usuario.email === email)) {
      return Promise.resolve(null);
    }
    const id = `usuario-${String(this.usuarios.length + 1)}`;
    this.usuarios.push({ id, nome, email, hashSenha });
    return Promise.resolve(id);
  }

  buscarCredenciais(email: string) {
    const usuario = this.usuarios.find((item) => item.email === email);
    return Promise.resolve(usuario ? { usuarioId: usuario.id, hashSenha: usuario.hashSenha } : null);
  }

  listarVinculos(usuarioId: string): Promise<readonly Vinculo[]> {
    return Promise.resolve(this.vinculos.filter((vinculo) => vinculo.usuarioId === usuarioId));
  }

  criarTokenDeRedefinicao(pedido: PedidoDeRedefinicao): Promise<boolean> {
    const usuario = this.usuarios.find((item) => item.email === pedido.email);
    if (!usuario) {
      return Promise.resolve(false);
    }
    for (const token of this.tokens.filter((item) => item.usuarioId === usuario.id)) {
      token.usado = true;
    }
    this.tokens.push({
      usuarioId: usuario.id,
      hashToken: pedido.hashToken,
      expiraEm: pedido.expiraEm,
      usado: false,
    });
    return Promise.resolve(true);
  }

  redefinirSenha(hashToken: string, hashSenha: string, agora: Date): Promise<boolean> {
    const token = this.tokens.find(
      (item) => item.hashToken === hashToken && !item.usado && item.expiraEm > agora,
    );
    const usuario = this.usuarios.find((item) => item.id === token?.usuarioId);
    if (!token || !usuario) {
      return Promise.resolve(false);
    }
    token.usado = true;
    usuario.hashSenha = hashSenha;
    this.aoRedefinir(usuario.id);
    return Promise.resolve(true);
  }
}

export class SessoesEmMemoria implements RepositorioDeSessoes {
  guardadas: (Omit<NovaSessao, 'restauranteId'> & {
    restauranteId: string | null;
    ultimoUsoEm: Date;
    revogada: boolean;
    papel: Vinculo['papel'] | null;
  })[] = [];
  aceitar = true;

  criar(sessao: NovaSessao): Promise<boolean> {
    if (this.aceitar) {
      this.guardadas.push({ ...sessao, ultimoUsoEm: sessao.agora, revogada: false, papel: null });
    }
    return Promise.resolve(this.aceitar);
  }

  buscar(hashId: string): Promise<SessaoGuardada | null> {
    const sessao = this.guardadas.find((item) => item.hashId === hashId && !item.revogada);
    return Promise.resolve(
      sessao
        ? {
            sessaoId: hashId,
            publico: sessao.publico,
            titularId: sessao.titularId,
            nivel: sessao.nivel,
            restauranteId: sessao.restauranteId,
            papel: sessao.papel,
            criadaEm: sessao.agora,
            ultimoUsoEm: sessao.ultimoUsoEm,
            expiraEm: sessao.expiraEm,
          }
        : null,
    );
  }

  renovar(hashId: string, agora: Date): Promise<void> {
    for (const sessao of this.guardadas.filter((item) => item.hashId === hashId)) {
      sessao.ultimoUsoEm = agora;
    }
    return Promise.resolve();
  }

  revogar(hashId: string): Promise<void> {
    for (const sessao of this.guardadas.filter((item) => item.hashId === hashId)) {
      sessao.revogada = true;
    }
    return Promise.resolve();
  }

  revogarDoTitular(titularId: string): void {
    for (const sessao of this.guardadas.filter((item) => item.titularId === titularId)) {
      sessao.revogada = true;
    }
  }

  definirRestaurante(hashId: string, restauranteId: string): Promise<boolean> {
    const sessao = this.guardadas.find((item) => item.hashId === hashId && !item.revogada);
    if (!sessao || !this.aceitar) {
      return Promise.resolve(false);
    }
    sessao.restauranteId = restauranteId;
    sessao.papel = 'dono';
    return Promise.resolve(true);
  }
}

export class TentativasEmMemoria implements RegistroDeTentativas {
  registros = new Map<string, TentativasDoAlvo>();

  consultar(publico: Publico, alvos: readonly string[]): Promise<readonly TentativasDoAlvo[]> {
    return Promise.resolve(alvos.flatMap((alvo) => this.registros.get(`${publico}|${alvo}`) ?? []));
  }

  registrarFalha(publico: Publico, alvo: string, agora: Date, esquecerAntesDe: Date): Promise<number> {
    const atual = this.registros.get(`${publico}|${alvo}`);
    const falhas = atual && atual.ultimaFalhaEm >= esquecerAntesDe ? atual.falhas + 1 : 1;
    this.registros.set(`${publico}|${alvo}`, { alvo, falhas, ultimaFalhaEm: agora });
    return Promise.resolve(falhas);
  }

  limpar(publico: Publico, alvo: string): Promise<void> {
    this.registros.delete(`${publico}|${alvo}`);
    return Promise.resolve();
  }

  falhasDe(publico: Publico, alvo: string): number {
    return this.registros.get(`${publico}|${alvo}`)?.falhas ?? 0;
  }
}

interface AdminGuardado {
  id: string;
  email: string;
  hashSenha: string;
  trocaDeSenhaObrigatoria: boolean;
  segredoCifrado: string | null;
  segredoPendenteCifrado: string | null;
  ultimoPasso: number;
  codigos: { hash: string; usado: boolean }[];
}

export class AdminsEmMemoria implements RepositorioDeAdmins {
  admins: AdminGuardado[] = [];

  cadastrar(admin: Partial<AdminGuardado> & Pick<AdminGuardado, 'email' | 'hashSenha'>): AdminGuardado {
    const completo: AdminGuardado = {
      id: `admin-${String(this.admins.length + 1)}`,
      trocaDeSenhaObrigatoria: false,
      segredoCifrado: 'cifrado:SEGREDO',
      segredoPendenteCifrado: null,
      ultimoPasso: 0,
      codigos: [],
      ...admin,
    };
    this.admins.push(completo);
    return completo;
  }

  private porId(id: string): AdminGuardado | undefined {
    return this.admins.find((admin) => admin.id === id);
  }

  buscar(email: string) {
    const admin = this.admins.find((item) => item.email === email);
    return Promise.resolve(
      admin
        ? {
            administradorId: admin.id,
            hashSenha: admin.hashSenha,
            trocaDeSenhaObrigatoria: admin.trocaDeSenhaObrigatoria,
            segundoFatorCadastrado: admin.segredoCifrado !== null,
          }
        : null,
    );
  }

  buscarSegundoFator(administradorId: string): Promise<SegundoFatorGuardado | null> {
    const admin = this.porId(administradorId);
    return Promise.resolve(
      admin
        ? {
            segredoCifrado: admin.segredoCifrado,
            segredoPendenteCifrado: admin.segredoPendenteCifrado,
            ultimoPasso: admin.ultimoPasso,
          }
        : null,
    );
  }

  iniciarCadastroDoSegundoFator(administradorId: string, segredoPendenteCifrado: string): Promise<boolean> {
    const admin = this.porId(administradorId);
    if (!admin?.trocaDeSenhaObrigatoria) {
      return Promise.resolve(false);
    }
    admin.segredoPendenteCifrado = segredoPendenteCifrado;
    return Promise.resolve(true);
  }

  concluirCadastroDoSegundoFator(conclusao: ConclusaoDoCadastro): Promise<boolean> {
    const admin = this.porId(conclusao.administradorId);
    if (
      !admin?.trocaDeSenhaObrigatoria ||
      admin.segredoPendenteCifrado === null ||
      admin.ultimoPasso >= conclusao.passo
    ) {
      return Promise.resolve(false);
    }
    Object.assign(admin, {
      segredoCifrado: admin.segredoPendenteCifrado,
      segredoPendenteCifrado: null,
      ultimoPasso: conclusao.passo,
      hashSenha: conclusao.hashSenha,
      trocaDeSenhaObrigatoria: false,
      codigos: conclusao.hashesDeRecuperacao.map((hash) => ({ hash, usado: false })),
    });
    return Promise.resolve(true);
  }

  usarPasso(administradorId: string, passo: number): Promise<boolean> {
    const admin = this.porId(administradorId);
    if (!admin || admin.ultimoPasso >= passo) {
      return Promise.resolve(false);
    }
    admin.ultimoPasso = passo;
    return Promise.resolve(true);
  }

  usarCodigoDeRecuperacao(administradorId: string, hashCodigo: string): Promise<boolean> {
    const codigo = this.porId(administradorId)?.codigos.find(
      (item) => item.hash === hashCodigo && !item.usado,
    );
    if (!codigo) {
      return Promise.resolve(false);
    }
    codigo.usado = true;
    return Promise.resolve(true);
  }
}

const PASSO_MS = 30_000;

export function codigoTotpDeTeste(segredo: string, agora: Date): string {
  return `${String(segredo.length)}${String(Math.floor(agora.getTime() / PASSO_MS))}`.slice(-6);
}

export const totpDeTeste: AutenticadorTotp = {
  gerarSegredo: () => 'SEGREDONOVO',
  enderecoDeCadastro: (segredo, conta) => `otpauth://totp/${conta}?secret=${segredo}`,
  passoDoCodigo: (segredo, codigo, agora) => {
    const passo = Math.floor(agora.getTime() / PASSO_MS);
    const aceitos = [passo - 1, passo, passo + 1].filter(
      (candidato) => codigoTotpDeTeste(segredo, new Date(candidato * PASSO_MS)) === codigo,
    );
    return Promise.resolve(aceitos[0] ?? null);
  },
};

export const cifraDeTeste: Cifra = {
  cifrar: (texto) => `cifrado:${texto}`,
  decifrar: (cifrado) => cifrado.replace(/^cifrado:/, ''),
};

export const recuperacaoDeTeste: GeradorDeCodigosDeRecuperacao = {
  gerar: (quantidade) =>
    Array.from({ length: quantidade }, (_, indice) => `ABCD-${String(indice).padStart(4, '0')}`),
  normalizar: (codigo) => codigo.toUpperCase().replace(/[^A-Z0-9]/g, ''),
};

export class RestaurantesEmMemoria implements RepositorioDeRestaurantes {
  slugsOcupados = new Set<string>();
  criados: (RestauranteNovo & { restauranteId: string; slug: string })[] = [];

  criar(novo: RestauranteNovo) {
    const slug = novo.candidatosDeSlug.find((candidato) => !this.slugsOcupados.has(candidato));
    if (slug === undefined) {
      return Promise.resolve(null);
    }
    this.slugsOcupados.add(slug);
    const restauranteId = `restaurante-${String(this.criados.length + 1)}`;
    this.criados.push({ ...novo, restauranteId, slug });
    return Promise.resolve({ restauranteId, slug });
  }

  buscar(restauranteId: string): Promise<ResumoDoRestaurante | null> {
    const criado = this.criados.find((item) => item.restauranteId === restauranteId);
    return Promise.resolve(
      criado
        ? { nome: criado.nome, slug: criado.slug, situacao: 'teste', testeTerminaEm: criado.testeTerminaEm }
        : null,
    );
  }
}

export class PersonalizacoesEmMemoria implements RepositorioDePersonalizacao {
  porRestaurante = new Map<string, PersonalizacaoGuardada>();

  buscar(restauranteId: string): Promise<PersonalizacaoGuardada | null> {
    return Promise.resolve(this.porRestaurante.get(restauranteId) ?? null);
  }

  publicar(restauranteId: string, personalizacao: PersonalizacaoPublicada): Promise<number> {
    const versao = (this.porRestaurante.get(restauranteId)?.versao ?? 0) + 1;
    this.porRestaurante.set(restauranteId, { ...personalizacao, versao });
    return Promise.resolve(versao);
  }
}

export class HorariosEmMemoria implements RepositorioDeHorarios {
  porRestaurante = new Map<string, readonly Horario[]>();

  substituir(restauranteId: string, horarios: readonly Horario[]): Promise<void> {
    this.porRestaurante.set(restauranteId, horarios);
    return Promise.resolve();
  }
}

export function dependenciasDeIdentidade() {
  const sessoes = new SessoesEmMemoria();
  const contas = new ContasEmMemoria();
  contas.aoRedefinir = (usuarioId) => {
    sessoes.revogarDoTitular(usuarioId);
  };
  return {
    contas,
    sessoes,
    tentativas: new TentativasEmMemoria(),
    cofre: new CofreDeTeste(),
    senhasVazadas: senhasVazadasDeTeste,
    segredos: new SegredosDeTeste(),
    email: new EmailDeTeste(),
    relogio: new RelogioDeTeste(),
    urlDoPainel: 'https://painel.exemplo.com.br',
  };
}

export function dependenciasDeAdmin() {
  return {
    ...dependenciasDeIdentidade(),
    admins: new AdminsEmMemoria(),
    totp: totpDeTeste,
    cifra: cifraDeTeste,
    recuperacao: recuperacaoDeTeste,
    emissor: 'WebEsfera Admin',
  };
}
