import { v7 as uuidv7 } from 'uuid';
import type { Transacao } from '../../banco.ts';
import {
  auditoria,
  caixaSaida,
  historicoNumerosMesa,
  historicoSlugs,
  mesas,
  restaurantes,
  sessoesMesa,
} from '../../esquema/index.ts';
import { gerarCodigoDeMesa } from '../../mesas/codigo-de-mesa.ts';
import { sufixoUnico } from '../apoio.ts';

export interface Fabrica {
  readonly tabela: string;
  readonly colunaDoRestaurante: 'restaurante_id' | 'id';
  criar(transacao: Transacao, restauranteId: string): Promise<void>;
}

let proximoNumero = 1;

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
];
