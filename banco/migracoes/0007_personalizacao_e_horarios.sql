SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.personalizacoes (
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id),
  id uuid NOT NULL DEFAULT uuidv7(),
  cor_marca text NOT NULL CHECK (cor_marca ~ '^#[0-9A-F]{6}$'),
  cor_sobre_marca text NOT NULL CHECK (cor_sobre_marca ~ '^#[0-9A-F]{6}$'),
  cor_marca_texto text NOT NULL CHECK (cor_marca_texto ~ '^#[0-9A-F]{6}$'),
  logo_url text CHECK (length(logo_url) <= 500),
  capa_url text CHECK (length(capa_url) <= 500),
  frase text NOT NULL DEFAULT '' CHECK (length(frase) <= 200),
  link_avaliacao_google text CHECK (link_avaliacao_google ~ '^https://'),
  textos jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(textos) = 'object'),
  versao integer NOT NULL DEFAULT 1 CHECK (versao > 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurante_id, id),
  UNIQUE (restaurante_id)
);

ALTER TABLE public.personalizacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalizacoes FORCE ROW LEVEL SECURITY;

CREATE POLICY personalizacoes_isolamento ON public.personalizacoes
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT, UPDATE ON public.personalizacoes TO app_runtime;

CREATE TABLE public.horarios (
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id),
  id uuid NOT NULL DEFAULT uuidv7(),
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  abre time NOT NULL,
  fecha time NOT NULL,
  PRIMARY KEY (restaurante_id, id),
  UNIQUE (restaurante_id, dia_semana),
  CHECK (abre <> fecha)
);

ALTER TABLE public.horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horarios FORCE ROW LEVEL SECURITY;

CREATE POLICY horarios_isolamento ON public.horarios
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT, DELETE ON public.horarios TO app_runtime;
