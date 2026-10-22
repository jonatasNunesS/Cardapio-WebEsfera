import { ROTAS_DO_PAINEL } from '@cardapio/contratos';
import { Aviso, Botao, CampoTexto, PaginaDeAcesso, useEnvioDeFormulario } from '@cardapio/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, CHAVE_DA_SESSAO } from '../api.ts';
import { MARCA } from './Marca.ts';
import estilos from './Painel.module.css';

export function Entrar() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const navegar = useNavigate();
  const consultas = useQueryClient();
  const envio = useEnvioDeFormulario(
    () => api.pedir('POST', ROTAS_DO_PAINEL.sessao, { email, senha }),
    () => {
      void consultas.invalidateQueries({ queryKey: CHAVE_DA_SESSAO });
      void navegar('/');
    },
  );
  return (
    <PaginaDeAcesso
      marca={MARCA}
      titulo="Entrar no painel"
      rodape={
        <>
          <Link to="/criar-conta">Criar conta</Link>
          <Link to="/esqueci-a-senha">Esqueci a senha</Link>
        </>
      }
    >
      <form noValidate onSubmit={envio.aoEnviar} className={estilos.formulario}>
        {envio.erros.geral !== undefined && <Aviso tipo="erro">{envio.erros.geral}</Aviso>}
        <CampoTexto
          id={envio.idDoCampo('email')}
          rotulo="E-mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(evento) => {
            setEmail(evento.target.value);
          }}
          erro={envio.erroDe('email')}
        />
        <CampoTexto
          id={envio.idDoCampo('senha')}
          rotulo="Senha"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(evento) => {
            setSenha(evento.target.value);
          }}
          erro={envio.erroDe('senha')}
        />
        <Botao type="submit" larguraTotal carregando={envio.enviando}>
          Entrar
        </Botao>
      </form>
    </PaginaDeAcesso>
  );
}
