import { CODIGOS } from '@cardapio/dominio';
import { describe, expect, it } from 'vitest';
import { CardapioEmMemoria } from '../../testes/dobles.ts';
import { alterarSituacaoDoPrato } from './alterar-situacao-do-prato.ts';
import { criarCategoria } from './criar-categoria.ts';
import { criarPrato } from './criar-prato.ts';
import { editarCategoria } from './editar-categoria.ts';
import { editarPrato } from './editar-prato.ts';
import { listarCardapioDoPainel } from './listar-cardapio-do-painel.ts';
import { moverItemDoCardapio } from './mover-item-do-cardapio.ts';
import { removerCategoria } from './remover-categoria.ts';
import { removerPrato } from './remover-prato.ts';

const DONO = { restauranteId: 'r1', papel: 'dono' } as const;
const GERENTE = { restauranteId: 'r1', papel: 'gerente' } as const;
const GARCOM = { restauranteId: 'r1', papel: 'garcom' } as const;
const OUTRO = { restauranteId: 'r2', papel: 'dono' } as const;

function valor<T>(resultado: { ok: true; valor: T } | { ok: false }): T {
  if (!resultado.ok) {
    throw new Error('esperava sucesso');
  }
  return resultado.valor;
}

function codigo(resultado: { ok: boolean; erro?: { codigo: string } }): string | undefined {
  return resultado.ok ? undefined : resultado.erro?.codigo;
}

async function montar() {
  const cardapio = new CardapioEmMemoria();
  const dependencias = { cardapio };
  const entradas = valor(await criarCategoria(dependencias, DONO, { nome: 'Entradas' }));
  const prato = (nome: string) => ({
    categoriaId: entradas.id,
    nome,
    descricao: '',
    precoCentavos: 2400,
    disponivel: true,
    destaque: false,
  });
  return { cardapio, dependencias, entradas, prato };
}

