import { useId } from 'react';
import { descricaoDoCampo, estilosDoCampo, MensagensDoCampo } from './Campo.tsx';

export interface OpcaoRadio {
  readonly valor: string;
  readonly rotulo: string;
  readonly desativada?: boolean | undefined;
}

export interface PropriedadesGrupoRadio {
  readonly legenda: string;
  readonly nome: string;
  readonly opcoes: readonly OpcaoRadio[];
  readonly valor: string;
  readonly aoMudar: (valor: string) => void;
  readonly dica?: string | undefined;
  readonly erro?: string | undefined;
  readonly desativado?: boolean | undefined;
}

export function Radio({
  nome,
  opcao,
  marcado,
  aoMudar,
}: {
  nome: string;
  opcao: OpcaoRadio;
  marcado: boolean;
  aoMudar: (valor: string) => void;
}) {
  return (
    <label className={estilosDoCampo.opcao}>
      <input
        type="radio"
        name={nome}
        value={opcao.valor}
        checked={marcado}
        disabled={opcao.desativada}
        onChange={() => {
          aoMudar(opcao.valor);
        }}
      />
      {opcao.rotulo}
    </label>
  );
}

export function GrupoRadio({
  legenda,
  nome,
  opcoes,
  valor,
  aoMudar,
  dica,
  erro,
  desativado = false,
}: PropriedadesGrupoRadio) {
  const grupoId = useId();
  const idDica = `${grupoId}-dica`;
  const idErro = `${grupoId}-erro`;
  return (
    <fieldset
      className={estilosDoCampo.grupo}
      disabled={desativado}
      aria-describedby={descricaoDoCampo(idDica, idErro, dica, erro)}
      aria-invalid={erro === undefined ? undefined : true}
    >
      <legend className={estilosDoCampo.legenda}>{legenda}</legend>
      {opcoes.map((opcao) => (
        <Radio
          key={opcao.valor}
          nome={nome}
          opcao={opcao}
          marcado={opcao.valor === valor}
          aoMudar={aoMudar}
        />
      ))}
      <MensagensDoCampo idDica={idDica} idErro={idErro} dica={dica} erro={erro} />
    </fieldset>
  );
}
