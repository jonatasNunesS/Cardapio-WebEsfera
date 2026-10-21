SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.planos (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  codigo text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  nome text NOT NULL,
  preco_centavos integer NOT NULL CHECK (preco_centavos >= 0),
  limite_mesas integer NOT NULL CHECK (limite_mesas > 0),
  recursos jsonb NOT NULL DEFAULT '{}'::jsonb,
  mp_plano_id text UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.planos TO app_runtime;

CREATE TABLE public.restaurantes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nome text NOT NULL CHECK (length(nome) BETWEEN 1 AND 120),
  situacao text NOT NULL DEFAULT 'teste'
    CHECK (situacao IN ('teste', 'ativo', 'carencia', 'inadimplente', 'cancelado')),
  fuso_horario text NOT NULL DEFAULT 'America/Sao_Paulo',
  teste_termina_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX restaurantes_situacao_idx ON public.restaurantes (situacao);

ALTER TABLE public.restaurantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurantes FORCE ROW LEVEL SECURITY;

CREATE POLICY restaurantes_isolamento ON public.restaurantes
  FOR ALL TO app_runtime
  USING (id = app.restaurante_atual())
  WITH CHECK (id = app.restaurante_atual());

GRANT SELECT, INSERT, UPDATE ON public.restaurantes TO app_runtime;
GRANT SELECT ON public.restaurantes TO funcoes_privilegiadas;

CREATE TABLE public.historico_slugs (
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id),
  id uuid NOT NULL DEFAULT uuidv7(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurante_id, id)
);

ALTER TABLE public.historico_slugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_slugs FORCE ROW LEVEL SECURITY;

CREATE POLICY historico_slugs_isolamento ON public.historico_slugs
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT ON public.historico_slugs TO app_runtime;
GRANT SELECT ON public.historico_slugs TO funcoes_privilegiadas;

CREATE FUNCTION app.exigir_slug_no_historico() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.historico_slugs h
    WHERE h.restaurante_id = NEW.id AND h.slug = NEW.slug
  ) THEN
    RAISE EXCEPTION 'O slug % precisa estar em historico_slugs do mesmo restaurante', NEW.slug
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER restaurantes_slug_no_historico
  AFTER INSERT OR UPDATE OF slug ON public.restaurantes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.exigir_slug_no_historico();

GRANT EXECUTE ON FUNCTION app.exigir_slug_no_historico() TO app_runtime;
