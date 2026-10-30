SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.personalizacoes
  ADD COLUMN link_instagram text
    CHECK (char_length(link_instagram) <= 300
      AND link_instagram ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9._-]+/?$');

ALTER TABLE public.sessoes_mesa
  ADD COLUMN motivo_fechamento text CHECK (motivo_fechamento IN ('expirada', 'encerrada'));

-- O dono da tabela passa pela RLS forçada; desligá-la só nesta transação permite o backfill: docs/adr/0016-chamados-conta-e-avaliacao.md
ALTER TABLE public.sessoes_mesa NO FORCE ROW LEVEL SECURITY;
UPDATE public.sessoes_mesa SET motivo_fechamento = 'expirada' WHERE fechada_em IS NOT NULL;
ALTER TABLE public.sessoes_mesa FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sessoes_mesa
  ADD CONSTRAINT sessoes_mesa_motivo_com_fechamento
    CHECK ((fechada_em IS NULL) = (motivo_fechamento IS NULL));

CREATE TABLE public.chamados (
  restaurante_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT uuidv7(),
  sessao_mesa_id uuid NOT NULL,
  mesa_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('garcom', 'conta')),
  situacao text NOT NULL DEFAULT 'aguardando'
    CHECK (situacao IN ('aguardando', 'em_atendimento', 'concluido', 'cancelado')),
  chave_idempotencia uuid NOT NULL,
  assumido_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurante_id, id),
  UNIQUE (restaurante_id, chave_idempotencia),
  FOREIGN KEY (restaurante_id, sessao_mesa_id) REFERENCES public.sessoes_mesa (restaurante_id, id),
  FOREIGN KEY (restaurante_id, mesa_id) REFERENCES public.mesas (restaurante_id, id)
);

CREATE UNIQUE INDEX chamados_um_aberto_por_tipo_idx
  ON public.chamados (restaurante_id, sessao_mesa_id, tipo)
  WHERE situacao IN ('aguardando', 'em_atendimento');

ALTER TABLE public.chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamados FORCE ROW LEVEL SECURITY;

CREATE POLICY chamados_isolamento ON public.chamados
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT, UPDATE (situacao, assumido_por, atualizado_em) ON public.chamados TO app_runtime;

-- A máquina de estados do chamado também vale no banco: docs/adr/0016-chamados-conta-e-avaliacao.md
CREATE FUNCTION app.exigir_transicao_do_chamado() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.situacao = OLD.situacao THEN
    RETURN NEW;
  END IF;
  IF (OLD.situacao, NEW.situacao) NOT IN (
    ('aguardando', 'em_atendimento'), ('em_atendimento', 'concluido'),
    ('aguardando', 'cancelado'), ('em_atendimento', 'cancelado')
  ) THEN
    RAISE EXCEPTION 'Transição de chamado inválida: % para %', OLD.situacao, NEW.situacao
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER chamados_transicao
  BEFORE UPDATE OF situacao ON public.chamados
  FOR EACH ROW EXECUTE FUNCTION app.exigir_transicao_do_chamado();

GRANT EXECUTE ON FUNCTION app.exigir_transicao_do_chamado() TO app_runtime;
