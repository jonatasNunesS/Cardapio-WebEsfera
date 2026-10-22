SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE SCHEMA extensoes;
REVOKE ALL ON SCHEMA extensoes FROM PUBLIC;
GRANT USAGE ON SCHEMA extensoes TO app_runtime, funcoes_privilegiadas;
CREATE EXTENSION unaccent SCHEMA extensoes;

-- unaccent() é STABLE; com o dicionário explícito o resultado não muda, e IMMUTABLE permite índice e coluna gerada: docs/adr/0010-cardapio-e-busca.md
CREATE FUNCTION app.sem_acento(texto text) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = pg_catalog, pg_temp
RETURN extensoes.unaccent('extensoes.unaccent'::regdictionary, texto);

REVOKE ALL ON FUNCTION app.sem_acento(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.sem_acento(text) TO app_runtime;

ALTER TABLE public.restaurantes
  ADD COLUMN versao_cardapio bigint NOT NULL DEFAULT 1 CHECK (versao_cardapio > 0);

CREATE TABLE public.categorias (
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id),
  id uuid NOT NULL DEFAULT uuidv7(),
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 120),
  ordem integer NOT NULL,
  versao integer NOT NULL DEFAULT 1 CHECK (versao > 0),
  removida_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurante_id, id)
);

CREATE UNIQUE INDEX categorias_nome_ativo_idx
  ON public.categorias (restaurante_id, lower(app.sem_acento(nome)))
  WHERE removida_em IS NULL;

CREATE TABLE public.pratos (
  restaurante_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT uuidv7(),
  categoria_id uuid NOT NULL,
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 240),
  descricao text NOT NULL DEFAULT '' CHECK (char_length(descricao) <= 1200),
  preco_centavos integer NOT NULL CHECK (preco_centavos BETWEEN 0 AND 100000000),
  disponivel boolean NOT NULL DEFAULT true,
  destaque boolean NOT NULL DEFAULT false,
  ordem integer NOT NULL,
  versao integer NOT NULL DEFAULT 1 CHECK (versao > 0),
  midia_id uuid,
  removido_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  busca tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', app.sem_acento(nome)), 'A')
    || setweight(to_tsvector('portuguese', app.sem_acento(descricao)), 'B')
  ) STORED,
  PRIMARY KEY (restaurante_id, id),
  FOREIGN KEY (restaurante_id, categoria_id) REFERENCES public.categorias (restaurante_id, id)
);

CREATE INDEX pratos_busca_idx ON public.pratos USING gin (busca);
CREATE INDEX pratos_categoria_ordem_idx
  ON public.pratos (restaurante_id, categoria_id, ordem)
  WHERE removido_em IS NULL;

ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pratos FORCE ROW LEVEL SECURITY;

CREATE POLICY categorias_isolamento ON public.categorias
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

CREATE POLICY pratos_isolamento ON public.pratos
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT, UPDATE ON public.categorias TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON public.pratos TO app_runtime;

CREATE FUNCTION app.publicar_cardapio() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  UPDATE public.restaurantes
     SET versao_cardapio = versao_cardapio + 1
   WHERE id = app.restaurante_atual();
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION app.publicar_cardapio() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.publicar_cardapio() TO app_runtime;

CREATE TRIGGER categorias_publicar_cardapio
  AFTER INSERT OR UPDATE OR DELETE ON public.categorias
  FOR EACH STATEMENT EXECUTE FUNCTION app.publicar_cardapio();
CREATE TRIGGER pratos_publicar_cardapio
  AFTER INSERT OR UPDATE OR DELETE ON public.pratos
  FOR EACH STATEMENT EXECUTE FUNCTION app.publicar_cardapio();
CREATE TRIGGER personalizacoes_publicar_cardapio
  AFTER INSERT OR UPDATE OR DELETE ON public.personalizacoes
  FOR EACH STATEMENT EXECUTE FUNCTION app.publicar_cardapio();
CREATE TRIGGER horarios_publicar_cardapio
  AFTER INSERT OR UPDATE OR DELETE ON public.horarios
  FOR EACH STATEMENT EXECUTE FUNCTION app.publicar_cardapio();

CREATE FUNCTION app.resolver_cardapio(p_slug text)
RETURNS TABLE (
  situacao text,
  restaurante_id uuid,
  slug_atual text,
  versao_cardapio bigint,
  fuso_horario text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  achado record;
BEGIN
  SELECT r.id AS rid, r.slug AS slug, r.situacao AS sit, r.versao_cardapio AS versao, r.fuso_horario AS fuso
    INTO achado
    FROM public.restaurantes r
   WHERE r.slug = p_slug;

  IF NOT FOUND THEN
    SELECT r.id AS rid, r.slug AS slug, r.situacao AS sit, r.versao_cardapio AS versao, r.fuso_horario AS fuso
      INTO achado
      FROM public.historico_slugs h
      JOIN public.restaurantes r ON r.id = h.restaurante_id
     WHERE h.slug = p_slug;
  END IF;

  IF NOT FOUND OR achado.sit = 'cancelado' THEN
    RETURN QUERY SELECT 'inexistente'::text, NULL::uuid, NULL::text, NULL::bigint, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    CASE WHEN achado.slug = p_slug THEN 'valido' ELSE 'redirecionar' END,
    achado.rid, achado.slug, achado.versao, achado.fuso;
END
$$;

REVOKE ALL ON FUNCTION app.resolver_cardapio(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolver_cardapio(text) TO app_runtime;
ALTER FUNCTION app.resolver_cardapio(text) OWNER TO funcoes_privilegiadas;
