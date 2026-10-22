import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Aviso } from '../componentes/aviso/Aviso.tsx';
import { Botao } from '../componentes/botao/Botao.tsx';
import { CampoTexto } from '../componentes/campo/CampoTexto.tsx';
import { errosDoProblema, useEnvioDeFormulario, type RespostaDoEnvio } from './useEnvioDeFormulario.ts';

function Formulario({
  enviar,
  aoConcluir,
}: {
  enviar: () => Promise<RespostaDoEnvio<string>>;
  aoConcluir: (dados: string) => void;
}) {
  const envio = useEnvioDeFormulario(enviar, aoConcluir);
  return (
    <form noValidate onSubmit={envio.aoEnviar}>
      {envio.erros.geral !== undefined && <Aviso tipo="erro">{envio.erros.geral}</Aviso>}
      <CampoTexto rotulo="E-mail" id={envio.idDoCampo('email')} erro={envio.erroDe('email')} />
      <CampoTexto rotulo="Senha" id={envio.idDoCampo('senha')} erro={envio.erroDe('senha')} />
      <Botao type="submit" carregando={envio.enviando}>
        Enviar
      </Botao>
    </form>
  );
}

async function enviarFormulario() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await Promise.resolve();
  });
}

describe('useEnvioDeFormulario', () => {
  it('erro de um campo: a mensagem fica ligada ao campo e ele recebe o foco', async () => {
    const enviar = () =>
      Promise.resolve({
        ok: false,
        problema: { detail: 'A senha precisa ter pelo menos 10 caracteres.', detalhes: { campo: 'senha' } },
      } as const);
    render(<Formulario enviar={enviar} aoConcluir={vi.fn()} />);

    await enviarFormulario();

    const senha = screen.getByLabelText('Senha');
    expect(senha.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('textbox', { name: 'Senha', description: /pelo menos 10/ })).toBe(senha);
    expect(document.activeElement).toBe(senha);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('erro geral aparece em alerta; sucesso chama o retorno e limpa os erros', async () => {
    let resposta: RespostaDoEnvio<string> = {
      ok: false,
      problema: { detail: 'E-mail ou senha incorretos.' },
    };
    const aoConcluir = vi.fn();
    render(<Formulario enviar={() => Promise.resolve(resposta)} aoConcluir={aoConcluir} />);

    await enviarFormulario();
    expect(screen.getByRole('alert').textContent).toContain('E-mail ou senha incorretos.');

    resposta = { ok: true, dados: 'feito' };
    await enviarFormulario();
    expect(aoConcluir).toHaveBeenCalledWith('feito');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('entrada inválida com lista de campos marca cada campo', () => {
    expect(
      errosDoProblema({
        detail: 'Alguns campos não estão no formato esperado.',
        campos: [{ campo: 'email' }],
      }),
    ).toEqual({
      geral: 'Alguns campos não estão no formato esperado.',
      campos: { email: 'Confira este campo.' },
    });
  });
});
