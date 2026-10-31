import { ROTAS_DO_CONVITE } from '@cardapio/contratos';
import { Aviso, Botao, CampoTexto, PaginaDeAcesso, useEnvioDeFormulario } from '@cardapio/ui';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api } from '../api.ts';
import { MARCA } from '../telas/Marca.ts';
import estilos from '../telas/Painel.module.css';

export function TelaDoConvite() {
  const token = new URLSearchParams(useLocation().hash.replace(/^#/, '')).get('token') ?? '';
  const [senha, setSenha] = useState('');
  const navegar = useNavigate();
  const envio = useEnvioDeFormulario(
    () => api.pedir('POST', ROTAS_DO_CONVITE.aceitacao, { token, senha }),
    () => {
      void navegar('/entrar');
    },
  );
  return (
    <PaginaDeAcesso
      marca={MARCA}
      titulo="Boas-vindas ao Cardápio WebEsfera"
      descricao="Crie a sua senha para entrar no painel do seu restaurante."
    >
      <form noValidate onSubmit={envio.aoEnviar} className={estilos.formulario}>
        {envio.erros.geral !== undefined && <Aviso tipo="erro">{envio.erros.geral}</Aviso>}
        <CampoTexto
          id={envio.idDoCampo('senha')}
          rotulo="Sua senha"
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
          Criar senha e entrar
        </Botao>
      </form>
    </PaginaDeAcesso>
  );
}
