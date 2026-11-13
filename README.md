# Meu Marceneiro — plataforma SaaS para marcenarias

![Meu Marceneiro](marca/logo-horizontal.svg)

Projeto paramétrico de móveis, lista de peças, plano de corte guilhotinado e orçamento.
A arquitetura, o modelo de dados e a estratégia matemática estão no documento de arquitetura do projeto.

## Estado atual: Fases 1 a 10 concluídas (versão 1.0)

| Fase | Entrega | Onde |
| --- | --- | --- |
| 1 | Monorepo (npm workspaces, TypeScript estrito) | raiz |
| 1 | Motor de cálculo — unidades em décimos de milímetro | `packages/core` |
| 1 | Empresas, usuários, membros, convites, clientes, com RLS | `supabase/migrations/…01_fase1_base.sql` |
| 1 | Login, cadastro, recuperação de senha, empresas, equipe, convites, clientes | `apps/web` |
| 2 | Fornecedores, materiais, formatos de chapa, fitas de borda, estoque por movimentos | `supabase/migrations/…02_fase2_materiais.sql` |
| 2 | Leitura de CSV, números no padrão brasileiro, validação de linhas | `packages/catalog` |
| 2 | Telas de materiais (com cadastro em série por espessura), fitas, fornecedores, estoque e importação | `apps/web` |
| 3 | Motor de modulação: regras de montagem e de fundo como dados, linguagem de expressões segura, divisórias e prateleiras | `packages/core/src` (`regra`, `expressao`, `modulo`) |
| 3 | Tela "Calcular módulo": medidas de cada peça, com a conta mostrada, e vista frontal | `apps/web/src/pages/Modulo.tsx` |
| 4 | Gerador de peças: fita de borda, veio, canal do fundo, agrupamento, totais de área e fita | `packages/core/src/pecas.ts` |
| 4 | Lista de peças na tela, com quantidade de módulos, sobra de fita e CSV | `apps/web/src/pages/Modulo.tsx` |
| 5 | Posição 3D de cada peça nas regras; colisões, envelope, projeções 2D | `packages/core/src/geometria.ts` |
| 5 | Projetos com histórico de versões imutáveis, com RLS | `supabase/migrations/…03_fase5_projetos.sql` |
| 5 | Editor: 3D (Three.js), vistas de frente, lateral e planta, seleção de peça, fita por peça, projetos e versões | `apps/web/src/editor`, `pages/Projetos.tsx`, `pages/Projeto.tsx` |
| 6 | Plano de corte guilhotinado: desconto de fita, serra, refilo, veio, retalhos, sobras; verificador independente | `packages/core/src/corte.ts` |
| 6 | Retalhos em estoque, com RLS | `supabase/migrations/…04_fase6_retalhos.sql` |
| 6 | Tela do plano de corte (cálculo em worker), lista de corte, CSV e impressão/PDF; retalhos no Estoque | `apps/web/src/editor/PlanoCorte.tsx`, `components/Retalhos.tsx` |
| 7 | Portas (sobreposta/embutida, meia-sobreposição), gavetas com corrediça, dobradiças por altura, furação de copa e de pino (sistema 32) | `packages/core/src/frentes.ts`, `modulo.ts` |
| 7 | Catálogo de ferragens, com RLS | `supabase/migrations/…05_fase7_ferragens.sql`, `pages/Ferragens.tsx` |
| 7 | Editor: frente por vão, materiais de frente e de gaveta, lista de ferragens ligada ao catálogo | `apps/web/src/editor` |
| 8 | Orçamento em centavos inteiros: chapas, fita, ferragens, mão de obra, extras, margem, desconto | `packages/core/src/orcamento.ts` |
| 8 | Orçamentos emitidos: numerados pelo banco, conteúdo imutável, RLS (produção não vê preços) | `supabase/migrations/…06_fase8_orcamentos.sql` |
| 8 | Gerador de Excel (.xlsx) sem dependência pesada | `packages/catalog/src/xlsx.ts` |
| 8 | Orçamento no projeto, proposta para o cliente (impressão/PDF), página Orçamentos com números de 30 dias | `apps/web/src/editor/Orcamento.tsx`, `pages/Orcamentos.tsx`, `pages/OrcamentoDetalhe.tsx` |
| 9 | Ordens de produção, estoque de ferragens, baixa e estorno atômicos | `supabase/migrations/…07_fase9_producao.sql` |
| 9 | Enviar para produção, quadro por etapa, ordem com plano de corte, baixa de estoque, impressão | `apps/web/src/editor/EnviarProducao.tsx`, `pages/Producao.tsx`, `pages/OrdemDetalhe.tsx` |
| 10 | Permissões mínimas nas tabelas das fases 5 a 9; auditoria automática do banco; teste do fluxo completo | `supabase/migrations/…08_fase10_seguranca.sql`, `packages/db-tests/test/seguranca.test.ts`, `fluxo-completo.test.ts` |
| 10 | Cabeçalhos de segurança (CSP), páginas carregadas sob demanda, tela de erro, manifesto do app, guia de publicação | `apps/web/seguranca.mjs`, `PUBLICAR.md` |
| IA | Visão Inteligente IA: formato da leitura, validação rígida, conversão para o projeto | `packages/core/src/visao.ts` |
| IA | Função de servidor que chama a IA (chave só no servidor), registro de uso e cota mensal | `supabase/functions/visao-ia`, `supabase/migrations/…09_visao_ia.sql` |
| Furação | Junções da caixa achadas pela geometria (minifix, cavilha, parafuso), calço da dobradiça, puxador; gaveta: corrediça no móvel e na gaveta, montagem da caixa, fundo e fixação da frente; tudo parametrizado | `packages/core/src/furacao.ts` |
| Furação | Opções, medidas do gabarito, padrão da marcenaria e folha de furação cotada | `apps/web/src/editor/Furacao.tsx`, `FolhaFuracao.tsx` |
| Cobrança | Plano, período de teste e resumo do acesso | `packages/core/src/assinatura.ts` |
| Cobrança | Assinaturas, trava de gravação sem pagamento | `supabase/migrations/…10_assinaturas.sql` |
| Cobrança | Funções de servidor do Mercado Pago (criar, consultar, pausar, cancelar; avisos com conferência HMAC) | `supabase/functions/assinatura`, `supabase/functions/mp-webhook` |
| Cobrança | Tela Assinatura e aviso no topo | `apps/web/src/pages/Assinatura.tsx` |
| Painel | Administrador do sistema: licenças por marcenaria, receita e extensão de teste | `supabase/migrations/…12_painel_plataforma.sql`, `apps/web/src/pages/Admin.tsx` |
| CNC | DXF R12 por lado de cada peça (contorno de corte, furos, canal, furos de topo em camadas), pacote .zip com lista e leia-me | `packages/core/src/dxf.ts`, `apps/web/src/editor/exportarCnc.ts` |
| Mesa e bancada | Quatro modelos: mesa com pés de MDF (saia, travessa, sapatas niveladoras), mesa com pés comprados (madeira ou metal, presos por chapa), bancada suspensa na parede (mão-francesa, cantoneira ou suporte invisível) e tampo sobre gabinetes (larguras informadas). Borda engrossada opcional; pés, suportes, sapatas e parafusos entram na lista de ferragens; mesmas listas, corte, furação, DXF e orçamento do armário | `packages/core/src/mesa.ts`, `apps/web/src/editor/PainelEntradas.tsx` |
| Marceneiro virtual | Assistente com IA, personagem 3D e voz do navegador, que explica o móvel ao cliente no editor e na página do link; fala só da ficha calculada; cota, limite por link e ritmo controlados pelo banco | `packages/core/src/marceneiro.ts`, `supabase/functions/marceneiro-virtual`, `supabase/migrations/…18_marceneiro_virtual.sql`, `apps/web/src/marceneiro` |
| Tema | Claro, escuro ou automático (segue o aparelho), escolhido por pessoa no cabeçalho; impressão e desenhos técnicos continuam claros | `apps/web/src/lib/tema.ts`, `apps/web/src/index.css` |
| Celular e tablet | Cabeçalho compacto com menu, editor em abas (Medidas / Desenho e resultado), tabelas largas viram cartões, botões e campos com 44 px e letra de 16 px em telas de toque; tablet deitado usa o layout do computador | `apps/web/src/components/Layout.tsx`, `apps/web/src/lib/cartoes.ts`, `apps/web/src/index.css` |
| Ajuste pelo desenho (opcional) | Clicar numa divisória, prateleira ou vão e digitar a medida, usar as setas (1 mm, 10 mm ou de furo em furo na regulável) ou arrastar na vista de frente (mouse ou dedo); altura livre das prateleiras; só os vãos vizinhos mudam; “ver sem as portas”; volta ao automático com um clique; furação e corte acompanham | `packages/core/src/ajustesInterior.ts`, `apps/web/src/editor/ajustes.ts`, `apps/web/src/editor/AjusteInterior.tsx`, `apps/web/src/editor/Vista2D.tsx` |
| Financeiro | Contas a receber e a pagar (uma vez, parceladas com entrada ou todo mês), baixa integral, parcial ou com desconto, estorno e cancelamento, saldo por conta, resumo de vencidos e próximos dias, fluxo de caixa em semanas ou meses e planilha para o contador; parcelas geradas do orçamento aprovado; só o dono | `packages/core/src/financeiro.ts`, `supabase/migrations/…21_financeiro.sql`, `apps/web/src/financeiro/`, `apps/web/src/pages/Financeiro.tsx` |
| Boleto e nota fiscal | Boleto pelo Mercado Pago de cada marcenaria (baixa automática pelo aviso ou pela conferência), NF-e do móvel e NFS-e da montagem pela Focus NFe de cada marcenaria, em homologação e produção; chaves cifradas no servidor | `supabase/functions/cobranca/`, `supabase/functions/boleto-aviso/`, `supabase/migrations/…22_boleto_nota_fiscal.sql`, `apps/web/src/financeiro/Integracoes.tsx`, `apps/web/src/financeiro/DoOrcamento.tsx` |
| Medição no local | Roteiro no celular para medir na casa do cliente: largura em três alturas e altura em três pontos (prumo e desnível), esquadro dos cantos pelo 3-4-5, tomadas, interruptores, água, esgoto, gás, janelas, portas, vigas, pilares e rodapé, com fotos; maior móvel que cabe (mm inteiros, com folgas), o que fica atrás do móvel e onde recortar; abre no editor ou na Visão IA; funciona sem sinal e envia quando volta; fotos em balde privado | `packages/core/src/medicao.ts`, `supabase/migrations/…20_medicao_local.sql`, `apps/web/src/lib/medicoes.ts`, `apps/web/src/medicao/`, `apps/web/src/pages/Medicoes.tsx`, `apps/web/src/pages/MedicaoDetalhe.tsx` |
| Manual de montagem | Passo a passo gerado do projeto (qual peça entra primeiro, onde vai cada minifix, cavilha, parafuso e dobradiça, com o código de cada peça), em 3D com as peças entrando no lugar, desenho em perspectiva para imprimir e link público para o montador ou cliente; as ferragens dos passos somam a lista do móvel | `packages/core/src/manualMontagem.ts`, `apps/web/src/montagem/`, `apps/web/src/editor/ManualMontagemCartao.tsx`, `apps/web/src/pages/ManualPublico.tsx` |
| Etiquetas e oficina pelo celular | Etiqueta com QR por peça (térmica 50 × 25, 60 × 40 ou 100 × 50 mm); ao escanear, o celular mostra a peça no 3D, onde vai, medidas, furação, histórico e a etapa (a cortar, cortada, fitada, furada, montada), marcada com um toque; andamento por ordem no quadro da produção, busca de peça e marcação em lote | `supabase/migrations/…19_etiquetas_oficina.sql`, `apps/web/src/lib/oficina.ts`, `apps/web/src/producao/`, `apps/web/src/pages/OficinaPeca.tsx` |
| Ambiente | Móvel em 3D em tamanho real (GLB e USDZ), link público com QR e página que abre a câmera do celular | `packages/core/src/ambiente.ts`, `apps/web/src/editor/VerNoAmbiente.tsx`, `apps/web/src/pages/Ambiente.tsx` |
| Ver em óculos | O mesmo link abre em óculos: realidade mista (Meta Quest, Galaxy XR; o móvel na sala de verdade, no chão ou na parede), realidade virtual no cômodo da medição (paredes, cantos, janelas e tomadas medidos) e tela dividida para óculos de encaixar o celular; portas e gavetas abrem, cores ilustrativas | `packages/core/src/imersivo.ts`, `apps/web/src/oculos/`, `supabase/migrations/…23_ver_em_oculos.sql` |
| Legal | Termos de Uso, Política de Privacidade e aceite gravado no cadastro | `apps/web/src/pages/Legal.tsx`, `supabase/migrations/…13_termos.sql` |
| IA | Tela Visão IA: foto ou imagem, revisão ao lado do desenho, abrir no editor | `apps/web/src/pages/VisaoIA.tsx` |
| 1–2 | Testes de banco: isolamento entre empresas, papéis, validações, importação | `packages/db-tests` |
| 1–2 | CI (GitHub Actions) | `.github/workflows/ci.yml` |

