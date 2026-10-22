import { ROTAS_DO_PAINEL } from '@cardapio/contratos';
import { Aviso, Botao, CampoTexto, PaginaDeAcesso, useEnvioDeFormulario } from '@cardapio/ui';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { api } from '../api.ts';
import { MARCA } from './Marca.ts';
import estilos from './Painel.module.css';

export function RedefinirSenha() {
  const token = useLocation().hash.replace(/^#/, '');
  const [senha, setSenha] = useState('');
  const navegar = useNavigate();
  const envio = useEnvioDeFormulario(
    () => api.pedir('POST', ROTAS_DO_PAINEL.confirmacaoDeRedefinicao, { token, senha }),
    () => {
      void navegar('/entrar');
    },
  );
  return (
    <PaginaDeAcesso
      marca={MARCA}
      titulo="Criar uma senha nova"
      descricao="Ao salvar, você sai de todos os aparelhos."
      rodape={<Link to="/esqueci-a-senha">Pedir outro link</Link>}
    >
      <form noValidate onSubmit={envio.aoEnviar} className={estilos.formulario}>
        {envio.erros.geral !== undefined && <Aviso tipo="erro">{envio.erros.geral}</Aviso>}
        <CampoTexto
          id={envio.idDoCampo('senha')}
          rotulo="Senha nova"
          type="password"
          autoComplete="new-password"
          dica="Pelo menos 10 caracteres."
          value={senha}
          onChange={(evento) => {
            setSenha(evento.target.value);
          }}
          erro={envio.erroDe('senha')}
        />
        <Botao type="submit" larguraTotal carregando={envio.enviando}>
          Salvar senha
        </Botao>
      </form>
    </PaginaDeAcesso>
  );
}
