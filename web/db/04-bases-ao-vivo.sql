-- ===========================================================================
-- GESTÃO COMERCIAL (Trade) — estoque, conta corrente e entradas ao vivo (AGENTE LUBE), fases 2 e 3
--
-- Pedido do Júlio (2026-10-27): "fazer essas 2 fases de uma vez", com os produtos sem imagem
-- atualizando também. Até aqui, estoque.json, cc.json, entradas.json e historico.json só mudavam
-- com a carga grande (5 vezes ao dia). Agora o agente lê o WinThor e grava as tabelas abaixo; o
-- servidor do painel (web/bases.js) remonta esses arquivos com as MESMAS contas do ETL
-- (etl/extrair_trade.py, construir) e a tela troca sozinha.
--
--   trade.estoque_posicao   PCEST + preço (região 1) + pendente de compra, por produto  (60 s)
--   trade.estoque_giro      venda das 9 semanas, venda de 56 dias, 1ª e última entrada   (5 min)
--   trade.entrada_mes       custo de entrada por produto x mês, mês corrente e os 2 antes (2 min)
--   trade.cc_lancamento     conta corrente de fornecedor inteira (PCMOVCRFOR)            (2 min)
--
-- As fotos (trade.produto_imagem) vêm da tarefa "Trade - Fotos" na SRV-IA (sync_trade.py
-- --so-miniaturas, de 5 em 5 min): a pasta FOTOS_ION não é WinThor, então não é do agente.
--
-- Cópia versionada da migração `trade_bases_ao_vivo`.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS trade.estoque_posicao (
    codprod      integer PRIMARY KEY,
    estoque      numeric NOT NULL DEFAULT 0,
    reservado    numeric NOT NULL DEFAULT 0,
    bloq_semav   numeric NOT NULL DEFAULT 0,      -- QTBLOQUEADA - QTINDENIZ
    avaria       numeric NOT NULL DEFAULT 0,      -- QTINDENIZ
    disponivel   numeric NOT NULL DEFAULT 0,      -- QTESTGER - QTRESERV - QTBLOQUEADA
    valor_custo  numeric NOT NULL DEFAULT 0,
    pvenda       numeric,                          -- PCTABPR, região 1
    pendente     numeric NOT NULL DEFAULT 0        -- pedido de compra ainda não entregue (filiais 1, 10, 7)
);
ALTER TABLE trade.estoque_posicao ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE trade.estoque_posicao IS
    'Posição do estoque por produto (filiais 1, 2, 7, 8, 10), preço da região 1 e pendente de compra. Gravada pelo AGENTE LUBE de 60 em 60 s.';

CREATE TABLE IF NOT EXISTS trade.estoque_giro (
    codprod   integer PRIMARY KEY,
    s0 numeric NOT NULL DEFAULT 0, s1 numeric NOT NULL DEFAULT 0, s2 numeric NOT NULL DEFAULT 0,
    s3 numeric NOT NULL DEFAULT 0, s4 numeric NOT NULL DEFAULT 0, s5 numeric NOT NULL DEFAULT 0,
    s6 numeric NOT NULL DEFAULT 0, s7 numeric NOT NULL DEFAULT 0, s8 numeric NOT NULL DEFAULT 0,
    venda56   numeric NOT NULL DEFAULT 0,          -- R$ dos últimos 56 dias, filiais de venda
    primeira  date,                                -- primeira entrada (PCMOV E)
    ultima    date                                 -- última entrada
);
ALTER TABLE trade.estoque_giro ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE trade.estoque_giro IS
    'Venda semanal (9 semanas, quantidade), venda de 56 dias (R$) e 1ª/última entrada por produto. Gravada pelo AGENTE LUBE de 5 em 5 min.';

CREATE TABLE IF NOT EXISTS trade.entrada_mes (
    mes      date    NOT NULL,
    codprod  integer NOT NULL,
    qt       numeric NOT NULL DEFAULT 0,
    valor    numeric NOT NULL DEFAULT 0,          -- QT x (PUNIT + VLFRETE + ST)
    PRIMARY KEY (mes, codprod)
);
ALTER TABLE trade.entrada_mes ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE trade.entrada_mes IS
    'Entradas (custo de compra) por mês e produto do mês corrente e dos 2 anteriores; os meses mais velhos vêm do arquivo da carga. Gravada pelo AGENTE LUBE.';

CREATE TABLE IF NOT EXISTS trade.cc_lancamento (
    transacao     bigint PRIMARY KEY,              -- NUMTRANSCRFOR
    data          date,
    codfornec     integer,
    fornecedor    text,
    codcomprador  integer,
    tipo          text,                            -- D débito, C crédito
    valor         numeric,
    historico     text,
    numverba      bigint,
    usuario       text,
    dtestorno     date
);
ALTER TABLE trade.cc_lancamento ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ix_cc_lancamento_data ON trade.cc_lancamento (data);
COMMENT ON TABLE trade.cc_lancamento IS
    'Conta corrente de fornecedor (PCMOVCRFOR) inteira, com o nome do fornecedor, o comprador e quem lançou. Gravada pelo AGENTE LUBE de 2 em 2 min.';