## Marca

Arquivos em `marca/` (gerados por `marca/gerar.py`, com o texto em curvas): símbolo (fundo nogueira, fundo creme e sem fundo), logo horizontal (fundo claro e fundo escuro), `cores.json` e a folha da marca em PNG. O favicon e os ícones do app ficam em `apps/web/public`.

| Cor | Hex | Uso |
| --- | --- | --- |
| Nogueira | `#3B2416` | texto, botões, cabeçalho |
| Nogueira escura | `#2A1A10` | títulos, hover |
| Freijó | `#DB8A35` | destaque, seleção |
| Freijó escuro | `#C2702A` | links, "Meu" no logo |
| Creme MDF | `#F6EFE6` | fundo |
| Pinho | `#2F6B57` | sucesso |

No app, as cores ficam em `apps/web/src/index.css` (`@theme`): a escala `amber` do Tailwind foi trocada pelo freijó e os tons escuros de `stone` pela nogueira.

## Requisitos

- Node.js 20 ou mais novo
- Docker (para o Supabase local)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)

## Rodando localmente

```bash
npm install

# 1. Sobe Postgres, Auth e API do Supabase e aplica as migrations
npx supabase start
#    Anote "API URL" e "anon key" (ou "Publishable key") que aparecem no final.

# 2. Configura o app
cp apps/web/.env.example apps/web/.env.local
#    Cole a URL e a chave no .env.local

# 3. Abre o app em http://localhost:5173
npm run dev
```

