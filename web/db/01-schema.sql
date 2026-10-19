-- =============================================================================
-- Gestão Comercial (Trade) — schema `trade` no DATA WAREHOUSE (Supabase)
-- Criado em 2026-10-14. RLS ligada em tudo e SEM policies: ninguém lê pela chave
-- pública; o ETL e o servidor entram pelo usuário do banco (que ignora a RLS).
--
-- Desenho (por que não há um fato de venda de 2,9 milhões de linhas aqui):
--   * O motor do painel precisa da venda mensal por RCA x cliente x produto
--     inteira em memória (positivação e mix são contagens distintas). Essa base
--     viaja como PACOTE: o arquivo colunar comprimido (~25 MB) guardado em
--     pedaços na `pacote`, junto com dims/estoque/entradas/cc/historico/imagens.
--     Uma carga troca a versão do pacote de uma vez só (`pacote_versao`).
--   * As bases pequenas (estoque, entradas, conta corrente) também ficam
--     em tabelas comuns, para qualquer outro BI consultar por SQL.
--   * Três tabelas são ENTRADA do ETL e não só saída: classificacao_produto
--     (a planilha do Trade vira tabela), produto_imagem (a pasta FOTOS_ION) e
--     historico_indicador (a foto diária da ruptura, que cresce a cada carga).
-- =============================================================================
create schema if not exists trade;

-- Auditoria de carga (mesmo desenho dos outros sistemas) ---------------------
create table if not exists trade.controle_carga (
  id               bigint generated always as identity primary key,
  consulta         text        not null,
  tabela_destino   text,
  status           text        not null,
  linhas           integer,
  linhas_esperadas integer,
  segundos         numeric,
  mensagem         text,
  executado_em     timestamptz not null default now()
);
create index if not exists controle_carga_quando on trade.controle_carga (executado_em desc);

-- Pacote do painel ------------------------------------------------------------
create table if not exists trade.pacote_versao (
  id            smallint    primary key default 1 check (id = 1),   -- uma linha só: a versão no ar
  versao        text        not null,
  gerado_em     timestamptz not null,
  meta          jsonb       not null,
  arquivos      jsonb       not null,       -- {"nome": {"partes": n, "bytes": n, "sha1": "...", "versao_dados": "versão onde os pedaços moram"}}
  atualizado_em timestamptz not null default now()
);

create table if not exists trade.pacote (
  versao text    not null,
  nome   text    not null,
  parte  integer not null,
  dados  bytea   not null,                  -- gzip; arquivos grandes vão em partes de ~4 MB
  primary key (versao, nome, parte)
);

-- Entradas do ETL -------------------------------------------------------------
create table if not exists trade.classificacao_produto (
  codprod       integer primary key,
  departamento  text,
  categoria     text,
  subcategoria  text,
  marca         text,
  promocional   boolean     not null default false,
  fonte         text,                        -- de onde veio (planilha do Trade, painel...)
  atualizado_em timestamptz not null default now()
);

create table if not exists trade.produto_imagem (
  codprod       integer primary key,
  arquivo       text        not null,        -- nome do arquivo dentro de FOTOS_ION
  bytes         bigint,
  modificado_em timestamptz,
  atualizado_em timestamptz not null default now()
);

create table if not exists trade.historico_indicador (
  data            date    not null,
  codcomprador    integer not null,          -- -1 = fornecedor sem comprador
  comprador       text,
  ativos          integer not null default 0,
  skus            integer not null default 0, -- ativos e não promocionais (base da ruptura)
  rupturas        integer not null default 0,
  sem_venda       integer not null default 0,
  valor_parado    numeric(18,2) not null default 0,
  valor_parado_pf numeric(18,2) not null default 0,
  primary key (data, codcomprador)
);

-- Bases pequenas (recarregadas por inteiro a cada carga) ----------------------
create table if not exists trade.fato_estoque_produto (
  codprod            integer primary key,
  data_ref           date    not null,
  ativo              boolean not null,
  promocional        boolean not null,
  base_ativa         boolean not null,       -- ativo e não promocional
  disponivel         numeric(18,2),
  bloqueado          numeric(18,2),
  total              numeric(18,2),
  avaria             numeric(18,2),
  reservado          numeric(18,2),
  preco_venda        numeric(18,4),
  valor_custo        numeric(18,2),
  valor_pf           numeric(18,2),
  venda_56d          numeric(18,2),
  media_semanal      numeric(18,3),
  cobertura_semanas  numeric(18,2),
  sugestao_compra    numeric(18,1),
  pendente_entrega   numeric(18,1),
  primeira_entrada   date,
  ultima_entrada     date,
  tem_imagem         boolean not null,
  venda_s0 numeric(18,1), venda_s1 numeric(18,1), venda_s2 numeric(18,1), venda_s3 numeric(18,1), venda_s4 numeric(18,1),
  venda_s5 numeric(18,1), venda_s6 numeric(18,1), venda_s7 numeric(18,1), venda_s8 numeric(18,1),
  ruptura            boolean not null,
  sem_venda          boolean not null
);

create table if not exists trade.fato_entrada_mes (
  codprod    integer       not null,
  mes        date          not null,
  quantidade numeric(18,3) not null,
  valor      numeric(18,2) not null,
  primary key (codprod, mes)
);

create table if not exists trade.fato_cc_fornecedor (
  codfornec        integer primary key,
  fornecedor       text,
  codcomprador     integer,
  debito           numeric(18,2) not null,
  credito          numeric(18,2) not null,
  saldo            numeric(18,2) not null,
  verba_media      numeric(18,2) not null,    -- média mensal do último trimestre fechado
  negociacao_media numeric(18,2) not null,
  ativo            boolean       not null
);

create table if not exists trade.fato_cc_lancamento (
  id          bigint generated always as identity primary key,
  transacao   bigint,
  data        date    not null,
  codfornec   integer not null,
  tipo        char(1) not null,               -- D débito, C crédito
  valor       numeric(18,2) not null,
  historico   text,
  numverba    bigint,
  usuario     text,
  negociacao  boolean not null default false,
  estorno     boolean not null default false
);
create index if not exists cc_lanc_forn_data on trade.fato_cc_lancamento (codfornec, data desc);

-- RLS ligada e sem policies; nada para a chave pública ------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'trade' loop
    execute format('alter table trade.%I enable row level security', t);
  end loop;
end $$;
revoke all on all tables in schema trade from anon, authenticated;
revoke all on schema trade from anon, authenticated;
