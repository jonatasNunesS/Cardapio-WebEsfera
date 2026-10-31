import { rotaCom, ROTAS_DA_EQUIPE as ROTAS, type ChamadoNaFilaApi } from '@cardapio/contratos';
import { ItemFila } from '@cardapio/ui';
import type { AcaoNaFila } from './api-da-fila.ts';
import estilos from './Fila.module.css';

const TIPOS = { garcom: 'Chamou o garçom', conta: 'Pediu a conta' } as const;

const minutosDesde = (momento: string, agora: number) =>
  `${String(Math.max(0, Math.floor((agora - Date.parse(momento)) / 60_000)))} min`;

export function ChamadosDaFila({
  chamados,
  acao,
  novos,
  agora,
}: {
  readonly chamados: readonly ChamadoNaFilaApi[];
  readonly acao: AcaoNaFila;
  readonly novos: ReadonlySet<string>;
  readonly agora: number;
}) {
  const avancar = (chamado: ChamadoNaFilaApi, texto: string) => () => {
    void acao(
      rotaCom(ROTAS.avancoDoChamado, { id: chamado.id }),
      { situacaoEsperada: chamado.situacao },
      texto,
    );
  };
  const colunas = [
    ['aguardando', 'Aguardando'],
    ['em_atendimento', 'Em atendimento'],
    ['concluido', 'Concluídos'],
  ] as const;
  return (
    <section aria-labelledby="titulo-chamados" className={estilos.secao}>
      <h2 id="titulo-chamados">Chamados</h2>
      <div className={estilos.colunas}>
        {colunas.map(([situacao, titulo]) => (
          <section key={situacao} aria-label={`Chamados: ${titulo}`} className={estilos.coluna}>
            <h3 className={estilos.colunaTitulo}>{titulo}</h3>
            {chamados
              .filter((chamado) => chamado.situacao === situacao)
              .map((chamado) => (
                <div key={chamado.id} className={novos.has(chamado.id) ? estilos.novo : undefined}>
                  {situacao === 'concluido' ? (
                    <p className={estilos.cartao}>
                      Mesa {chamado.mesaNumero}: {TIPOS[chamado.tipo]}
                    </p>
                  ) : (
                    <ItemFila
                      mesa={chamado.mesaNumero}
                      tipo={TIPOS[chamado.tipo]}
                      tempo={minutosDesde(chamado.criadoEm, agora)}
                      estado={situacao === 'aguardando' ? 'novo' : 'assumido'}
                      aoAssumir={avancar(chamado, `Mesa ${String(chamado.mesaNumero)} assumida.`)}
                      aoConcluir={avancar(
                        chamado,
                        `Chamado da mesa ${String(chamado.mesaNumero)} concluído.`,
                      )}
                    />
                  )}
                </div>
              ))}
          </section>
        ))}
      </div>
    </section>
  );
}