Para recomeçar o banco do zero: `npm run db:reset`.

## Testes

```bash
npm test          # motor de cálculo (Vitest + testes de propriedade com fast-check)
npm run typecheck # todos os pacotes

# Isolamento entre empresas, papéis e convites — precisa do Supabase local rodando
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:db
```

Os testes de banco rodam dentro de uma transação desfeita no final: nada fica gravado.
Cada comando é executado com o papel `authenticated` (ou `anon`) e o JWT do usuário,
do mesmo jeito que a API do Supabase faz, então as políticas RLS valem de verdade.

## Publicando no Supabase hospedado

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

No painel do projeto:

1. **Authentication → URL Configuration**: `Site URL` = endereço do app; inclua `https://seu-dominio/**` em Redirect URLs (necessário para convites, confirmação de e-mail e recuperação de senha).
2. **Authentication → Providers → Email**: ligue "Confirm email" em produção.
3. **Authentication → SMTP**: configure um provedor de e-mail próprio; o servidor padrão do Supabase tem limite baixo de envios.

O app é estático (`npm run build` gera `apps/web/dist`) e pode ser hospedado em Vercel, Netlify, Cloudflare Pages etc.
Configure o hospedeiro para devolver `index.html` em qualquer rota (SPA).

## Como o acesso funciona

