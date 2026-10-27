-- ===========================================================================
-- GESTÃO COMERCIAL (Trade) — a venda de hoje, ao vivo (AGENTE LUBE), fase 1
--
-- Decisões do Júlio (2026-10-27): hoje entra nos totais e a comparação fica só
-- com dias fechados; um cartão compara "hoje até agora" com o mesmo dia da
-- semana passada até a mesma hora; venda primeiro, estoque depois.
--
-- O arquivo grande da venda (trade.pacote, venda.bin.gz) continua como está: mês
-- x RCA x cliente x produto, só dias fechados (até ontem). O agente grava aqui só
-- o que vem DEPOIS do corte do arquivo: hoje e, entre a meia-noite e a carga da
-- manhã, ontem. O servidor do painel soma estas linhas por cima, com zero nas
-- colunas "até o dia de corte", e a comparação segue só com dias fechados.
--
-- Cópia versionada da migração `trade_venda_ao_vivo`.
-- ===========================================================================

-- Venda por DIA, no grão do Trade, com as mesmas contas do SQL_VENDA do ETL
-- (etl/extrair_trade.py): S - ED, QT x (PUNIT + VLOUTROS), filiais 1, 7, 10, 11 e 12.
CREATE TABLE IF NOT EXISTS trade.venda_dia (
    dtmov      date    NOT NULL,
    codusur    integer NOT NULL,
    codcli     integer NOT NULL,
    codprod    integer NOT NULL,
    venda      numeric NOT NULL DEFAULT 0,
    devolucao  numeric NOT NULL DEFAULT 0,
    qt_venda   numeric NOT NULL DEFAULT 0,
    qt_dev     numeric NOT NULL DEFAULT 0,
    peso       numeric NOT NULL DEFAULT 0,
    PRIMARY KEY (dtmov, codusur, codcli, codprod)
);
ALTER TABLE trade.venda_dia ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE trade.venda_dia IS
    'Venda por dia (RCA x cliente x produto) dos dias que o arquivo grande ainda não tem (hoje; e ontem até a carga da manhã). Gravada pelo AGENTE LUBE.';

-- Venda por HORA do lançamento e por RCA, dos últimos 8 dias: o cartão "hoje até agora x o
-- mesmo dia da semana passada até a mesma hora" (com os filtros de RCA, equipe e estado).
CREATE TABLE IF NOT EXISTS trade.venda_hora (
    dtmov      date     NOT NULL,
    hora       smallint NOT NULL,
    codusur    integer  NOT NULL,
    venda      numeric  NOT NULL DEFAULT 0,
    devolucao  numeric  NOT NULL DEFAULT 0,
    PRIMARY KEY (dtmov, hora, codusur)
);
ALTER TABLE trade.venda_hora ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE trade.venda_hora IS
    'Venda por hora do lançamento e RCA, últimos 8 dias, para o cartão "hoje até agora". Gravada pelo AGENTE LUBE.';

-- O agente marca a versão em agente.sistema('trade') a cada gravação: é o que o servidor do painel
-- pergunta para saber se há venda nova. Nada a rodar depois de gravar (o servidor lê as tabelas).
INSERT INTO agente.sistema (sistema, versao) VALUES ('trade', '')
ON CONFLICT (sistema) DO NOTHING;

-- Migração `trade_venda_ao_vivo_limpeza`: as janelas do agente só regravam os últimos dias; o que ficou para trás não
-- serve a ninguém. Todo dia às 05:10 (Brasília) sai o que tem mais de 10 dias.
SELECT cron.schedule('trade-venda-hoje-limpeza', '10 8 * * *',
  $$DELETE FROM trade.venda_dia WHERE dtmov < current_date - 10; DELETE FROM trade.venda_hora WHERE dtmov < current_date - 10;$$);
