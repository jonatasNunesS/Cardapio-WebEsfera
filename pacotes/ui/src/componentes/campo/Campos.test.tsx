import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AreaTexto } from './AreaTexto.tsx';
import { Caixa } from './Caixa.tsx';
import { CampoTexto } from './CampoTexto.tsx';
import { GrupoRadio } from './GrupoRadio.tsx';
import { Seletor } from './Seletor.tsx';

function descricao(elemento: HTMLElement): string {
  return (elemento.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' | ');
}

describe('CampoTexto', () => {
  it('tem rótulo visível ligado ao campo', () => {
    render(<CampoTexto rotulo="Nome do restaurante" />);
    expect(screen.getByRole('textbox', { name: 'Nome do restaurante' })).toBeDefined();
    expect(screen.getByText('Nome do restaurante').tagName).toBe('LABEL');
  });

  it('liga dica e erro por aria-describedby e marca aria-invalid', () => {
    render(<CampoTexto rotulo="Link de avaliação" dica="Cole o link do Google." erro="O link não abre." />);
    const campo = screen.getByRole('textbox', { name: 'Link de avaliação' });
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(descricao(campo)).toBe('Cole o link do Google. | O link não abre.');
  });

  it('sem erro não tem aria-invalid nem descrição vazia', () => {
    render(<CampoTexto rotulo="Frase" />);
    const campo = screen.getByRole('textbox', { name: 'Frase' });
    expect(campo.hasAttribute('aria-invalid')).toBe(false);
    expect(campo.hasAttribute('aria-describedby')).toBe(false);
  });

  it('desativado não aceita digitação', async () => {
    render(<CampoTexto rotulo="Endereço" disabled defaultValue="brasa-e-trigo" />);
    const campo = screen.getByRole<HTMLInputElement>('textbox', { name: 'Endereço' });
    await userEvent.type(campo, 'x');
    expect(campo.value).toBe('brasa-e-trigo');
  });
});

describe('AreaTexto e Seletor', () => {
  it('área de texto com rótulo e erro', () => {
    render(<AreaTexto rotulo="Mensagem de boas-vindas" erro="Até 140 caracteres." />);
    const area = screen.getByRole('textbox', { name: 'Mensagem de boas-vindas' });
    expect(area.tagName).toBe('TEXTAREA');
    expect(descricao(area)).toBe('Até 140 caracteres.');
  });

  it('seletor com rótulo e opções', async () => {
    const aoMudar = vi.fn();
    render(
      <Seletor
        rotulo="Plano"
        opcoes={[
          { valor: 'basico', rotulo: 'Básico' },
          { valor: 'pro', rotulo: 'Pro' },
        ]}
        onChange={aoMudar}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Plano' }), 'pro');
    expect(aoMudar).toHaveBeenCalledTimes(1);
  });
});

describe('Caixa', () => {
  it('o rótulo inteiro é clicável', async () => {
    render(<Caixa rotulo="Taxa de serviço (10%, opcional)" />);
    const caixa = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Taxa de serviço (10%, opcional)' });
    await userEvent.click(screen.getByText('Taxa de serviço (10%, opcional)'));
    expect(caixa.checked).toBe(true);
  });
});

function GrupoControlado() {
  const [valor, setValor] = useState('aberto');
  return (
    <GrupoRadio
      legenda="Situação"
      nome="situacao"
      valor={valor}
      aoMudar={setValor}
      opcoes={[
        { valor: 'aberto', rotulo: 'Aberto' },
        { valor: 'fechado', rotulo: 'Fechado' },
      ]}
    />
  );
}

describe('GrupoRadio', () => {
  it('fica num fieldset com legend e troca pelas setas', async () => {
    render(<GrupoControlado />);
    const grupo = screen.getByRole('group', { name: 'Situação' });
    expect(grupo.tagName).toBe('FIELDSET');
    screen.getByRole('radio', { name: 'Aberto' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Fechado' }).checked).toBe(true);
  });

  it('clicar no rótulo escolhe a opção', async () => {
    render(<GrupoControlado />);
    await userEvent.click(screen.getByText('Fechado'));
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Fechado' }).checked).toBe(true);
  });
});