| Função | Clientes | Materiais, fitas, fornecedores | Estoque | Equipe e convites | Dados da empresa |
| --- | --- | --- | --- | --- | --- |
| Dono | ler, criar, editar, excluir | ler, criar, editar, importar, excluir | ajustar | gerenciar | editar |
| Projetista | ler, criar, editar | ler, criar, editar, importar | ajustar | ver | ver |
| Vendas | ler, criar, editar | ler | ver | ver | ver |
| Produção | ler | ler | ajustar | ver | ver |

- Toda tabela de negócio tem `empresa_id`; as políticas usam `minhas_empresas()` e `tem_papel()`.
- O papel `anon` não acessa nenhuma tabela.
- Colunas de controle (`empresa_id`, ids, datas) não podem ser alteradas pela API.
- Criar empresa e aceitar convite passam por funções `SECURITY DEFINER` com validação própria.
- Uma empresa nunca fica sem dono (trigger).
- Convites valem 7 dias, são de uso único e só podem ser aceitos pelo e-mail convidado.
  O dono copia o link ou envia pelo WhatsApp; o envio por e-mail entra junto com o SMTP de produção.

## Unidades de medida (`packages/core`)

Toda medida é um **inteiro em décimos de milímetro** (18 mm = 180; kerf 3,2 mm = 32).
Isso elimina erro de arredondamento acumulado. Divisões declaram o arredondamento
(`baixo`, `cima`, `proximo`, `exato`), e `distribuir()` reparte uma medida em partes
cuja soma é exatamente o total — base dos vãos entre divisórias na Fase 3.

