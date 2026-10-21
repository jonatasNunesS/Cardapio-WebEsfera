import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

export const momento = (nome: string) => timestamp(nome, { withTimezone: true, mode: 'date' });

export const idUuidV7 = () =>
  uuid('id')
    .notNull()
    .default(sql`uuidv7()`);

export const restauranteId = () => uuid('restaurante_id').notNull();
