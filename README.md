# GESTÃO COMERCIAL (Trade) — Lube Distribuidora

Reconstrução do Power BI **"final"** (workspace COMPRAS: venda, devolução, Higiene & Beleza, ruptura, sem venda,
cobertura, imagens, conta corrente de fornecedor, curva ABC, custo de compra) como sistema próprio da Lube, feito
para ser **apresentado ao gestor comercial**: visual de luxo (azul-marinho e ouro da marca), todo número clicável,
relatório personalizado a cada clique e gráficos com rótulo de dado medido e no padrão brasileiro.

O levantamento do original está em `BI-FINAL-documentacao-tecnica.md` (Downloads, 2026-10-14). Este sistema parte
dele, mas **não depende de nenhuma planilha**: lê o WinThor direto. Os dados moram no **DATA WAREHOUSE** (schema `trade`)
e a carga é agendada pela pasta `P:\INTEGRAÇÃO BI\TRADE`, como nos outros BIs. As fotos vêm direto de `P:\FOTOS_ION`.

> **Dado nominal.** O pacote de dados tem venda por cliente e por RCA. Ele **não vai para o Git** (`.gitignore`:
> `web/dados/`), o banco só aceita acesso pelo usuário do ETL (RLS ligada, sem policies) e o servidor só entrega ao
> navegador o que o painel precisa. Antes de publicar na internet, o sistema entra pela porta do Painel Lube / Sentinela,
> como os outros (ver "Publicar").

---

## Como rodar

| O quê | Como |
|---|---|
| Ver o painel | duplo clique em **`INICIAR.bat`** (abre `http://localhost:8700`, só nesta máquina; lê o pacote do banco, ~10 s para carregar) |
| Mostrar na rede da empresa | **`INICIAR PARA A REDE.bat`** (`http://<máquina>:8700`; sem login — use só numa reunião e feche depois) |
| Atualizar os dados agora | **`ATUALIZAR DADOS.bat`** (cerca de 1 minuto; lê o WinThor, só leitura, e grava no banco). O painel aberto troca de versão sozinho em até 1 minuto, ou ao clicar em *Atualizar* |
| Atualização automática | tarefa **`Trade - Sync`** na `SRV-IA` (06:25, 09:25, 12:25, 15:25 e 18:25), instalada por `P:\INTEGRAÇÃO BI\TRADE\INSTALAR TUDO.bat` |
| Ver se está tudo de pé | `P:\INTEGRAÇÃO BI\TRADE\DIAGNOSTICO.bat` (não grava nada) ou `python etl\diagnostico_trade.py --pacote` |
| Provar que a carga entrou | tabela `trade.controle_carga` (uma linha por passo) e `trade.pacote_versao` (a versão no ar), no Supabase |
| Conferir com o Power BI | `python etl\conferir_power_bi.py 2026-02` (não grava nada) |

Precisa de Node 18+ (`npm install` na primeira vez; o `.bat` faz) e Python 3.12 com `etl\requirements.txt`. O `ENV` (Oracle de
leitura e Supabase) é o mesmo dos outros BIs: o painel e o ETL procuram em `etl\ENV`, `P:\INTEGRAÇÃO BI\TRADE\1 - CONFIGURACAO\ENV`
e `C:\BI\TRADE\ENV`, e **o ENV manda sobre variável de ambiente do sistema** (já houve máquina com `SUPABASE_*` de outro
projeto). Os dois conferem o ref do projeto e se recusam a ler ou gravar noutro. **Senha nunca entra aqui.**

---

## As telas

