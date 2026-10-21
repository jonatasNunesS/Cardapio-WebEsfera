SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.mesas (
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id),
  id uuid NOT NULL DEFAULT uuidv7(),
  numero integer NOT NULL CHECK (numero BETWEEN 1 AND 999),
  nome text CHECK (length(nome) <= 60),
  area text CHECK (length(area) <= 60),
  codigo text NOT NULL UNIQUE CHECK (codigo ~ '^[A-Za-z0-9_-]{22}$'),
  ativa boolean NOT NULL DEFAULT true,
  codigo_gerado_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurante_id, id),
  UNIQUE (restaurante_id, numero)
);

ALTER TABLE public.mesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mesas FORCE ROW LEVEL SECURITY;

CREATE POLICY mesas_isolamento ON public.mesas
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT, UPDATE ON public.mesas TO app_runtime;
GRANT SELECT ON public.mesas TO funcoes_privilegiadas;

CREATE TABLE public.historico_numeros_mesa (
  restaurante_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT uuidv7(),
  mesa_id uuid NOT NULL,
  numero integer NOT NULL CHECK (numero BETWEEN 1 AND 999),
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurante_id, id),
  UNIQUE (restaurante_id, mesa_id, numero),
  FOREIGN KEY (restaurante_id, mesa_id) REFERENCES public.mesas (restaurante_id, id)
);

ALTER TABLE public.historico_numeros_mesa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_numeros_mesa FORCE ROW LEVEL SECURITY;

CREATE POLICY historico_numeros_mesa_isolamento ON public.historico_numeros_mesa
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT ON public.historico_numeros_mesa TO app_runtime;
GRANT SELECT ON public.historico_numeros_mesa TO funcoes_privilegiadas;

CREATE TABLE public.sessoes_mesa (
  restaurante_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT uuidv7(),
  mesa_id uuid NOT NULL,
  aberta_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  fechada_em timestamptz,
  PRIMARY KEY (restaurante_id, id),
  FOREIGN KEY (restaurante_id, mesa_id) REFERENCES public.mesas (restaurante_id, id),
  CHECK (expira_em > aberta_em)
);

CREATE UNIQUE INDEX sessoes_mesa_uma_aberta_idx
  ON public.sessoes_mesa (restaurante_id, mesa_id)
  WHERE fechada_em IS NULL;

CREATE INDEX sessoes_mesa_abertas_expiracao_idx
  ON public.sessoes_mesa (expira_em)
  WHERE fechada_em IS NULL;

ALTER TABLE public.sessoes_mesa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessoes_mesa FORCE ROW LEVEL SECURITY;

CREATE POLICY sessoes_mesa_isolamento ON public.sessoes_mesa
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

CREATE POLICY sessoes_mesa_sistema ON public.sessoes_mesa
  FOR ALL TO app_sistema
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.sessoes_mesa TO app_runtime;
GRANT SELECT ON public.sessoes_mesa TO app_sistema;
GRANT UPDATE (fechada_em) ON public.sessoes_mesa TO app_sistema;
