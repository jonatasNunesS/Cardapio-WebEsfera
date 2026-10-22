import { ROTAS_DO_PAINEL } from '@cardapio/contratos';
import { Aviso, Botao, CampoTexto, PaginaDeAcesso, useEnvioDeFormulario } from '@cardapio/ui';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.ts';
import { MARCA } from './Marca.ts';
import estilos from './Painel.module.css';

export function EsqueciASenha() {
  const [email, setEmail] = useState('');
  const envio = useEnvioDeFormulario(
    () => api.pedir('POST', ROTAS_DO_PAINEL.pedidoDeRedefinicao, { email }),
    useCallback(() => undefined, []),
  );
  return (
    <PaginaDeAcesso
      marca={MARCA}
      titulo="Redefinir a senha"
      descricao="Enviamos um link para o seu e-mail. Ele vale por 30 minutos."
      rodape={<Link to="/entrar">Voltar para entrar</Link>}
    >
      {envio.concluido === null ? (
        <form noValidate onSubmit={envio.aoEnviar} className={estilos.formulario}>
          {envio.erros.geral !== undefined && <Aviso tipo="erro">{envio.erros.geral}</Aviso>}
          <CampoTexto
            id={envio.idDoCampo('email')}
            rotulo="E-mail da conta"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(evento) => {
              setEmail(evento.target.value);
            }}
            erro={envio.erroDe('email')}
          />
          <Botao type="submit" larguraTotal carregando={envio.enviando}>
            Enviar link
          </Botao>
        </form>
      ) : (
        <Aviso tipo="sucesso">Se houver uma conta com esse e-mail, o link chega em alguns minutos.</Aviso>
      )}
    </PaginaDeAcesso>
  );
}
