SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.suspensoes_restaurante (
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id),
  id uuid NOT NULL DEFAULT uuidv7(),
  motivo text NOT NULL CHECK (char_length(motivo) BETWEEN 3 AND 500),
  suspensa_por uuid NOT NULL REFERENCES public.administradores (id),
  suspensa_em timestamptz NOT NULL DEFAULT now(),
  motivo_reativacao text CHECK (char_length(motivo_reativacao) BETWEEN 3 AND 500),
  reativada_por uuid REFERENCES public.administradores (id),
  reativada_em timestamptz,
  PRIMARY KEY (restaurante_id, id),
  CONSTRAINT suspensoes_restaurante_reativacao_completa CHECK (
    (reativada_em IS NULL) = (reativada_por IS NULL)
    AND (reativada_em IS NULL) = (motivo_reativacao IS NULL)
  )
);

CREATE UNIQUE INDEX suspensoes_restaurante_uma_aberta_idx
  ON public.suspensoes_restaurante (restaurante_id) WHERE reativada_em IS NULL;

ALTER TABLE public.suspensoes_restaurante ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suspensoes_restaurante FORCE ROW LEVEL SECURITY;

CREATE POLICY suspensoes_restaurante_isolamento ON public.suspensoes_restaurante
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT, UPDATE (motivo_reativacao, reativada_por, reativada_em)
  ON public.suspensoes_restaurante TO app_runtime;
GRANT SELECT ON public.suspensoes_restaurante TO funcoes_privilegiadas;

CREATE TABLE public.convites (
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id),
  id uuid NOT NULL DEFAULT uuidv7(),
  usuario_id uuid NOT NULL REFERENCES public.usuarios (id),
  hash_token text NOT NULL UNIQUE CHECK (hash_token ~ '^[0-9a-f]{64}$'),
  criado_por uuid NOT NULL REFERENCES public.administradores (id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  usado_em timestamptz,
  invalidado_em timestamptz,
  PRIMARY KEY (restaurante_id, id),
  CHECK (expira_em > criado_em),
  CONSTRAINT convites_uso_ou_invalidacao CHECK (usado_em IS NULL OR invalidado_em IS NULL)
);

CREATE INDEX convites_abertos_idx ON public.convites (restaurante_id, usuario_id)
  WHERE usado_em IS NULL AND invalidado_em IS NULL;

ALTER TABLE public.convites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convites FORCE ROW LEVEL SECURITY;

CREATE POLICY convites_isolamento ON public.convites
  FOR ALL TO app_runtime
  USING (restaurante_id = app.restaurante_atual())
  WITH CHECK (restaurante_id = app.restaurante_atual());

GRANT SELECT, INSERT, UPDATE (invalidado_em) ON public.convites TO app_runtime;
GRANT SELECT, UPDATE (usado_em) ON public.convites TO funcoes_privilegiadas;

GRANT INSERT ON public.restaurantes, public.historico_slugs, public.vinculos TO funcoes_privilegiadas;
GRANT SELECT ON public.pedidos TO funcoes_privilegiadas;

CREATE FUNCTION app.admin_valido(p_administrador_id uuid) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.administradores a
     WHERE a.id = p_administrador_id AND a.ativo AND a.segredo_totp_cifrado IS NOT NULL
  )
$$;