| Grupo | Tela | Veio de (Power BI "final") | O que mostra |
|---|---|---|---|
| Vendas | **Visão geral** | Venda | KPIs com comparativo, venda e positivação mês a mês por ano, estado, equipe, departamento, fornecedores, categorias, ramo, sazonalidade e **ganhos e perdas** contra o ano anterior |
| Vendas | **Comparativo anual** | Total | ano contra ano (medidor, mês a mês, matriz por comprador, departamentos) |
| Vendas | **Higiene & Beleza** | HB | H&B contra o restante por estado, equipe e mês |
| Vendas | **Devoluções** | Devolução | valor, % da bruta, quem devolve o quê |
| Vendas | **Análise de venda** | Analisi venda | tabela por 14 dimensões, com o mesmo período do ano anterior ao lado; a que dava erro no Power BI |
| Vendas | **Curva ABC** | Curva ABC | Pareto, classes A/B/C, lista de produtos ou clientes |
| Vendas | **Carteira de clientes** | *(novo)* | retidos, novos, reativados e perdidos + ponte da venda |
| Estoque | **Ruptura** | Ruptura | itens zerados, venda perdida por semana, comprador › fornecedor › produto |
| Estoque | **Estoque sem venda** | Sem venda | itens parados e valor, mesma árvore |
| Estoque | **Cobertura** | Cobertura | estoque ÷ venda mensal, **calculada ao vivo** (no Power BI era uma foto colada) |
| Estoque | **Produtos sem imagem** | Imagens | lista e cobertura do banco de imagens |
| Compras | **Conta corrente** | CC fornecedor | saldo, verba média do trimestre, meses para pagar |
| Compras | **Lançamentos de verba** | CC consulta | cada lançamento, com a marca de "negociação" |
| Compras | **Custo de compra** | Desvio padrão | índice de custo, altas e quedas, desvio padrão por produto |

**O relatório personalizado.** Clicar em qualquer barra, ponto, fatia, cartão, linha de tabela ou resultado da busca
abre o **relatório daquele recorte** (cliente, produto, fornecedor, RCA, comprador, estado, mês…) com os filtros da
tela: KPIs com comparativo, evolução, quebras, e as abas **Detalhar** (a tabela que o usuário escolhe, por 11
dimensões, com colunas à escolha e Excel), **Estoque** e **Verba**. Dentro dele, clicar em outro item abre o relatório
desse item (com *Voltar*). *Ctrl + clique* aplica o item como filtro. Tem *Imprimir / PDF* e *Copiar link*.

Também: busca global (`/`), modo apresentação (`F`, setas trocam de tela), tema claro/escuro, link da visão, e o
carimbo "Dados até …" no rodapé do menu.

---

## Como funciona

```
WinThor (Oracle, só leitura) ─┐
Planilha do Trade (Z:)        ├─ etl/sync_trade.py ─► Supabase DATA WAREHOUSE, schema trade ─► servidor_local.js ─► painel
P:\FOTOS_ION (fotos)  ────────┘   (SRV-IA, 5x ao dia)        (pacote + tabelas)               + motor.js (memória)
                                                                       P:\FOTOS_ION ──► /img/<código> (miniatura)
```

**O que o ETL faz** (`etl/sync_trade.py`; um passo = uma linha em `trade.controle_carga`): `classificacao` (planilha do Trade →
`classificacao_produto`) · `imagens` (pasta FOTOS_ION → `produto_imagem`) · `venda` (Oracle, 2,9 milhões de linhas) · `oracle`
(estoque, entradas, conta corrente, cadastros) · `pacote` (monta e **confere**: se a venda vier com menos de 90% das linhas
da versão no ar, ou o estoque com menos de 50%, recusa e mantém a versão anterior) · `historico` (a foto de hoje da ruptura →
`historico_indicador`) · `bases` (`fato_estoque_produto`, `fato_entrada_mes`, `fato_cc_fornecedor`, `fato_cc_lancamento`) ·
`publicar` (grava a versão nova do pacote **inteira, sem que ninguém a veja**, e só no fim troca o ponteiro `pacote_versao`
numa transação; a versão anterior fica de reserva) · `miniaturas` (fotos em WebP para o painel da Vercel; ver "As fotos na Vercel"). Se a planilha do Trade ou a pasta de fotos estiverem fora do ar, o passo
termina em **AVISO** e usa a cópia que já está no banco: a carga não para por isso. A tranca de carga (advisory lock, de
`bi_comum.py`) impede duas máquinas de carregarem ao mesmo tempo.

**Por que a venda não é uma tabela de 2,9 milhões de linhas no banco.** O motor precisa da base inteira em memória (positivação
e mix são contagens distintas), então o que viaja é o **arquivo colunar comprimido (~25 MB)**, guardado em pedaços de 4 MB na
tabela `trade.pacote` (o schema inteiro ocupa ~37 MB; o DATA WAREHOUSE tem 3,9 GB e já saturou em 07/10). Uma carga lê o
pacote do banco em ~8 s e monta o motor em ~2,5 s. As bases pequenas (estoque, entradas, conta corrente) **também** ficam em
tabelas comuns, para qualquer outro BI consultar por SQL.

