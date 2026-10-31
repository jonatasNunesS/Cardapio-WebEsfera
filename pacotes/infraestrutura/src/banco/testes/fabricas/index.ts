import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { Transacao } from '../../banco.ts';
import {
  assinaturas,
  auditoria,
  caixaSaida,
  chamados,
  categorias,
  cobrancas,
  contadoresPedido,
  convites,
  suspensoesRestaurante,
  itensPedido,
  pedidos,
  historicoNumerosMesa,
  historicoSlugs,
  horarios,
  mesas,
  midias,
  personalizacoes,
  pratos,
  restaurantes,
  sessoesMesa,
  vinculos,
} from '../../esquema/index.ts';
import { gerarCodigoDeMesa } from '../../mesas/codigo-de-mesa.ts';
import { consultarComoAdmin, sufixoUnico } from '../apoio.ts';

export interface Fabrica {
  readonly tabela: string;
  readonly colunaDoRestaurante: 'restaurante_id' | 'id';
  criar(transacao: Transacao, restauranteId: string): Promise<void>;
}

let proximoNumero = 1;
const HASH_DE_FABRICA = '$argon2id$v=19$m=19456,t=2,p=1$ZmFicmljYQ$ZmFicmljYQ';

let administradorDeFabrica: Promise<string> | null = null;

function administradorDaFabrica(): Promise<string> {
  administradorDeFabrica ??= consultarComoAdmin<{ id: string }>(
    `INSERT INTO administradores (nome, email, hash_senha, papel, segredo_totp_cifrado)
     VALUES ('Fábrica', $1, $2, 'suporte', 'cifrado') RETURNING id`,
    [`admin-fabrica-${sufixoUnico()}@exemplo.com.br`, HASH_DE_FABRICA],
  ).then((linhas) => linhas[0]?.id ?? '');
  return administradorDeFabrica;
}

export async function criarUsuarioDeFabrica(transacao: Transacao): Promise<string> {
  const email = `fabrica-${sufixoUnico()}@exemplo.com.br`;
  const resultado = await transacao.execute<{ id: string }>(
    sql`SELECT app.criar_usuario('Fábrica', ${email}, ${HASH_DE_FABRICA}) AS id`,
  );
  return resultado.rows[0]?.id ?? '';
}

async function criarCategoria(transacao: Transacao, restauranteId: string): Promise<string> {
  const id = uuidv7();
  await transacao
    .insert(categorias)
    .values({ id, restauranteId, nome: `Categoria ${sufixoUnico()}`, ordem: proximoNumero * 1024 });
  return id;
}

async function criarPrato(transacao: Transacao, restauranteId: string, categoriaId: string): Promise<string> {
  const id = uuidv7();
  await transacao
    .insert(pratos)
    .values({ id, restauranteId, categoriaId, nome: 'Prato de fábrica', precoCentavos: 1000, ordem: 1024 });
  return id;
}

async function criarPlanoId(transacao: Transacao): Promise<string> {
  const resultado = await transacao.execute<{ id: string }>(
    sql`SELECT id FROM planos WHERE codigo = 'basico'`,
  );
  return resultado.rows[0]?.id ?? '';
}

async function criarAssinatura(transacao: Transacao, restauranteId: string): Promise<string> {
  const id = uuidv7();
  await transacao.insert(assinaturas).values({
    id,
    restauranteId,
    planoId: await criarPlanoId(transacao),
    mpAssinaturaId: `fabrica-${sufixoUnico()}`,
    situacao: 'cancelada',
    initPoint: 'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=fabrica',
  });
  return id;
}

async function criarPedido(transacao: Transacao, restauranteId: string): Promise<string> {
  const mesaId = await criarMesa(transacao, restauranteId);
  const sessaoMesaId = uuidv7();
  await transacao
    .insert(sessoesMesa)
    .values({ id: sessaoMesaId, restauranteId, mesaId, expiraEm: new Date(Date.now() + 4 * 3600_000) });
  const id = uuidv7();
  proximoNumero += 1;
  await transacao.insert(pedidos).values({
    id,
    restauranteId,
    sessaoMesaId,
    mesaId,
    numero: proximoNumero,
    totalCentavos: 1000,
    chaveIdempotencia: uuidv7(),
    hashConteudo: '0'.repeat(64),
  });
  return id;
}

async function criarMesa(transacao: Transacao, restauranteId: string): Promise<string> {
  const id = uuidv7();
  proximoNumero = (proximoNumero % 999) + 1;
  await transacao
    .insert(mesas)
    .values({ id, restauranteId, numero: proximoNumero, codigo: gerarCodigoDeMesa() });
  return id;
}

