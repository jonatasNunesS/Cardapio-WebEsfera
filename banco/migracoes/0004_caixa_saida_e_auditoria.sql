SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.caixa_saida (
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id),
  id uuid NOT NULL DEFAULT uuidv7(),
  tipo_evento text NOT NULL CHECK (tipo_evento ~ '^[A-Z][A-Za-z]+$'),
  carga jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  publicado_em timestamptz,
  tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  PRIMARY KEY (restaurante_id, id)
);

CREATE INDEX caixa_saida_pendentes_idx
  ON public.caixa_saida (criado_em)
  WHERE publicado_em IS NULL;

ALTER TABLE public.caixa_saida ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixa_saida FORCE ROW LEVEL SECURITY;

CREATE POLICY caixa_saida_isolamento ON public.caixa_saida
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

CREATE POLICY caixa_saida_sistema ON public.caixa_saida
  FOR ALL TO app_sistema
  USING (true)
  WITH CHECK (true);

GRANT INSERT ON public.caixa_saida TO app_runtime;
GRANT SELECT ON public.caixa_saida TO app_sistema;
GRANT UPDATE (publicado_em, tentativas) ON public.caixa_saida TO app_sistema;

CREATE TABLE public.auditoria (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  restaurante_id uuid REFERENCES public.restaurantes (id),
  autor_tipo text NOT NULL CHECK (autor_tipo IN ('usuario', 'administrador', 'sistema', 'cliente')),
  autor_id uuid,
  acao text NOT NULL,
  entidade text NOT NULL,
  entidade_id uuid,
  antes jsonb,
  depois jsonb,
  motivo text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auditoria_restaurante_criado_em_idx ON public.auditoria (restaurante_id, criado_em);

ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria FORCE ROW LEVEL SECURITY;

CREATE POLICY auditoria_isolamento ON public.auditoria
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT ON public.auditoria TO app_runtime;