**As fotos** vêm direto de `P:\FOTOS_ION` (a mesma pasta do WinThor: `PCPRODUT.DIRFOTOPROD` aponta para ela). Os nomes são
bagunçados (`123.png`, `123.PNG`, `123 .png`, `123 (1).png`, `.jpeg`, atalhos, `desktop.ini`): `etl/fotos.py` lê o código
no começo do nome e, havendo mais de um arquivo para o mesmo produto, escolhe sempre o mais "certo" (nome exato › espaço ›
`(n)` › outro; `.png` › `.jpg`; o mais novo desempata). Em 2026-10-14: 8.572 entradas → **8.441 produtos com foto**
(124 com mais de um arquivo). Só leitura: nunca grava, renomeia nem apaga nada na pasta. Como o PNG médio tem 491 KB (o maior,
34 MB), o servidor entrega **miniatura WebP** (1,5 MB → 34 KB), gerada na hora com `sharp` e guardada em `web/cache_img/`.
Tarefa agendada não enxerga a unidade `P:`, então o ETL também tenta o caminho de rede da pasta (`TRADE_FOTOS` no ENV).

**Fotos na tarefa agendada (a parte difícil, 2026-10-14).** O servidor de arquivos do WinThor só aceita o usuário do
compartilhamento (é com ele que o `P:` está mapeado), não a conta de domínio da tarefa. Sem credencial, a tarefa recebe o erro 1272
(acesso de convidado bloqueado) e o passo `imagens` termina em **AVISO**, usando o mapa de fotos do banco; nada quebra. Guardar a
credencial no cofre do Windows (`cmdkey`) **não funciona** para a tarefa (testado: erro 1326 mesmo com a senha certa, que passa no
`net use` interativo). O que funciona é a carga abrir a conexão de dentro do processo (`etl/rede.py`, `WNetAddConnection2`),
com a senha vindo de `fotos.cred`: o arquivo que o PowerShell gera com `ConvertFrom-SecureString`, **cifrado pelo Windows (DPAPI)**,
que só a mesma conta, na mesma máquina, consegue abrir. Não vai para o ENV, o Git (`*.cred` está no `.gitignore`) nem a pasta de
rede, e nenhum log mostra a senha. Como criar: `LEIA-ME.txt` da pasta de integração. Sem o arquivo, tudo segue como antes.

A venda é um fato **mensal por RCA × cliente × produto** (2,9 milhões de linhas, 2023-01 em diante). Positivação,
ticket e mix são contagens **distintas**: não dá para somar pedaços, então o cálculo é feito linha a linha, com os
filtros aplicados, por um motor em memória (`web/motor.js`): mapa de bits por grupo, uma passada, sem ordenar. A tela
pede o que precisa (`resumo`, `agrupar`, `abc`, `carteira`) e o motor responde em dezenas de milissegundos; o
navegador nunca recebe as linhas. Estoque, conta corrente e entradas (poucos milhares de linhas) vão inteiros para o
navegador, que filtra na hora.

- Carga: ~65 s (venda 30 s, gravação no banco ~25 s). Painel: abre em ~0,1 s depois do aquecimento (o servidor se aquece ao
  ligar; ~10 s para ler o pacote do banco e montar o motor). Memória: ~380 MB. A cada minuto o servidor pergunta ao banco se
  saiu versão nova e, se saiu, monta a nova e troca, sem derrubar quem está usando. Sem banco, abre com a cópia de `web/dados/`
  (`ATUALIZAR DADOS.bat` mantém essa cópia) e diz isso em `/api/versao`.
- Pacote: `dims.json` (cadastros), `venda.bin.gz` (fato colunar), `estoque.json`, `entradas.json`, `cc.json`,
  `historico.json` (foto diária dos indicadores por **código** de comprador — cresce a cada carga, no banco), `imagens.json`
  (código → arquivo da foto; não vai ao navegador), `meta.json`.
- Comparações usam **o mesmo número de dias**: cada linha também guarda a venda "até o dia de corte" (ontem). O mês em
  andamento é comparado com o mesmo trecho do mês do ano/período anterior; sem isso outubro parcial parecia queda de 41%.
  Só entram dias fechados: os dados vão até **ontem**.

---

## Regras