`lerMm()` aceita "18", "18,5", "18.5" e recusa "2.750" (separador de milhar seria lido como decimal).

## Materiais, chapas e fitas (Fase 2)

**Unidades no banco** (sempre inteiros):

| Grandeza | Coluna | Unidade | Exemplo |
| --- | --- | --- | --- |
| Espessura e medidas de chapa | `*_dmm` | décimos de mm | 18 mm = 180; 2750 mm = 27500 |
| Espessura de fita | `espessura_cmm` | centésimos de mm | 0,45 mm = 45 |
| Metragem de fita (rolo e estoque) | `*_dmm` | décimos de mm | 50 m = 500000 |
| Dinheiro | `*_centavos` | centavos | R$ 329,90 = 32990 |

**Espessura:** cada material tem a nominal (do catálogo) e, opcionalmente, a real medida com paquímetro.
O motor usa `espessura_calculo_dmm`, que é a real quando informada. A real precisa ficar a até 20% da
nominal, para pegar "183" digitado no lugar de "18,3".

**Formatos de chapa:** um material pode ter vários tamanhos (2750 × 1850, 1830 × 2750, personalizados),
cada um com preço e estoque próprios. Entre 100 mm e 6 m por lado. A direção do veio é do material e
vale para todos os formatos dele.

**Estoque:** o saldo é sempre a soma dos movimentos, e movimentos nunca são apagados.
O ajuste é por contagem: a pessoa informa quanto tem, e o sistema grava a diferença com quem fez e o motivo.
Item com histórico de estoque não pode ser excluído; desative-o.

**Isolamento:** toda ligação entre tabelas (chapa → material, material → fornecedor, movimento → chapa)
é uma chave estrangeira composta com `empresa_id`. Mesmo conhecendo o id, uma empresa não consegue
ligar um registro seu a um da outra.

**Importação de planilha (CSV):**

- Modelos para baixar na própria tela de importação; o Excel abre com acentos corretos.
- Aceita separador `;` (padrão do Excel em português), `,` ou tabulação, e arquivos em UTF-8 ou Windows-1252.
- Os nomes de coluna são flexíveis ("Espessura (mm)", "espessura_mm", "espessura").
- Toda linha é validada antes do envio; a tela lista todos os erros de cada linha com o número dela.
- Se o item já existe (mesmo nome + espessura, ou nome + largura + espessura para fitas), ele é atualizado,
  e campos vazios não apagam o que já está cadastrado. Importar a mesma planilha duas vezes não duplica nada.
- Tudo ou nada: se o banco recusar uma linha, nenhuma é gravada.
- Fornecedores citados na planilha e ainda não cadastrados são criados.

## Motor de modulação (Fase 3)

- Toda medida é inteira em décimos de mm; não há arredondamento escondido (divisões usam `div_baixo`, `div_cima`, `div_proximo` ou `div_exato`).
- Uma **montagem** (tampo/base entre laterais, tampo sobre laterais, base entre laterais com travessas) combina com um **fundo** (sobreposto, em canal, embutido). Ambas são dados, não código.
- Expressões: inteiros e booleanos, `+ - *`, comparações, `&&`, `||`, ternário, `min`, `max`, `abs`. `/` é proibido; não há `eval`.
- Na compilação são recusados: dependência circular, nome desconhecido, medida obrigatória ausente, parâmetro fora dos limites.
- Peças que não cabem na chapa são sinalizadas (`cabeNaChapa`, considerando o veio).
- Convenção: `comprimento` acompanha o veio; `largura` é a transversal.
- Testes: `npm test` (84 testes no core). `FC_RUNS=50000 npm test` roda os testes de propriedade com mais casos.

## Gerador de peças (Fase 4)

