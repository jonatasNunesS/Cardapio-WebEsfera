import { ROTAS_DO_ADMIN, type RespostaEntradaDoAdmin } from '@cardapio/contratos';
import { Aviso, Botao, CampoTexto, PaginaDeAcesso, useEnvioDeFormulario } from '@cardapio/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, MARCA } from '../api.ts';
import estilos from './Admin.module.css';

const DESTINO: Readonly<Record<RespostaEntradaDoAdmin['proximoPasso'], string>> = {
  segundo_fator: '/segundo-fator',
  cadastro: '/primeiro-acesso',
};

export function Entrar() {
  const [credenciais, setCredenciais] = useState({ email: '', senha: '' });
  const navegar = useNavigate();
  const envio = useEnvioDeFormulario(
    () => api.pedir<RespostaEntradaDoAdmin>('POST', ROTAS_DO_ADMIN.sessao, credenciais),
    (resposta) => {
      void navegar(DESTINO[resposta.proximoPasso]);
    },
  );
  return (
    <PaginaDeAcesso marca={MARCA} titulo="Entrar" descricao="Acesso restrito à equipe da WebEsfera.">
      <form noValidate onSubmit={envio.aoEnviar} className={estilos.formulario}>
        {envio.erros.geral !== undefined && <Aviso tipo="erro">{envio.erros.geral}</Aviso>}
        {(['email', 'senha'] as const).map((campo) => (
          <CampoTexto
            key={campo}
            id={envio.idDoCampo(campo)}
            rotulo={campo === 'email' ? 'E-mail' : 'Senha'}
            type={campo === 'email' ? 'email' : 'password'}
            autoComplete={campo === 'email' ? 'username' : 'current-password'}
            value={credenciais[campo]}
            onChange={(evento) => {
              setCredenciais((atuais) => ({ ...atuais, [campo]: evento.target.value }));
            }}
            erro={envio.erroDe(campo)}
          />
        ))}
        <Botao type="submit" larguraTotal carregando={envio.enviando}>
          Continuar
        </Botao>
      </form>
    </PaginaDeAcesso>
  );
}