```
VENDA (S)          = Σ QT × (PUNIT + VLOUTROS)         filiais 1, 7, 10, 11 e 12, sem cancelados
DEVOLUÇÃO (ED)     = Σ QT × (PUNIT + VLOUTROS)
VENDA LÍQUIDA      = VENDA − DEVOLUÇÃO                  é o número de topo de todas as telas
POSITIVAÇÃO        = clientes com venda bruta > 0 no recorte
TICKET MÉDIO       = venda líquida ÷ positivação
MIX MÉDIO          = pares cliente × produto distintos com venda ÷ positivação
VALOR AGREGADO     = venda líquida ÷ peso líquido vendido (R$/kg)
```

| Indicador | Regra |
|---|---|
| **Ruptura** | produto ativo, não promocional, com entrada nos últimos 365 dias e **estoque total disponível ≤ 0** (disponível + bloqueado sem avaria, filiais 1, 2, 7, 8 e 10) |
| Venda perdida | Σ venda dos últimos 56 dias dos itens em ruptura ÷ 8 (R$ por semana); % sobre a venda semanal de todos |
| **Sem venda** | ativo, estoque disponível > 0, 1ª entrada há mais de 14 dias e nenhuma venda nas últimas 8 semanas |
| **Cobertura** | estoque a preço de venda ÷ venda líquida média dos 3 meses fechados (mesma base de preço). A "conta original" (preço ÷ 1,35) aparece ao lado |
| **Curva ABC** | % acumulado inclusivo: A abaixo de 80%, B abaixo de 95%, C o restante (cortes únicos) |
| **Carteira** | retido (comprou nos dois períodos), novo (1ª compra da história dentro do período), reativado (já comprou antes, não na base), perdido (comprou na base e não agora) |
| **Conta corrente** | saldo = débitos − créditos de todo o histórico (rotina de verba; **estornos entram**, como no saldo corrido do relatório do WinThor — 303 de 323 fornecedores batem ao centavo com o relatório do Power BI); verba média do trimestre = débitos ligados a uma verba nos 3 meses fechados ÷ 3; meses para pagar = saldo ÷ verba média |
| **Negociação** | histórico do débito contém ação (exceto "ALTERAÇÃO…"), rebaixa, verba, vencimento, perda, "compra de merc. bonific.", negociação ou campanha |
| **Custo de compra** | (PUNIT + frete + ST) por unidade, das entradas (operação E); índice encadeado mês a mês, ponderado pelo valor |

---

## Validação contra o Power BI (2026-10-14)

Com os arquivos que alimentavam o Power BI (`Z:\TRADE MARKETING\Power BI\Geral`), sem gravar nada:

(Os valores absolutos ficam fora deste repositório, que é público; só as diferenças.)

| Conferência | Diferença do painel contra o Power BI |
|---|---:|
| Venda líquida de **fev/2026** (a exportação do WinThor) | **+0,005%** |
| Clientes com venda em fev/2026 | +4 clientes |
| SKUs / pares cliente × produto em fev/2026 | −0,5% / −1,0% |
| Venda por equipe em fev/2026 (3 equipes conferidas) | **exato** |
| Ruptura na foto EEG de 02/03/2026 | +4,1% |
| Venda de 2024 | +2,1% |
| Venda de 2025 | +1,0% |
| Venda de 2023 | o Power BI está incompleto neste ano |

A regra de venda foi achada nesta conferência (`QT × (PUNIT + VLOUTROS)`, filiais 1, 7, 10, 11 e 12) e fecha com a
exportação de fevereiro; os anos fechados do Power BI ficam abaixo porque as planilhas eram salvas à mão
(bug nº 1 do documento) — não foi investigado mês a mês. **Número só muda depois dos responsáveis da área.**

---

## Divergências conscientes (o que difere do Power BI, e por quê)

| # | O que mudou | Antes | Agora |
|---|---|---|---|
| 1 | Fonte | planilhas salvas à mão, dado parado em 28/02 | WinThor direto, dados até ontem |
| 2 | Positivação | contava cliente com qualquer linha, até só de devolução | cliente com venda bruta > 0 |
| 3 | Anos fixos (2022…2026 escritos nas medidas) | editar a cada virada | ano atual/anterior sempre relativos |
| 4 | Compradores fixos no código (4 nomes) | comprador novo não aparecia | vêm da dimensão (hoje 3 compradores + contas internas) |
| 5 | Curva ABC | três cortes diferentes (80/85/95), medida quebrada | cortes únicos 80/95 |
| 6 | Cobertura | tabela colada, nunca atualizava | calculada ao vivo; a conta original fica ao lado |
| 7 | Valor do estoque | preço ÷ 1,35 | custo financeiro do WinThor; "Preço ÷ 1,35" por botão |
| 8 | Histórico de ruptura / sem venda | imagem colada | foto gravada a cada carga (começa em 2026-10-14) |
| 9 | Equipe de venda | equipe da época, vinda da exportação | equipe **atual** do RCA (reorganizações valem para todo o histórico) |
| 10 | Comparação com mês em andamento | mês parcial contra mês cheio | mesmo número de dias |
| 11 | Visual "Erro ao buscar os dados" da Analisi venda; medidas da CC quebradas | erro | tabela e gráficos funcionando |
| 12 | "Desvio padrão" | série de custo, sem desvio padrão | índice de custo + variação + desvio padrão e oscilação reais por produto |

