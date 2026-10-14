-- =============================================================================
-- Gestão Comercial (Trade) — miniaturas das fotos de produto (2026-10-14)
-- Aplicado no DATA WAREHOUSE como a migração `trade_produto_miniatura`.
--
-- A Vercel não enxerga a pasta de fotos (rede interna). O ETL, que enxerga, reduz cada foto para uma
-- miniatura WebP de 288 px (~11 KB) e guarda aqui; a função api/img.js serve de lá. Só gera a foto nova ou
-- alterada: origem_bytes e origem_modificado são o que o ETL compara. ~97 MB para ~8,5 mil fotos.
-- RLS ligada e sem policies, como o resto do schema: só o usuário do ETL e do painel lê.
-- =============================================================================
create table if not exists trade.produto_miniatura (
  codprod           integer primary key,
  arquivo           text        not null,          -- arquivo de origem em FOTOS_ION
  origem_bytes      bigint,
  origem_modificado timestamptz,
  largura           integer     not null,
  altura            integer     not null,
  webp              bytea       not null,
  atualizado_em     timestamptz not null default now()
);
alter table trade.produto_miniatura enable row level security;
revoke all on trade.produto_miniatura from anon, authenticated;