- Só um módulo válido (e com todas as peças cabendo na chapa) gera lista.
- Bordas: `frente` e `tras` acompanham o comprimento; `ext1` e `ext2` são as pontas. Padrão: frente com fita; tampo sobre laterais, frente e pontas; fundo e travessa traseira, sem fita. Dá para trocar por componente (`opcoes.bordas`).
- Veio: vem do material (sem veio = a peça pode girar no plano de corte).
- Usinagem: fundo em canal gera o canal (largura = espessura do fundo, profundidade, distância da traseira) em laterais, tampo e base. Furação de prateleira e ferragens ficam para a Fase 7.
- Peças de mesmo papel, medida, fita e usinagem viram um item (P01, P02…). Área e fita são somas inteiras; a sobra de fita arredonda para cima.
- As medidas são as **acabadas** (com a fita). O desconto da espessura da fita para o corte é feito no otimizador (Fase 6).
- CSV com ponto e vírgula e vírgula decimal, aberto direto no Excel.

## Editor visual e projetos (Fase 5)

- Toda peça tem posição (`caixa`: x, y, z e tamanho) definida na própria regra, em expressões. Origem no canto inferior esquerdo da face da frente; z cresce para trás.
- O motor confere que o tamanho da caixa é o da peça; se não for, o módulo fica inválido (`geometria_inconsistente`).
- Teste de propriedade: em qualquer módulo válido, nenhuma peça ocupa o espaço de outra, exceto o fundo dentro do canal, e ele entra exatamente `c − g` com a própria espessura.
- O canal do fundo agora sai da geometria (toda peça que o fundo invade recebe canal), inclusive a travessa traseira do gabinete.
- Vistas 2D (frente, lateral, planta) e 3D usam as mesmas posições. A peça selecionada aparece tracejada mesmo quando outra a cobre. O 3D só é baixado quando a aba é aberta.
- Clicar numa peça mostra medidas, veio, usinagem e permite trocar a fita de cada borda; só a diferença em relação ao padrão é guardada.
- Projetos guardam as **entradas** (não o resultado). Cada "Salvar" cria uma versão nova, numerada pelo banco e imutável (nem o dono altera ou apaga uma versão; elas só somem junto com o projeto). Versões antigas podem ser abertas e servir de base para uma nova.
- Papéis: dono, projetista e vendas criam e salvam; produção só consulta; só o dono exclui projeto.

## Plano de corte (Fase 6)

- **Medida de corte** = acabada − espessura da fita (por borda com fita) + sobremedida para a coladeira. A fita tem centésimos de mm e a peça, décimos: a medida de corte é arredondada **para cima**, para a peça nunca sair menor; a tela marca com ↑ as que foram arredondadas.
- **Guilhotina:** todo corte atravessa a chapa ou o pedaço de ponta a ponta. Entre peças vizinhas fica sempre a largura da serra. A chapa inteira perde o refilo em cada borda; o retalho, o refilo de retalho.
- **Veio:** peça com veio segue o veio da chapa; sem veio, pode girar.
- **Retalhos** do estoque entram antes de abrir chapa nova (o menor em que a peça cabe). Sobras com pelo menos o tamanho mínimo aparecem como retalho aproveitável.
- **Otimizador:** heurístico e determinístico (mesma entrada, mesmo plano). Testa cada formato de chapa com 216 combinações de estratégia e fica com o que gasta menos chapa inteira. A tela mostra o mínimo teórico pela área para comparação honesta.
- **Verificação:** `verificarPlano` confere todo plano sem confiar no otimizador (cada peça uma vez, medida e orientação certas, dentro da área útil, separável só com cortes de guilhotina com a serra, sobras sem invadir peça, totais). Se falhar, o otimizador lança erro: nunca devolve plano errado. Testes de propriedade rodam o otimizador com entradas aleatórias e exigem verificação limpa.
- O cálculo roda num Web Worker, refeito ~0,3 s depois de qualquer mudança. Referência: 400 peças em ~0,15 s.
- O estoque não é baixado aqui; isso entra na produção (Fase 9).

## Portas, gavetas e ferragens (Fase 7)