### Classificação do Trade
Departamento, categoria, subcategoria, marca e "promocional" vêm da planilha **Categoria e subcategoria**, mantida
à mão (última edição em 05/01/2026). Produto novo não está nela: em 2026-10-14 eram **11% da venda do ano**.
Para não virar um balde "sem classificação", esses produtos herdam o **departamento da maioria dos produtos já
classificados da mesma seção do WinThor**, e categoria, subcategoria e marca do próprio WinThor — ficam marcados
(origem "Herdada do WinThor"), aparecem num aviso da Visão geral e podem ser filtrados. Atualizar a planilha corrige
tudo na carga seguinte. *(Recomendação do documento, ainda não feita: tabela editável no painel.)*

---

## Publicação na Vercel (2026-10-14)

O painel roda na Vercel como os outros sistemas da casa: **um projeto por sistema**, repositório público (no plano Hobby, privado
trava o deploy), **Root Directory = `web`**, Framework **Other**, sem build, região `gru1` (o banco está em São Paulo), e **protegido
pela Sentinela** (login do Painel Lube) com o `middleware.ts` + `sentinela-guarda.ts` na raiz de `web/`. **Nunca publique este
sistema sem o guarda: ele mostra venda por cliente e por RCA.**

```
navegador ──► Vercel (guarda da Sentinela: sem login do Painel Lube, nada passa)
              ├─ web/ (HTML, CSS, JS)                 estático
              └─ api/motor.js (UMA função, ?r= escolhe a rota; as URLs vêm de rewrites do vercel.json)
                   ├─ /api/abertura               a abertura da tela: as 6 bases pequenas + a versão, numa resposta só (1,6 MB gzip, ETag)
                   ├─ /api/consulta   (POST)      motor em memória (web/motor.js)
                   ├─ /api/versao                 carimbo da carga e origem dos dados
                   └─ /dados/<nome>.json          uma das bases pequenas (a tela só usa se a abertura falhar, e nas atualizações ao vivo)
                         │
                         └──► Supabase DATA WAREHOUSE, schema trade  (o pacote que o ETL grava; ver "Como funciona")
```

**Como a função trabalha.** `web/pacote.js` (o mesmo módulo do servidor local) lê o pacote do banco na primeira chamada de cada
instância (~5 s medidos com o banco em São Paulo; ~10 s da máquina do escritório), monta o motor (~2,5 s, ~380 MB) e responde.
Instância quente responde em dezenas de milissegundos. Depois de responder, no máximo 1x por minuto, pergunta ao banco se saiu
versão nova (`waitUntil`) e troca sozinha. A conexão com o banco **abre, lê e fecha** (o session pooler tem poucas conexões).
**Tela e servidor precisam estar na mesma versão:** a tela manda a versão em cada pedido e, se o ETL publicou outra no meio da
sessão, o servidor responde **409** e a tela recarrega sozinha (os índices de cliente, produto e RCA mudam a cada carga).

**Variáveis de ambiente do projeto na Vercel** (Settings › Environment Variables, ambiente Production; as mesmas do COMERCIAL e do
REPOSIÇÕES; quem cadastra é o Júlio; **variável nova só vale em deploy novo**):

| Variável | Valor |
|---|---|
| `SUPABASE_DB_HOST` | `aws-0-sa-east-1.pooler.supabase.com` |
| `SUPABASE_DB_PORT` | `5432` (session pooler; a 6543 conecta e trava a consulta) |
| `SUPABASE_DB_NAME` | `postgres` |
| `SUPABASE_DB_USER` | `postgres.ivcnotrynogaljrvvyes` |
| `SUPABASE_DB_PASSWORD` | a senha do DATA WAREHOUSE, **Sensitive** (a mesma do ENV dos ETLs) |

