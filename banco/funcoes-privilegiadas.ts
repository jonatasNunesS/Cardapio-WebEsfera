export interface FuncaoPrivilegiada {
  readonly nome: string;
  readonly argumentos: string;
  readonly papel: 'app_runtime' | 'app_sistema';
  readonly motivo: string;
  readonly adr: string;
}

export const FUNCOES_PRIVILEGIADAS: readonly FuncaoPrivilegiada[] = [
  {
    nome: 'app.resolver_mesa',
    argumentos: 'p_slug text, p_numero integer, p_codigo text',
    papel: 'app_runtime',
    motivo:
      'Resolver o QR Code da mesa pelo código antes de existir restaurante no contexto; devolve só ids, o link atual e o motivo da recusa.',
    adr: 'docs/adr/0012-mesas-e-qr.md',
  },
  {
    nome: 'app.resolver_cardapio',
    argumentos: 'p_slug text',
    papel: 'app_runtime',
    motivo:
      'Resolver o slug público do cardápio (ou do histórico) antes de existir restaurante no contexto; devolve só id, slug atual, versão do cardápio e fuso, e nada para restaurante cancelado.',
    adr: 'docs/adr/0010-cardapio-e-busca.md',
  },
  {
    nome: 'app.criar_usuario',
    argumentos: 'p_nome text, p_email text, p_hash_senha text',
    papel: 'app_runtime',
    motivo:
      'Criar a conta do dono: usuarios não tem restaurante_id e o app_runtime não grava nela direto. Devolve só o id, ou nulo se o e-mail já existe.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.buscar_credenciais',
    argumentos: 'p_email text',
    papel: 'app_runtime',
    motivo: 'Login do painel antes de existir restaurante no contexto; devolve só o id e o hash da senha.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.listar_vinculos',
    argumentos: 'p_usuario_id uuid',
    papel: 'app_runtime',
    motivo:
      'Descobrir em quais restaurantes o usuário entra, antes de existir restaurante no contexto; devolve só restaurante_id e papel.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.criar_sessao',
    argumentos:
      'p_hash_id text, p_publico text, p_titular_id uuid, p_restaurante_id uuid, p_nivel text, p_agora timestamptz, p_expira_em timestamptz',
    papel: 'app_runtime',
    motivo: 'Gravar a sessão (só o hash do id); confere o vínculo com o restaurante e se o admin está ativo.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.buscar_sessao',
    argumentos: 'p_hash_id text',
    papel: 'app_runtime',
    motivo:
      'Validar o cookie em toda requisição; devolve titular, restaurante, papel e datas de uma sessão não revogada.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.renovar_sessao',
    argumentos: 'p_hash_id text, p_agora timestamptz',
    papel: 'app_runtime',
    motivo: 'Marcar o último uso, base da expiração por inatividade.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.revogar_sessao',
    argumentos: 'p_hash_id text, p_agora timestamptz',
    papel: 'app_runtime',
    motivo: 'Sair: revogar a sessão do próprio cookie.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.definir_restaurante_da_sessao',
    argumentos: 'p_hash_id text, p_restaurante_id uuid',
    papel: 'app_runtime',
    motivo: 'Trocar o restaurante da sessão depois de criar um restaurante; só com vínculo.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.criar_token_redefinicao',
    argumentos: 'p_email text, p_hash_token text, p_agora timestamptz, p_expira_em timestamptz',
    papel: 'app_runtime',
    motivo:
      'Pedido de redefinição de senha: grava só o hash do token e invalida os anteriores; devolve só se o e-mail existe, e a API responde igual nos dois casos.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.redefinir_senha',
    argumentos: 'p_hash_token text, p_hash_senha text, p_agora timestamptz',
    papel: 'app_runtime',
    motivo:
      'Consumir o token de uso único, trocar a senha e revogar todas as sessões do usuário, numa transação.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.buscar_admin',
    argumentos: 'p_email text',
    papel: 'app_runtime',
    motivo:
      'Login do admin; devolve só o id, o hash da senha e se falta trocar a senha ou cadastrar o segundo fator.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.buscar_segundo_fator_admin',
    argumentos: 'p_administrador_id uuid',
    papel: 'app_runtime',
    motivo: 'Conferir o código TOTP; devolve o segredo cifrado e o último passo usado.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.iniciar_cadastro_segundo_fator',
    argumentos: 'p_administrador_id uuid, p_segredo_pendente_cifrado text',
    papel: 'app_runtime',
    motivo:
      'Primeiro acesso do admin: guardar o segredo TOTP novo, cifrado, até o primeiro código confirmar.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.concluir_cadastro_segundo_fator',
    argumentos:
      'p_administrador_id uuid, p_passo bigint, p_hash_senha text, p_hashes_recuperacao text[], p_agora timestamptz',
    papel: 'app_runtime',
    motivo:
      'Primeiro acesso do admin: ativar o segredo, trocar a senha temporária, gravar os hashes dos códigos de recuperação e revogar as sessões, numa transação.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.usar_passo_totp',
    argumentos: 'p_administrador_id uuid, p_passo bigint',
    papel: 'app_runtime',
    motivo: 'Impedir que o mesmo código TOTP valha duas vezes: só aceita passo maior que o último.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.usar_codigo_recuperacao',
    argumentos: 'p_administrador_id uuid, p_hash_codigo text, p_agora timestamptz',
    papel: 'app_runtime',
    motivo: 'Consumir um código de recuperação de uso único.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.registrar_falha_login',
    argumentos: 'p_publico text, p_alvo text, p_agora timestamptz, p_esquecer_antes_de timestamptz',
    papel: 'app_runtime',
    motivo: 'Bloqueio progressivo: contar a falha por e-mail ou IP (só o hash) e devolver o total.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.consultar_tentativas_login',
    argumentos: 'p_publico text, p_alvos text[]',
    papel: 'app_runtime',
    motivo: 'Bloqueio progressivo: ler as falhas do e-mail e do IP antes de conferir a senha.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.limpar_tentativas_login',
    argumentos: 'p_publico text, p_alvo text',
    papel: 'app_runtime',
    motivo: 'Zerar as falhas do e-mail depois de um login certo.',
    adr: 'docs/adr/0006-banco-e-isolamento.md',
  },
  {
    nome: 'app.admin_listar_mesas',
    argumentos: 'p_administrador_id uuid, p_slug text',
    papel: 'app_runtime',
    motivo:
      'Admin lê as mesas e os links de um restaurante, só leitura; confere o admin ativo com segundo fator e grava a consulta na auditoria.',
    adr: 'docs/adr/0012-mesas-e-qr.md',
  },
  {
    nome: 'app.registrar_evento_pagamento',
    argumentos: 'p_x_request_id text, p_topico text, p_recurso_id text',
    papel: 'app_runtime',
    motivo:
      'O webhook do Mercado Pago grava o aviso antes de existir restaurante no contexto; repetido pelo x-request-id, devolve o mesmo evento. Devolve só o id e se já foi processado.',
    adr: 'docs/adr/0014-assinaturas-e-cobranca.md',
  },
  {
    nome: 'app.listar_restaurantes_para_cobranca',
    argumentos: 'p_apos uuid, p_limite integer',
    papel: 'app_sistema',
    motivo:
      'As rotinas diárias de conciliação e inadimplência percorrem os restaurantes não cancelados; devolve só ids, em páginas. A leitura de cada um é com comRestaurante().',
    adr: 'docs/adr/0014-assinaturas-e-cobranca.md',
  },
];