export const FABRICAS: readonly Fabrica[] = [
  {
    tabela: 'restaurantes',
    colunaDoRestaurante: 'id',
    async criar(transacao, restauranteId) {
      const slug = `fabrica-${sufixoUnico()}`;
      await transacao.insert(restaurantes).values({ id: restauranteId, slug, nome: 'Fábrica' });
      await transacao.insert(historicoSlugs).values({ restauranteId, slug });
    },
  },
  {
    tabela: 'historico_slugs',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      await transacao.insert(historicoSlugs).values({ restauranteId, slug: `antigo-${sufixoUnico()}` });
    },
  },
  {
    tabela: 'mesas',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      await criarMesa(transacao, restauranteId);
    },
  },
  {
    tabela: 'historico_numeros_mesa',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      const mesaId = await criarMesa(transacao, restauranteId);
      await transacao.insert(historicoNumerosMesa).values({ restauranteId, mesaId, numero: 999 });
    },
  },
  {
    tabela: 'sessoes_mesa',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      const mesaId = await criarMesa(transacao, restauranteId);
      await transacao
        .insert(sessoesMesa)
        .values({ restauranteId, mesaId, expiraEm: new Date(Date.now() + 4 * 3600_000) });
    },
  },
  {
    tabela: 'caixa_saida',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      await transacao
        .insert(caixaSaida)
        .values({ restauranteId, tipoEvento: 'MesaCriada', carga: { versao: 1 } });
    },
  },
  {
    tabela: 'auditoria',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      await transacao
        .insert(auditoria)
        .values({ restauranteId, autorTipo: 'sistema', acao: 'criar', entidade: 'mesa' });
    },
  },
  {
    tabela: 'vinculos',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      const usuarioId = await criarUsuarioDeFabrica(transacao);
      await transacao.insert(vinculos).values({ restauranteId, usuarioId, papel: 'dono' });
    },
  },
  {
    tabela: 'personalizacoes',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      await transacao.insert(personalizacoes).values({
        restauranteId,
        corMarca: '#B4441F',
        corSobreMarca: '#FFFFFF',
        corMarcaTexto: '#B4441F',
      });
    },
  },
  {
    tabela: 'horarios',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      await transacao
        .insert(horarios)
        .values({ restauranteId, diaSemana: proximoNumero % 7, abre: '18:00', fecha: '23:00' });
    },
  },
  {
    tabela: 'categorias',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      await criarCategoria(transacao, restauranteId);
    },
  },
  {
    tabela: 'pratos',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      const categoriaId = await criarCategoria(transacao, restauranteId);
      await criarPrato(transacao, restauranteId, categoriaId);
    },
  },
  {
    tabela: 'midias',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      const pratoId = await criarPrato(
        transacao,
        restauranteId,
        await criarCategoria(transacao, restauranteId),
      );
      const id = uuidv7();
      await transacao.insert(midias).values({
        id,
        restauranteId,
        pratoId,
        tipo: 'foto',
        tipoConteudo: 'image/jpeg',
        tamanhoBytes: 1000,
        caminhoOriginal: `r/${restauranteId}/midias/${id}/original`,
      });
    },
  },
  {
    tabela: 'assinaturas',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      await criarAssinatura(transacao, restauranteId);
    },
  },
  {
    tabela: 'cobrancas',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      const assinaturaId = await criarAssinatura(transacao, restauranteId);
      await transacao.insert(cobrancas).values({
        restauranteId,
        assinaturaId,
        mpCobrancaId: `fabrica-${sufixoUnico()}`,
        valorCentavos: 9900,
        situacao: 'agendada',
        venceEm: new Date(),
      });
    },
  },
  {
    tabela: 'contadores_pedido',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      await transacao
        .insert(contadoresPedido)
        .values({ restauranteId, ultimoNumero: 1 })
        .onConflictDoUpdate({ target: contadoresPedido.restauranteId, set: { ultimoNumero: 2 } });
    },
  },
  {
    tabela: 'pedidos',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      await criarPedido(transacao, restauranteId);
    },
  },
  {
    tabela: 'itens_pedido',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      const pedidoId = await criarPedido(transacao, restauranteId);
      const pratoId = await criarPrato(
        transacao,
        restauranteId,
        await criarCategoria(transacao, restauranteId),
      );
      await transacao.insert(itensPedido).values({
        restauranteId,
        pedidoId,
        pratoId,
        nomeNoMomento: 'Prato de fábrica',
        precoNoMomentoCentavos: 1000,
        quantidade: 1,
      });
    },
  },
  {
    tabela: 'chamados',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      const mesaId = await criarMesa(transacao, restauranteId);
      const sessaoMesaId = uuidv7();
      await transacao
        .insert(sessoesMesa)
        .values({ id: sessaoMesaId, restauranteId, mesaId, expiraEm: new Date(Date.now() + 4 * 3600_000) });
      await transacao
        .insert(chamados)
        .values({ restauranteId, sessaoMesaId, mesaId, tipo: 'garcom', chaveIdempotencia: uuidv7() });
    },
  },
  {
    tabela: 'suspensoes_restaurante',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      await transacao
        .insert(suspensoesRestaurante)
        .values({ restauranteId, motivo: 'Fábrica', suspensaPor: await administradorDaFabrica() });
    },
  },
  {
    tabela: 'convites',
    colunaDoRestaurante: 'restaurante_id',
    async criar(transacao, restauranteId) {
      await transacao.insert(convites).values({
        restauranteId,
        usuarioId: await criarUsuarioDeFabrica(transacao),
        hashToken: uuidv7().replaceAll('-', '').padEnd(64, '0'),
        criadoPor: await administradorDaFabrica(),
        expiraEm: new Date(Date.now() + 3600_000),
      });
    },
  },
];
