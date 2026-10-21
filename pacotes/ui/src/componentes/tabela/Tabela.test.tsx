import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabela, type ColunaTabela } from './Tabela.tsx';

interface Restaurante {
  readonly id: string;
  readonly nome: string;
  readonly mesas: number;
}

const COLUNAS: readonly ColunaTabela<Restaurante>[] = [
  { chave: 'nome', titulo: 'Restaurante', celula: (linha) => linha.nome },
  { chave: 'mesas', titulo: 'Mesas', celula: (linha) => linha.mesas, numerica: true },
];

const LINHAS: readonly Restaurante[] = [
  { id: '1', nome: 'Brasa & Trigo', mesas: 24 },
  { id: '2', nome: 'Sushi Kenzo', mesas: 30 },
];

function tabela(propriedades: Partial<Parameters<typeof Tabela<Restaurante>>[0]> = {}) {
  return render(
    <Tabela
      legenda="Restaurantes"
      colunas={COLUNAS}
      linhas={LINHAS}
      chaveDaLinha={(linha) => linha.id}
      {...propriedades}
    />,
  );
}

describe('Tabela', () => {
  it('cabeçalhos com scope de coluna e de linha', () => {
    tabela();
    expect(screen.getAllByRole('columnheader').map((cabecalho) => cabecalho.getAttribute('scope'))).toEqual([
      'col',
      'col',
    ]);
    expect(screen.getByRole('rowheader', { name: 'Brasa & Trigo' }).getAttribute('scope')).toBe('row');
  });

  it('a rolagem lateral fica num contêiner rotulado e focável', () => {
    tabela();
    const regiao = screen.getByRole('region', { name: 'Restaurantes' });
    expect(regiao.tabIndex).toBe(0);
    expect(within(regiao).getByRole('table', { name: 'Restaurantes' })).toBeDefined();
  });

  it('vazia mostra a mensagem', () => {
    tabela({ linhas: [], mensagemVazia: 'Nenhum restaurante encontrado.' });
    expect(screen.getByText('Nenhum restaurante encontrado.')).toBeDefined();
  });

  it('carregando marca aria-busy e anuncia o carregamento', () => {
    tabela({ carregando: true });
    expect(screen.getByRole('table').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Carregando restaurantes');
  });
});