REVOKE ALL ON FUNCTION app.admin_valido(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.admin_valido(uuid) TO app_runtime;
ALTER FUNCTION app.admin_valido(uuid) OWNER TO funcoes_privilegiadas;

-- Lista de todos os restaurantes só para admin com segundo fator: docs/adr/0017-intermediario-essencial.md
CREATE FUNCTION app.admin_listar_restaurantes(p_administrador_id uuid)
RETURNS TABLE (
  restaurante_id uuid,
  nome text,
  slug text,
  situacao text,
  teste_termina_em timestamptz,
  suspenso boolean,
  criado_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT r.id, r.nome, r.slug, r.situacao, r.teste_termina_em,
         EXISTS (SELECT 1 FROM public.suspensoes_restaurante s
                  WHERE s.restaurante_id = r.id AND s.reativada_em IS NULL),
         r.criado_em
    FROM public.restaurantes r
   WHERE app.admin_valido(p_administrador_id)
   ORDER BY r.criado_em DESC
   LIMIT 500
$$;

REVOKE ALL ON FUNCTION app.admin_listar_restaurantes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.admin_listar_restaurantes(uuid) TO app_runtime;
ALTER FUNCTION app.admin_listar_restaurantes(uuid) OWNER TO funcoes_privilegiadas;

CREATE FUNCTION app.admin_resolver_restaurante(p_administrador_id uuid, p_slug text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT r.id FROM public.restaurantes r
   WHERE r.slug = p_slug AND app.admin_valido(p_administrador_id)
$$;

REVOKE ALL ON FUNCTION app.admin_resolver_restaurante(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.admin_resolver_restaurante(uuid, text) TO app_runtime;
ALTER FUNCTION app.admin_resolver_restaurante(uuid, text) OWNER TO funcoes_privilegiadas;

-- Cria conta do dono e restaurante numa transação; o restaurante é o do contexto: docs/adr/0017-intermediario-essencial.md
CREATE FUNCTION app.admin_criar_restaurante(
  p_administrador_id uuid,
  p_nome text,
  p_slug text,
  p_teste_termina_em timestamptz,
  p_dono_nome text,
  p_dono_email text,
  p_hash_senha_inutil text
)
RETURNS TABLE (desfecho text, usuario_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_restaurante_id uuid := app.restaurante_atual();
  v_usuario_id uuid;
BEGIN
  IF NOT app.admin_valido(p_administrador_id) OR v_restaurante_id IS NULL THEN
    RETURN QUERY SELECT 'proibido'::text, NULL::uuid;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.historico_slugs h WHERE h.slug = p_slug) THEN
    RETURN QUERY SELECT 'slug-ocupado'::text, NULL::uuid;
    RETURN;
  END IF;
  INSERT INTO public.usuarios (nome, email, hash_senha)
  VALUES (p_dono_nome, p_dono_email, p_hash_senha_inutil)
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO v_usuario_id;
  IF v_usuario_id IS NULL THEN
    RETURN QUERY SELECT 'email-ocupado'::text, NULL::uuid;
    RETURN;
  END IF;
  INSERT INTO public.restaurantes (id, slug, nome, situacao, teste_termina_em)
  VALUES (v_restaurante_id, p_slug, p_nome, 'teste', p_teste_termina_em);
  INSERT INTO public.historico_slugs (restaurante_id, slug) VALUES (v_restaurante_id, p_slug);
  INSERT INTO public.vinculos (restaurante_id, usuario_id, papel) VALUES (v_restaurante_id, v_usuario_id, 'dono');
  INSERT INTO public.auditoria (restaurante_id, autor_tipo, autor_id, acao, entidade, entidade_id, depois)
  VALUES (v_restaurante_id, 'administrador', p_administrador_id, 'restaurante.criar', 'restaurante',
          v_restaurante_id, jsonb_build_object('slug', p_slug, 'donoId', v_usuario_id));
  RETURN QUERY SELECT 'criado'::text, v_usuario_id;
END
$$;

REVOKE ALL ON FUNCTION app.admin_criar_restaurante(uuid, text, text, timestamptz, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.admin_criar_restaurante(uuid, text, text, timestamptz, text, text, text) TO app_runtime;
ALTER FUNCTION app.admin_criar_restaurante(uuid, text, text, timestamptz, text, text, text) OWNER TO funcoes_privilegiadas;

CREATE FUNCTION app.admin_indicadores(p_administrador_id uuid, p_agora timestamptz)
RETURNS TABLE (chave text, total integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH situacoes AS (
    SELECT CASE WHEN EXISTS (SELECT 1 FROM public.suspensoes_restaurante s
                              WHERE s.restaurante_id = r.id AND s.reativada_em IS NULL)
                THEN 'suspenso' ELSE r.situacao END AS chave
      FROM public.restaurantes r
  )
  SELECT 'situacao:' || chave, count(*)::integer FROM situacoes
   WHERE app.admin_valido(p_administrador_id) GROUP BY chave
  UNION ALL
  SELECT 'pedidos_24h', count(*)::integer FROM public.pedidos p
   WHERE app.admin_valido(p_administrador_id) AND p.criado_em > p_agora - interval '24 hours'
$$;

REVOKE ALL ON FUNCTION app.admin_indicadores(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.admin_indicadores(uuid, timestamptz) TO app_runtime;
ALTER FUNCTION app.admin_indicadores(uuid, timestamptz) OWNER TO funcoes_privilegiadas;

-- O convidado ainda não tem sessão nem restaurante no contexto: docs/adr/0017-intermediario-essencial.md
CREATE FUNCTION app.aceitar_convite(p_hash_token text, p_hash_senha text, p_agora timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_convite record;
BEGIN
  UPDATE public.convites c SET usado_em = p_agora
   WHERE c.hash_token = p_hash_token AND c.usado_em IS NULL AND c.invalidado_em IS NULL
     AND c.expira_em > p_agora
  RETURNING c.restaurante_id, c.id, c.usuario_id INTO v_convite;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  UPDATE public.usuarios SET hash_senha = p_hash_senha, atualizado_em = p_agora WHERE id = v_convite.usuario_id;
  UPDATE public.sessoes SET revogada_em = p_agora WHERE usuario_id = v_convite.usuario_id AND revogada_em IS NULL;
  INSERT INTO public.auditoria (restaurante_id, autor_tipo, autor_id, acao, entidade, entidade_id)
  VALUES (v_convite.restaurante_id, 'usuario', v_convite.usuario_id, 'convite.aceitar', 'convite', v_convite.id);
  RETURN true;
END
$$;

REVOKE ALL ON FUNCTION app.aceitar_convite(text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.aceitar_convite(text, text, timestamptz) TO app_runtime;
ALTER FUNCTION app.aceitar_convite(text, text, timestamptz) OWNER TO funcoes_privilegiadas;

CREATE FUNCTION app.admin_dono_do_restaurante(p_administrador_id uuid)
RETURNS TABLE (usuario_id uuid, nome text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id, u.nome, u.email
    FROM public.vinculos v JOIN public.usuarios u ON u.id = v.usuario_id
   WHERE v.restaurante_id = app.restaurante_atual() AND v.papel = 'dono'
     AND app.admin_valido(p_administrador_id)
   ORDER BY v.criado_em
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION app.admin_dono_do_restaurante(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.admin_dono_do_restaurante(uuid) TO app_runtime;
ALTER FUNCTION app.admin_dono_do_restaurante(uuid) OWNER TO funcoes_privilegiadas;
