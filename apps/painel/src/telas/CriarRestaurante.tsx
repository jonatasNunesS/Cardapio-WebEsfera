import { ROTAS_DO_PAINEL, type RespostaRestauranteCriado } from '@cardapio/contratos';
import { Aviso, Botao, CampoTexto, PaginaDeAcesso, useEnvioDeFormulario } from '@cardapio/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, CHAVE_DA_SESSAO } from '../api.ts';
import { MARCA } from './Marca.ts';
import estilos from './Painel.module.css';

export function CriarRestaurante() {
  const [nome, setNome] = useState('');
  const navegar = useNavigate();
  const consultas = useQueryClient();
  const envio = useEnvioDeFormulario(
    () => api.pedir<RespostaRestauranteCriado>('POST', ROTAS_DO_PAINEL.restaurante, { nome }),
    () => {
      void consultas.invalidateQueries({ queryKey: CHAVE_DA_SESSAO });
      void navegar('/personalizacao');
    },
  );
  return (
    <PaginaDeAcesso
      marca={MARCA}
      titulo="Criar o restaurante"
      descricao="O nome aparece no cardápio e vira o endereço dos QR Codes das mesas."
    >
      <form noValidate onSubmit={envio.aoEnviar} className={estilos.formulario}>
        {envio.erros.geral !== undefined && <Aviso tipo="erro">{envio.erros.geral}</Aviso>}
        <CampoTexto
          id={envio.idDoCampo('nome')}
          rotulo="Nome do restaurante"
          autoComplete="organization"
          value={nome}
          onChange={(evento) => {
            setNome(evento.target.value);
          }}
          erro={envio.erroDe('nome')}
        />
        <Botao type="submit" larguraTotal carregando={envio.enviando}>
          Criar restaurante
        </Botao>
      </form>
    </PaginaDeAcesso>
  );
}