- Cada vão pode ficar **aberto**, ter **porta** (1 ou 2, lado das dobradiças) ou **gavetas** (1 a 8).
- **Sobreposta:** a frente cobre a caixa, com folga `gb` na borda do móvel e `gp` entre frentes. Na divisória, cada lado cobre metade dela menos meia folga (meia-sobreposição). Com tampo sobre as laterais, a frente para embaixo do tampo.
- **Embutida:** a frente fica na boca do vão, com folga `gi` por lado; exige recuo das prateleiras de pelo menos a espessura da frente.
- **Dobradiças:** 2 até 900 mm de altura, 3 até 1600, 4 até 2000, 5 até 2400 (acima disso, erro). Reta quando a porta cobre a lateral do móvel, curva quando cobre divisória, supercurva quando embutida. Copa de Ø 35 a `K` + 17,5 mm da borda, a `dd` do topo e do pé, as do meio distribuídas.
- **Gavetas:** corrediça telescópica comercial (250 a 600 mm) que cabe na profundidade livre; caixa = vão − 2 × folga da corrediça; frentes e caixas iguais (o resto da divisão, menos de 0,1 mm por gaveta, fica na folga de cima). Vão com gavetas não leva prateleira.
- **Furos de pino (sistema 32):** Ø 5 × 10 mm, a cada 32 mm, nas faces de dentro das paredes de vãos com prateleira regulável; a lateral esquerda e a direita viram itens diferentes na lista (furação espelhada). 4 suportes por prateleira regulável.
- Furos em coordenadas da peça: `u` ao longo do comprimento (a partir da ponta 1), `v` ao longo da largura (a partir da borda da frente).
- Frentes e caixas de gaveta têm posição 3D; se invadem outra peça, o módulo fica inválido. Teste de propriedade com módulos e frentes aleatórios.
- Todos os valores de ferragem são parâmetros com padrão da orientação comum de fabricantes: confira com a sua ferragem.
- A lista de ferragens liga cada necessidade a um item do catálogo (corrediça pelo comprimento) e soma os preços cadastrados; itens sem preço ficam fora da soma e são indicados.

## Orçamento e relatórios (Fase 8)

- **Custo:** chapas inteiras que o plano de corte usa × preço da chapa; fita com a sobra × preço por metro; ferragens do catálogo; mão de obra (horas × valor da hora); outros custos (frete, instalação).
- **Dinheiro em centavos inteiros**, percentuais em centésimos de ponto. Custo de linha arredonda para cima; margem e desconto, ao centavo mais próximo. O total é sempre a soma exata das linhas.
- **Preço:** custo + margem (% sobre o custo) − desconto (% sobre o preço). A tela mostra o lucro depois do desconto.
- **Pendências:** item sem preço no cadastro, plano de corte incompleto ou fita sem escolha impedem a emissão; o total parcial aparece marcado como incompleto.
- **Emissão:** só de uma versão salva do projeto. O orçamento emitido é uma fotografia: número sequencial por empresa (dado pelo banco, sem pular quando a emissão falha), conteúdo imutável; só a situação (emitido, aprovado, recusado, cancelado) muda. Projeto ou cliente apagados não apagam o orçamento.
- **Proposta para o cliente:** descrição do móvel, total, validade e condições, sem custos nem margem. "Imprimir / PDF" gera uma página.
- **Excel:** três abas (Orçamento, Peças, Ferragens), com números como número e dinheiro formatado. Conferido abrindo no LibreOffice e no openpyxl.
- **Relatório:** a página Orçamentos mostra, dos últimos 30 dias, emitidos, aprovados, taxa de aprovação e lucro dos aprovados.
- **Papéis:** dono, projetista e vendas emitem e veem; produção não vê orçamentos nem preços de venda; só o dono exclui.

## Produção e estoque (Fase 9)

- **Ordem de produção:** fotografia de uma versão salva do projeto: peças (medida de corte e acabada, fita, usinagem), ferragens, plano de corte e o que sai do estoque. Não guarda preços. Número sequencial por empresa; conteúdo imutável (mudou o projeto, cria-se outra ordem).
- **Etapas:** aguardando → em corte → em montagem → concluída, mais cancelada. O quadro mostra uma coluna por etapa, prazo, atraso e se o estoque já foi baixado.
- **Baixa de estoque** (`baixar_estoque_ordem`): uma transação. Confere tudo antes; se falta chapa, fita ou ferragem, não baixa nada e devolve a lista do que falta. Com "baixar mesmo assim", baixa e o saldo fica negativo à vista. Retalho do plano que não existe mais nunca é forçado. Cada ordem baixa uma vez.
- A baixa lança saídas de chapas, fita (com a sobra) e ferragens, tira os retalhos usados e guarda as sobras aproveitáveis do plano como retalhos novos.
- **Estorno** (`estornar_baixa_ordem`, dono e projetista): devolve tudo e retira as sobras que a baixa guardou. Ordem com baixa não pode ser cancelada nem excluída sem estorno.
- **Ferragens** têm estoque no mesmo livro de movimentos; o ajuste fica na página Ferragens.
- **Papéis:** dono e projetista criam ordens; produção muda etapa e dá baixa; vendas só consulta.

