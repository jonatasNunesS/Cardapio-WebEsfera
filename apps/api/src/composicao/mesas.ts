import type { RelatorDeErros } from '@cardapio/aplicacao';
import {
  cartoesDeQr,
  criarContadorDeTentativas,
  criarLeituraDeMesasDoAdmin,
  criarRepositorioDeMesas,
  criarRepositorioMesas,
  criarSessoesDeMesa,
  geradorDeCodigoDeMesa,
  limiteDeMesasDoTeste,
  type AcessoAoBanco,
  type criarRedis,
} from '@cardapio/infraestrutura';
import type { OpcoesDasMesas } from '../identidade/registrar.ts';

export interface AmbienteDasMesas {
  readonly DOMINIO_CARDAPIO: string;
  readonly CHAVE_SESSAO_MESA: string;
}

export function comporMesas(
  ambiente: AmbienteDasMesas,
  banco: AcessoAoBanco,
  redis: ReturnType<typeof criarRedis>,
  relator: RelatorDeErros,
): OpcoesDasMesas {
  const urlDoCardapio = `https://${ambiente.DOMINIO_CARDAPIO}`;
  return {
    painel: {
      mesas: criarRepositorioDeMesas(banco),
      limite: limiteDeMesasDoTeste,
      codigos: geradorDeCodigoDeMesa,
      cartoes: cartoesDeQr,
      urlDoCardapio,
    },
    sessao: {
      resolucao: criarRepositorioMesas(banco),
      sessoes: criarSessoesDeMesa(banco),
      tentativas: criarContadorDeTentativas(redis),
      relator,
      relogio: { agora: () => new Date() },
    },
    admin: { leitura: criarLeituraDeMesasDoAdmin(banco), urlDoCardapio },
    hostPublico: ambiente.DOMINIO_CARDAPIO,
    chaveDaSessaoDeMesa: ambiente.CHAVE_SESSAO_MESA,
  };
}