Sem elas a função responde 503 "dados indisponíveis". O guarda não precisa de variável (usa o OIDC do time); se
`/.sentinela/saude` mostrar `"oidc": false`, o plano B é `SENTINELA_CHAVE` e `SENTINELA_PROJETO` (ver o `guarda/LEIA-ME.md` do portal).

**As fotos na Vercel.** A pasta de fotos fica na rede interna e a Vercel não a enxerga. Quem enxerga é o ETL, que **reduz cada foto
para uma miniatura WebP de 288 px (~11 KB; ~100 MB para as ~8,5 mil fotos) e guarda em `trade.produto_miniatura`**; a função `api/img`
serve de lá (`/img/<código>` é reescrito para `/api/img?cod=<código>`), com cache só no navegador de quem entrou (`private`) e uma
memória curta na instância. O marcador "tem foto" continua vindo do ETL (a página *Produtos sem imagem* usa ele). O passo
`miniaturas` do `sync_trade.py` só gera a foto nova ou alterada (compara nome, tamanho e data do arquivo), roda **por último**, tem limite
de 10 minutos por carga agendada (o que não deu tempo entra na próxima) e precisa do **Pillow** (`python -m pip install pillow`; sem ele
termina em AVISO e a carga segue). A primeira carga (uns 4,3 GB de PNG) se faz à mão, de uma máquina que enxergue a pasta:
`python sync_trade.py --so-miniaturas --minutos-miniaturas 0`. Para a carga **agendada** enxergar a pasta, falta o `fotos.cred` (ver "Fotos na
tarefa agendada" acima); sem ele o passo avisa e vale o que já está no banco.

A carga **não** roda na Vercel: é a tarefa `Trade - Sync` na `SRV-IA` (ver `P:\INTEGRAÇÃO BI\TRADE`), que grava no banco; a Vercel só lê.

**Registro no Painel Lube** (feito pelo Claude em 2026-10-14, por SQL): a Sentinela só fecha um sistema que esteja em
`sentinela.sistemas` com `exige_login = true`, e o portal só dá a permissão se ele estiver em `public.sistemas`. Projeto
`gestao-comercial-trade`, slug `gestao-comercial-trade`. **Sistema novo entra com o cartão inativo** até o Júlio decidir quem abre:
quem tem "Todos os sistemas" abriria automaticamente. Para isolar, o painel admin tem "Liberar tudo, exceto".

---

## Histórico de mudanças
Tudo o que mudou neste sistema, do mais novo para o mais antigo.

- **2026-10-28** — Abertura mais rápida (Claude, a pedido do Júlio): `api/consulta`, `api/versao` e `api/dados` viraram UMA função (`api/motor.js`) e a tela abre com UMA chamada (`/api/abertura`). Antes, cada passo da abertura caía numa cópia fria do servidor (~7 s: ler o pacote do banco e montar o motor), um depois do outro (~23 s medidos nos logs da Vercel); agora é uma partida a frio. O aquecimento do motor passou de 3 rodadas para 1 (a 1ª consulta leva os mesmos ~240 ms).
- **2026-10-14** — Preparado para a Vercel (Claude, a pedido do Júlio): `web/pacote.js` compartilhado, funções `api/consulta`, `api/versao` e `api/dados`, guarda da Sentinela, `vercel.json`, e a tela passa a recusar (409) consulta de versão antiga.
- **2026-10-14** — Ligado ao DATA WAREHOUSE e à pasta de fotos (Claude, a pedido do Júlio): schema `trade` (10 tabelas, RLS
  ligada), `sync_trade.py` + `gravar_trade.py` + `fotos.py` + `diagnostico_trade.py`, servidor lendo o pacote do banco
  (`fonte_dados.js`, troca de versão sozinha), fotos direto de `P:\FOTOS_ION` em miniatura, pasta `P:\INTEGRAÇÃO BI\TRADE`
  com instalador (tarefa `Trade - Sync`, 5 cargas ao dia). Primeira carga real: 8 passos OK.
  O histórico da ruptura passa a ser por código de comprador (o índice mudava a cada carga).
- **2026-10-14** — Sistema criado (Claude, a pedido do Júlio): ETL, motor, painel de 14 telas, relatório personalizado, validação contra o Power BI.