## Segurança, testes finais e publicação (Fase 10)

- **Dependências:** `npm audit` sem vulnerabilidades (o CI falha se aparecer alguma moderada ou pior).
- **Permissões:** a auditoria mostrou que as tabelas das fases 5 a 9 tinham herdado a permissão padrão do Supabase (total, inclusive para visitante anônimo). A RLS já bloqueava as linhas; a migração 08 tira a permissão em si e deixa só o que o app usa, coluna por coluna.
- **Auditoria automática** (`seguranca.test.ts`): toda tabela com RLS e política de leitura; nenhuma política ou permissão para anônimo; nada de TRUNCATE para usuário; colunas do banco não graváveis; lista fechada de funções executáveis; funções com privilégio de dono com `search_path` fixo; visões respeitando a RLS; toda tabela de negócio com `empresa_id`. Tabela nova fora do padrão quebra o teste.
- **Fluxo completo** (`fluxo-completo.test.ts`): motor e banco de verdade, do módulo à baixa de estoque, conferindo que os números de cada etapa são os que chegam na seguinte.
- **Site:** CSP sem script embutido e com conexão só para o próprio site e o Supabase, HSTS e afins; testado com o app inteiro rodando sob a política. Páginas internas baixadas sob demanda. Tela de erro com recarregar.
- **Publicação:** ver [PUBLICAR.md](PUBLICAR.md), que também lista os limites conhecidos desta versão.

## Visão Inteligente IA

Foto de um móvel (ou imagem de referência) vira um projeto do sistema.

- **Divisão de trabalho:** a IA só *descreve* o que vê num formato fechado (montagem, vãos, porta ou gavetas em cada vão, prateleiras, medidas). Ela não calcula peça nenhuma. A leitura é validada campo por campo (`validarLeitura`) e vira entradas do motor; peças, furação, plano de corte e orçamento saem do motor, como em qualquer projeto.
- **Medidas:** uma foto não tem escala. Com medidas informadas, a IA usa essas e calcula as outras pela proporção; sem nenhuma, estima pelo tipo de móvel. A tela diz de onde veio cada caso e pede confirmação antes de abrir no editor.
- **O que não cabe no formato** (portas de correr, vidro, nichos de alturas diferentes, pés, rodapé) é listado para o usuário como "ficou de fora", em vez de ser ignorado ou inventado.
- **Foto que não é de móvel:** a IA responde em texto, a função devolve "não encontrei um móvel" com a explicação, e a tentativa não gasta cota.
- **Chave da IA** fica só no servidor (segredo da função). O navegador nunca a vê. A função reserva a análise no banco com o token do próprio usuário, então papel, empresa e cota são conferidos pelas mesmas regras do resto do sistema.
- **Cota:** `empresas.visao_limite_mensal` (padrão 30 por mês, não editável pela API). Só análise concluída gasta cota; falha da IA não gasta.
- **Privacidade:** a imagem é reduzida no navegador (o que também remove localização e dados do aparelho), enviada à IA só para a leitura e não é gravada em tabela, arquivo nem log.
- **API:** modelo com visão da Anthropic, ferramenta em modo estrito com escolha automática (os modelos atuais não aceitam ferramenta forçada). Modelo configurável por `VISAO_MODELO`.
- **Testes:** validação da leitura com entradas arbitrárias (nunca lança; o que é aceito sempre roda no motor); todos os caminhos da função com IA e banco simulados; cota e isolamento no banco; a função sobe no Deno e responde. **A qualidade da leitura em fotos reais não foi medida aqui** (exige a chave da IA): faça o teste com fotos suas antes de liberar para clientes.

`npm run verificar` roda tudo: tipos, testes, testes de banco, build e auditoria de dependências.