describe('cardápio no painel', () => {
  it('dono e gerente criam categoria e prato; o preço fica em centavos', async () => {
    const { dependencias, entradas, prato } = await montar();
    const criado = valor(await criarPrato(dependencias, GERENTE, prato('Pão de fermentação')));

    expect(criado).toMatchObject({ categoriaId: entradas.id, precoCentavos: 2400, versao: 1 });
    expect(valor(await listarCardapioDoPainel(dependencias, DONO)).pratos).toHaveLength(1);
  });

  it('garçom não lê nem muda o cardápio', async () => {
    const { dependencias, prato } = await montar();
    expect(codigo(await listarCardapioDoPainel(dependencias, GARCOM))).toBe(
      CODIGOS.CARDAPIO_EDITAR_SEM_PERMISSAO,
    );
    expect(codigo(await criarPrato(dependencias, GARCOM, prato('X')))).toBe(
      CODIGOS.CARDAPIO_EDITAR_SEM_PERMISSAO,
    );
  });

  it('nome de categoria repetido, sem distinguir acento nem maiúscula, é recusado', async () => {
    const { dependencias } = await montar();
    expect(codigo(await criarCategoria(dependencias, DONO, { nome: 'ENTRADAS' }))).toBe(
      CODIGOS.CARDAPIO_EDITAR_NOME_REPETIDO,
    );
    expect(codigo(await criarCategoria(dependencias, DONO, { nome: '' }))).toBe(
      CODIGOS.CARDAPIO_EDITAR_NOME_INVALIDO,
    );
  });

  it('trava otimista: duas edições com a mesma versão, a segunda recebe conflito', async () => {
    const { dependencias, prato } = await montar();
    const criado = valor(await criarPrato(dependencias, DONO, prato('Bolinho')));
    const item = { id: criado.id, versao: criado.versao };

    const primeira = await editarPrato(dependencias, DONO, item, { ...prato('Bolinho de arroz') });
    const segunda = await editarPrato(dependencias, GERENTE, item, { ...prato('Bolinho de feijão') });

    expect(valor(primeira).versao).toBe(2);
    expect(codigo(segunda)).toBe(CODIGOS.CARDAPIO_EDITAR_CONFLITO_DE_VERSAO);
  });

  it('editar categoria também usa a versão', async () => {
    const { dependencias, entradas } = await montar();
    const editada = valor(await editarCategoria(dependencias, DONO, entradas, { nome: 'Para começar' }));
    expect(editada.nome).toBe('Para começar');
    expect(codigo(await editarCategoria(dependencias, DONO, entradas, { nome: 'Outra' }))).toBe(
      CODIGOS.CARDAPIO_EDITAR_CONFLITO_DE_VERSAO,
    );
  });

  it('marcar esgotado e destacar mudam só a situação e sobem a versão', async () => {
    const { dependencias, prato } = await montar();
    const criado = valor(await criarPrato(dependencias, DONO, prato('Burrata')));
    const esgotado = valor(
      await alterarSituacaoDoPrato(dependencias, DONO, { id: criado.id, versao: 1, disponivel: false }),
    );
    const destacado = valor(
      await alterarSituacaoDoPrato(dependencias, DONO, { id: criado.id, versao: 2, destaque: true }),
    );

    expect([esgotado.disponivel, destacado.disponivel, destacado.destaque, destacado.versao]).toEqual([
      false,
      false,
      true,
      3,
    ]);
  });

  it('remover prato é lógico, e categoria com prato não pode ser removida', async () => {
    const { cardapio, dependencias, entradas, prato } = await montar();
    const criado = valor(await criarPrato(dependencias, DONO, prato('Pão')));

    expect(codigo(await removerCategoria(dependencias, DONO, entradas))).toBe(
      CODIGOS.CARDAPIO_REMOVER_CATEGORIA_COM_PRATOS,
    );
    expect((await removerPrato(dependencias, DONO, criado)).ok).toBe(true);
    expect(cardapio.pratos[0]?.removido).toBe(true);
    expect(codigo(await removerPrato(dependencias, DONO, criado))).toBe(
      CODIGOS.CARDAPIO_EDITAR_NAO_ENCONTRADO,
    );
    expect((await removerCategoria(dependencias, DONO, entradas)).ok).toBe(true);
  });

  it('prato em categoria inexistente é recusado', async () => {
    const { dependencias, prato } = await montar();
    const resultado = await criarPrato(dependencias, DONO, { ...prato('X'), categoriaId: 'outra' });
    expect(codigo(resultado)).toBe(CODIGOS.CARDAPIO_EDITAR_NAO_ENCONTRADO);
  });

  it('mover um prato muda a ordem dele, e versão velha dá conflito', async () => {
    const { dependencias, prato } = await montar();
    const [a, b, c] = [
      valor(await criarPrato(dependencias, DONO, prato('A'))),
      valor(await criarPrato(dependencias, DONO, prato('B'))),
      valor(await criarPrato(dependencias, DONO, prato('C'))),
    ];

    expect(
      (await moverItemDoCardapio(dependencias, DONO, { tipo: 'prato', id: c.id, versao: 1, posicao: 0 })).ok,
    ).toBe(true);
    const ordem = valor(await listarCardapioDoPainel(dependencias, DONO))
      .pratos.toSorted((x, y) => x.ordem - y.ordem)
      .map((item) => item.nome);
    expect(ordem).toEqual(['C', 'A', 'B']);
    expect(
      codigo(
        await moverItemDoCardapio(dependencias, DONO, { tipo: 'prato', id: c.id, versao: 1, posicao: 2 }),
      ),
    ).toBe(CODIGOS.CARDAPIO_EDITAR_CONFLITO_DE_VERSAO);
    expect([a.id, b.id]).toHaveLength(2);
  });

  it('um restaurante não enxerga nem altera o cardápio do outro', async () => {
    const { dependencias, prato } = await montar();
    const criado = valor(await criarPrato(dependencias, DONO, prato('Pão')));

    expect(valor(await listarCardapioDoPainel(dependencias, OUTRO)).pratos).toEqual([]);
    expect(codigo(await removerPrato(dependencias, OUTRO, criado))).toBe(
      CODIGOS.CARDAPIO_EDITAR_NAO_ENCONTRADO,
    );
  });
});
