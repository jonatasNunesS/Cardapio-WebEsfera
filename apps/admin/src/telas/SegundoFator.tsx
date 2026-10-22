import { ROTAS_DO_ADMIN } from '@cardapio/contratos';
import { Aviso, Botao, CampoTexto, PaginaDeAcesso, useEnvioDeFormulario } from '@cardapio/ui';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, MARCA } from '../api.ts';
import estilos from './Admin.module.css';

export function SegundoFator() {
  const [codigo, setCodigo] = useState('');
  const navegar = useNavigate();
  const envio = useEnvioDeFormulario(
    () => api.pedir('POST', ROTAS_DO_ADMIN.segundoFator, { codigoDeVerificacao: codigo }),
    () => {
      void navegar('/');
    },
  );
  return (
    <PaginaDeAcesso
      marca={MARCA}
      titulo="Confirme que é você"
      descricao="Digite o código do aplicativo autenticador ou um código de recuperação."
      rodape={<Link to="/entrar">Voltar</Link>}
    >
      <form noValidate onSubmit={envio.aoEnviar} className={estilos.formulario}>
        {envio.erros.geral !== undefined && <Aviso tipo="erro">{envio.erros.geral}</Aviso>}
        <CampoTexto
          id={envio.idDoCampo('codigo')}
          rotulo="Código de verificação"
          autoComplete="one-time-code"
          value={codigo}
          onChange={(evento) => {
            setCodigo(evento.target.value);
          }}
          erro={envio.erroDe('codigo')}
        />
        <Botao type="submit" larguraTotal carregando={envio.enviando}>
          Entrar
        </Botao>
      </form>
    </PaginaDeAcesso>
  );
}
