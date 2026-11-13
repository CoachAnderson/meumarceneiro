# Publicar o Meu Marceneiro

Guia para colocar o sistema no ar. São duas partes: o **banco** (Supabase) e o **site** (qualquer hospedagem de arquivos estáticos). Não há servidor próprio para manter.

## Antes de publicar

Na sua máquina, com Node 20+ e Docker (para o Supabase local):

```bash
npm ci
npm run db:start          # sobe o Supabase local e aplica as migrações
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run verificar
```

`verificar` roda tipos, testes do motor e do catálogo, testes de banco (isolamento entre empresas, auditoria de segurança e fluxo completo), o build e a auditoria de dependências. Só publique com tudo passando.

## 1. Banco (Supabase)

1. Crie um projeto em supabase.com, na região São Paulo (`sa-east-1`), com senha forte de banco.
2. Ligue o projeto e aplique as migrações:
   ```bash
   supabase link --project-ref <ref-do-projeto>
   supabase db push
   ```
   As migrações estão em `supabase/migrations`, em ordem. Nunca edite uma migração já aplicada; crie outra.
3. Em **Authentication → URL Configuration**: `Site URL` = endereço do site (por exemplo `https://app.meumarceneiro.com.br`) e o mesmo endereço em `Redirect URLs` (com `/redefinir-senha` e `/convite/*`).
4. Em **Authentication → Providers → Email**: deixe **Confirm email ligado** em produção e senha mínima de 8 caracteres ou mais. Configure um SMTP próprio (o de teste do Supabase tem limite baixo de envios).
5. Em **Authentication → Rate Limits**: mantenha os limites padrão ou mais rígidos. Considere ligar o CAPTCHA no cadastro.
6. Em **Database → Backups**: confira que o backup diário está ativo. Para dados de clientes pagantes, vale o plano com recuperação pontual (PITR).
7. Rode a auditoria contra o banco publicado (ela só lê o catálogo do Postgres; os outros testes criam dados e são desfeitos no fim, mas prefira rodá-los num projeto de homologação):
   ```bash
   DATABASE_URL=<string de conexão do projeto> npm run test:db -- seguranca
   ```

### O que nunca vai para o site

- A chave secreta (`sb_secret_…`, ou a antiga `service_role`) e a senha do banco. O site usa só a chave publicável (`sb_publishable_…`, ou a antiga `anon`), que é pública por desenho: quem protege os dados são as regras do banco (RLS), testadas em `packages/db-tests`.
- As funções de servidor aceitam as chaves novas e as antigas (veja `supabase/functions/_shared/chaves.ts`): o Supabase entrega as duas sozinho a cada função; não há segredo para criar.

## 2. Site

O build gera arquivos estáticos em `apps/web/dist`.

Variáveis de ambiente do build (as duas são públicas):

| Variável | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto, `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | chave publicável (`sb_publishable_…`, em Project Settings → API Keys) ou a antiga `anon` |

### Vercel

- Root Directory: `apps/web`. Build Command: `npm run build`. Output: `dist`. Install Command: `npm ci` (na raiz do repositório; ative "Include files outside the root directory").
- `apps/web/vercel.json` já traz o redirecionamento das rotas para `index.html` e os cabeçalhos de segurança.

### Netlify ou Cloudflare Pages

- Base: raiz do repositório. Build: `npm ci && npm run build`. Publicar: `apps/web/dist`.
- `public/_headers` e `public/_redirects` vão junto no build.

### Cabeçalhos de segurança

Definidos em `apps/web/seguranca.mjs` (uma fonte só; `node apps/web/seguranca.mjs` regrava `vercel.json`, `_headers` e `_redirects`):

- **Content-Security-Policy:** scripts só do próprio site; conexões só com o próprio site e com `*.supabase.co`. Se usar domínio próprio para o Supabase, inclua-o em `connect-src`.
- **HSTS**, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.

Para testar o build com os cabeçalhos antes de publicar: `npm run preview -w @marcenaria/web`.

## Cobrança da assinatura (Mercado Pago)

Plano único de R$ 149,00 por mês, com 14 dias de teste. O cliente paga na página do Mercado Pago; nenhum dado de cartão passa pelo sistema. Sem estes passos o sistema funciona, mas ninguém consegue assinar: depois dos 14 dias de teste as empresas ficam só para consulta.

1. No Mercado Pago, em **Suas integrações**, abra a sua aplicação e copie o **Access Token** da aba **Teste**. Comece sempre pelo teste: as credenciais da aba Produção geram cobranças reais.
2. Grave os segredos e publique as duas funções:
   ```
   supabase secrets set MP_ACCESS_TOKEN=... APP_URL=https://seu-dominio.com.br
   supabase functions deploy assinatura
   supabase functions deploy mp-webhook --no-verify-jwt
   ```
3. Na aplicação do Mercado Pago, em **Webhooks**, cadastre o endereço `https://SEU-PROJETO.supabase.co/functions/v1/mp-webhook`, marque os eventos **Planos e assinaturas** e copie a **assinatura secreta** gerada:
   ```
   supabase secrets set MP_WEBHOOK_SECRET=...
   ```
4. Teste antes de vender. Crie um **usuário de teste comprador** no painel do Mercado Pago, entre no sistema como dono de uma empresa, abra **Assinatura**, informe o e-mail desse comprador de teste e pague com um cartão de teste. Confira, nesta ordem:
   - a tela volta do Mercado Pago e mostra **Ativa**;
   - cerca de uma hora depois aparece a data da **última cobrança aprovada**;
   - **Pausar**, **Reativar** e **Cancelar** funcionam (o cancelamento usa o valor `cancelled`; se o Mercado Pago recusar, me avise — é o único ponto que só o teste real confirma);
   - no painel do Mercado Pago, em Webhooks, os avisos aparecem como entregues (resposta 200).
5. Só depois troque `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` pelos da aba **Produção**.

Como funciona o acesso:

- **Teste:** 14 dias a partir da criação da empresa (`empresas.teste_ate`). Para estender: `update empresas set teste_ate = now() + interval '30 days' where id = '...'`.
- **Pago:** cada cobrança aprovada libera um mês mais 5 dias de tolerância (o Mercado Pago tenta de novo uma cobrança recusada por até 10 dias).
- **Sem pagamento:** a empresa fica somente leitura. Consulta, imprime e exporta tudo; não cria nem altera. Quem bloqueia é o banco, não a tela.
- **Cancelada ou pausada:** o acesso vale até o fim do período já pago.
- **Para mudar o preço:** altere `packages/core/src/assinatura.ts`, rode `GERAR=1 npm test` e publique a função `assinatura` de novo. Quem já assina continua no valor antigo.

## Ver no ambiente (móvel pela câmera do celular)

No editor, abaixo do desenho, o botão **Gerar link** publica o móvel em 3D e mostra um código QR e um link. Quem abre o link no celular vê o móvel em tamanho real pela câmera; no computador, gira o modelo e vê o QR. Não precisa de aplicativo nem de conta.

- A migration `…14_ver_no_ambiente.sql` cria sozinha o balde `ar` no Storage do Supabase. Não há nada a configurar.
- **Teste em aparelhos de verdade antes de mostrar a um cliente.** Aqui só foi possível conferir os arquivos gerados e a página; a abertura na câmera depende do aparelho:
  - iPhone e iPad: abrir o link no **Safari** (iOS 12 ou mais novo).
  - Android: precisa do aplicativo Google e do "Google Play Services para RA" (já vêm na maioria dos aparelhos compatíveis). Em aparelho sem suporte, a página avisa.
- O que conferir no teste: o móvel aparece no chão, do tamanho certo (compare com uma trena) e não deixa esticar com os dedos.
- O link é público para quem o tiver e mostra o móvel como estava na hora em que foi gerado. Cada clique em "Gerar link" cria arquivos novos (uns 150 KB). Para limpar os antigos: Supabase → Storage → `ar` → pasta da marcenaria.
- Serve para o cliente ter ideia do espaço. A posição é aproximada (erro de 1 a 3 cm é normal); não use para tirar medidas.
- Mostra um módulo por vez, com cores lisas (sem textura de madeira).

## Ver em óculos (realidade virtual e mista)

O mesmo link do "Ver no ambiente" agora também abre em óculos. Aplique a migração `…23_ver_em_oculos.sql` (deixa o balde `ar` aceitar o arquivo da cena, `<id>.json`). Links gerados antes disso continuam abrindo no celular; para os óculos, gere de novo.

- **Meta Quest 3, 3S, Pro e 2, Samsung Galaxy XR:** abrir o link no navegador dos óculos. Aparecem dois botões: **Ver na minha sala** (a sala de verdade pelas câmeras; aponta para o chão ou a parede e aperta o gatilho, ou faz a pinça, para colocar o móvel) e **Entrar no cômodo** (realidade virtual, com o cômodo da medição).
- **Apple Vision Pro:** só o **Entrar no cômodo** (o Safari dele não tem realidade mista pela web). Para ver na sala de verdade, o botão do iPhone (Quick Look) abre o arquivo 3D.
- **Óculos de encaixar o celular (VR Box):** botão **Abrir tela dividida** em qualquer celular. Olhar fixo por 1,5 s abre a porta, a gaveta ou o botão; os círculos no chão mudam o ponto de vista. No iPhone, o Safari pede licença para usar o giro do celular.
- Nos óculos, apontar para uma porta ou gaveta abre e fecha. O menu ao lado do móvel abre tudo, troca as cores (ilustrativas, não são o padrão do MDF) e sai.
- **Cômodo:** no editor, em "Cômodo para os óculos", escolha a medição, a parede e a distância do canto. Vão no link só as medidas da parede, o ângulo dos cantos e a posição dos pontos. Nome, endereço, fotos e observações ficam de fora. O que não foi medido (profundidade, altura, esquadro) é desenhado e marcado no chão como ilustrativo.
- **Teste em óculos de verdade antes de mostrar a um cliente.** Aqui foi testado com o emulador de óculos da Meta (IWER, simulando um Quest 3) e com a tela dividida no navegador. Não deu para testar a detecção de chão e parede de verdade nem o conforto da tela dividida num VR Box.
- No Quest, se o móvel não aparecer onde você aponta, faça a configuração do espaço (Configurações → Ambiente físico → Configuração do espaço): é ela que deixa o navegador achar o chão e as paredes.

## Termos de Uso e Política de Privacidade

As páginas `/termos` e `/privacidade` são públicas. O cadastro só passa com o aceite marcado, e o banco grava a versão aceita e a hora (`usuarios.termos_versao`, `termos_aceitos_em`).

1. **Leve os dois textos a um advogado antes de vender.** São um rascunho escrito para bater com o que o sistema faz; não substituem revisão jurídica.
2. Preencha os dados da empresa no ambiente de publicação do site (variáveis `VITE_LEGAL_...`, veja `apps/web/.env.example`). Enquanto faltar algum, as duas páginas mostram um aviso vermelho de "documento em preparação".
3. Os textos prometem coisas que dependem de você, não do sistema:
   - apagar os dados de quem encerrar a conta em até 90 dias (não há rotina automática: é feito pelo SQL do Supabase);
   - responder pedidos de privacidade em até 15 dias, pelo e-mail informado;
   - devolver o valor a quem se arrepender em até 7 dias da primeira cobrança (o estorno é feito no painel do Mercado Pago);
   - avisar mudança de preço com 30 dias e mudança dos termos com 15 dias;
   - guardar registros de acesso por 6 meses (confira a retenção de logs do seu plano do Supabase).
4. Quando mudar o texto, mude também `VERSAO_TERMOS` em `apps/web/src/lib/legal.ts`. Quem já tem conta não é obrigado pelo sistema a aceitar de novo: avise por e-mail.
5. O preço, os dias de teste e a tolerância que aparecem nos Termos saem do mesmo lugar que a cobrança usa; não precisam ser editados à mão.

## Painel de vendas e licenças (só para você)

Mostra as marcenarias cadastradas, quem está em teste, quem paga, quem está bloqueado, a receita recorrente e o recebido por mês. Você enxerga os dados comerciais (nome, dono, e-mail, licença, cobranças), nunca os clientes, projetos ou orçamentos de cada marcenaria.

1. Crie sua conta normalmente no sistema.
2. No SQL do Supabase, torne-se administrador (só dá para fazer por aqui; a tela não permite):
   ```
   insert into administradores_plataforma (usuario_id)
   select id from usuarios where email = 'seu-email@exemplo.com';
   ```
3. Entre de novo: aparece o botão **Administração** no topo. O endereço direto é `/admin`.

No painel dá para filtrar (pagantes, em teste, teste acabando em até 3 dias, encerrando, bloqueadas), buscar, baixar a lista em CSV e dar mais 7, 15 ou 30 dias de teste a uma marcenaria. A receita mostrada é o valor cheio das cobranças aprovadas, antes da tarifa do Mercado Pago, e só conta o que aconteceu depois de publicar esta versão.

## Visão Inteligente IA (opcional)

Sem estes passos o sistema funciona normalmente; só a tela Visão IA avisa que não está configurada.

1. Crie uma chave em console.anthropic.com (a cobrança é por uso, na sua conta da Anthropic).
2. Guarde a chave como segredo e publique a função:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=<sua chave>
   supabase secrets set VISAO_ORIGEM=https://app.meumarceneiro.com.br   # endereço do site
   supabase functions deploy visao-ia
   ```
   Opcional: `supabase secrets set VISAO_MODELO=<modelo>` para trocar o modelo (padrão `claude-sonnet-5-5`).
3. Teste com 10 a 20 fotos de móveis seus, de tipos diferentes, e compare a leitura com o móvel. Só libere para clientes se o resultado for bom o bastante para o seu público.
4. Cota por empresa: 30 análises por mês por padrão. Para mudar: `update empresas set visao_limite_mensal = 100 where id = '...'` (pelo SQL do Supabase; a API não altera).
5. Custo: cada análise envia uma imagem de até 1568 px de lado (cerca de 1.500 a 2.500 tokens de entrada) e recebe uma resposta curta. Acompanhe o gasto real na tabela `visao_analises` (tokens por análise) e no console da Anthropic.
6. Privacidade: informe na sua política que as imagens enviadas pela Visão IA são processadas pela Anthropic.

## Marceneiro virtual (opcional)

Assistente com IA, em 3D e com voz, que explica o móvel ao cliente: no editor (você e o cliente juntos, no tablet) e na página do link "Ver no ambiente" (o cliente sozinho, sem conta). Usa a mesma chave da IA da Visão IA. Sem estes passos o resto do sistema funciona normalmente; só a conversa avisa que não está configurada.

1. Aplique a migração `…18_marceneiro_virtual.sql` (`supabase db push`).
2. Publique a função. Ela aceita chamadas sem login (o cliente não tem conta), por isso o `supabase/config.toml` já traz `verify_jwt = false` para ela; quem controla o uso é o banco.
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=<sua chave>          # se ainda não fez na Visão IA
   supabase secrets set APP_URL=https://app.meumarceneiro.com.br  # se ainda não fez na assinatura
   supabase functions deploy marceneiro-virtual --no-verify-jwt
   ```
   Opcional: `supabase secrets set MARCENEIRO_MODELO=<modelo>` (padrão `claude-haiku-5-5`, rápido e barato para conversa).
3. Teste no celular: no editor, preencha preço e prazo, clique em **Conversar aqui com o cliente** e faça perguntas, inclusive uma que a ficha não responde (ele deve dizer que a marcenaria informa). Gere o link e converse pela página do cliente.
4. Controle de custo, feito pelo banco:
   - cota mensal por empresa: 300 perguntas por padrão (`update empresas set marceneiro_limite_mensal = 600 where id = '...'`);
   - cada link aceita até 40 perguntas e vale 30 dias;
   - no máximo 6 perguntas por minuto por link e 10 por minuto por usuário no editor;
   - a pergunta que falha não gasta cota.
   Acompanhe os tokens na tabela `marceneiro_perguntas`. O texto da conversa não é gravado.
5. Voz: a fala e o microfone são do próprio navegador, sem custo para você. A fala é gerada no aparelho (Android, iPhone, Windows e Mac têm voz em português). O microfone usa o reconhecimento do navegador, que no Chrome passa pelos servidores do Google e no Safari pelos da Apple; o sistema recebe só o texto. Onde não houver voz ou microfone, a conversa segue em texto.
6. Privacidade: informe na sua política que as perguntas feitas ao marceneiro virtual são processadas pela Anthropic.

## Manual de montagem e etiquetas com QR

1. Aplique a migração `…19_etiquetas_oficina.sql` (`supabase db push`). Ela cria as tabelas das peças da ordem, a função que marca a etapa e o balde público `manuais` no Storage. Não há chave nem função de servidor para configurar.
2. As etiquetas só existem nas ordens criadas depois desta versão. Ordem antiga mostra um aviso; para ter etiquetas, envie o projeto para a produção de novo.
3. Impressora térmica: no diálogo de impressão, escolha o papel do mesmo tamanho da etiqueta escolhida na ordem (50 × 25, 60 × 40 ou 100 × 50 mm), margem zero e escala 100%. Cada etiqueta sai numa página. Imprima uma de teste e escaneie com a câmera do celular antes do lote todo.
4. O QR abre `<seu endereço>/oficina/p/<id>`. Quem escaneia precisa entrar com a conta da equipe (a página pede login e volta para a peça). Dono, projetista e produção marcam a etapa; vendas só vê.
5. Teste: crie uma ordem, imprima uma etiqueta, escaneie, toque em **Cortei** e confira o andamento na ordem e no quadro da produção. Gere o link do manual no editor e abra no celular sem estar logado.

## Medição no local

1. Aplique a migração `…20_medicao_local.sql` (`supabase db push`). Ela cria a tabela das medições e o balde **privado** `medicoes` no Storage, para as fotos da casa do cliente. Não há chave nem função de servidor para configurar.
2. Confira no painel do Supabase (Storage) que o balde `medicoes` está marcado como privado. As fotos só abrem por link assinado, que vale 1 hora e só sai para quem é da equipe.
3. Sem sinal: abra a medição no celular antes de entrar na casa (com sinal). Se o sinal cair no meio, continue medindo: medidas e fotos ficam guardadas no aparelho e sobem sozinhas quando o sinal volta. Abrir o sistema do zero sem sinal ainda não funciona.
4. Teste: crie uma medição no celular, ligue o modo avião, meça uma parede e tire uma foto, desligue o modo avião e confira que o selo muda para **Salvo** e que a medição aparece no computador.

## Financeiro, boleto e nota fiscal

O financeiro (contas a receber e a pagar) só precisa do banco. O boleto e a nota fiscal usam a conta que **cada marcenaria** contrata no Mercado Pago e na Focus NFe: o dinheiro e as notas são da marcenaria, não seus.

1. Aplique as migrações `…21_financeiro.sql` e `…22_boleto_nota_fiscal.sql` (`supabase db push`). Só o dono da marcenaria vê o financeiro.
2. Crie a chave do cofre (guarda cifradas as chaves que as marcenarias colam) e publique as funções:
   ```bash
   supabase secrets set INTEGRACOES_CHAVE=$(openssl rand -base64 32)
   supabase functions deploy cobranca
   supabase functions deploy boleto-aviso --no-verify-jwt
   ```
   Guarde uma cópia da `INTEGRACOES_CHAVE` num cofre de senhas. Se ela for trocada ou perdida, todas as marcenarias precisam colar as chaves de novo.
3. Cada marcenaria, em **Financeiro → Boleto e nota**:
   - **Mercado Pago:** cola o Access Token da aplicação dela (Suas integrações → Credenciais). Comece com a credencial **de teste**. No painel do Mercado Pago dela, em Webhooks, cola o endereço que a tela mostra (`<SUPABASE_URL>/functions/v1/boleto-aviso?empresa=<id>`) e marca o evento **Order**. Sem o aviso, a baixa acontece quando o dono abre o financeiro (a tela confere os boletos em aberto).
   - **Focus NFe:** cola o token da empresa (homologação primeiro) e preenche os dados fiscais: regime, CFOP, NCM, CSOSN ou CST, PIS/COFINS e, para a montagem, o item da lista de serviço e a alíquota do ISS. **O contador da marcenaria precisa conferir esses códigos.** O sistema não inventa código fiscal: se faltar algum, ele diz o que falta e não emite.
   - O cliente precisa ter CPF ou CNPJ e endereço completo com o código IBGE do município (cadastro do cliente).
4. Teste antes de vender, em ambiente de teste: lance uma conta a receber, emita o boleto, pague com o usuário de teste do Mercado Pago e confira a baixa. Emita uma NF-e e uma NFS-e em homologação, consulte, abra o DANFE e cancele uma delas.
5. Reforma tributária: a partir de 2026 as notas passam a ter os campos de IBS e CBS. Confira com a Focus NFe e com o contador quais campos o município e o regime da marcenaria já exigem antes de ligar a produção.

## 3. Depois de publicar

Roteiro de conferência manual (leva uns 15 minutos), com duas contas em empresas diferentes:

1. Cadastrar, confirmar o e-mail, criar a empresa.
2. Cadastrar um material com chapa e preço, uma fita e uma ferragem; lançar estoque.
3. Criar um rascunho, salvar como projeto, salvar uma segunda versão e abrir a primeira pelo histórico.
4. Conferir o plano de corte, emitir um orçamento e imprimir a proposta.
5. Enviar para produção, dar baixa no estoque e conferir os saldos em Estoque.
6. Convidar um usuário de produção e confirmar que ele não vê Orçamentos.
7. Com a segunda conta (outra empresa), confirmar que nada da primeira aparece.

## Atualizações

- Código: publique o novo build. Quem estiver com a tela aberta recebe o aviso "O sistema foi atualizado" e recarrega.
- Banco: nova migração em `supabase/migrations`, testada localmente, depois `supabase db push`. Faça o banco antes do site quando a tela nova depender de coluna ou função nova.

## Limites conhecidos desta versão

- **Assinatura e cobrança** das marcenarias (planos, pagamento) não fazem parte do sistema ainda.
- **Cálculo no navegador:** medidas, plano de corte e orçamento são calculados no navegador e gravados como fotografia. Um usuário mal-intencionado poderia gravar números errados no *próprio* projeto, nunca no de outra empresa. Uma conferência no servidor antes de liberar para fabricação exigiria uma Edge Function rodando o mesmo motor.
- **Testes de tela automatizados** não estão no repositório. O motor e o banco têm testes automáticos; as telas foram conferidas por capturas com dados simulados e pedem o roteiro manual acima a cada publicação.
- **CNC:** o botão "DXF para CNC" (no plano de corte) gera um DXF R12 por lado de cada peça, com contorno na medida de corte e furos, canais e furos de topo em camadas nomeadas pela ferramenta e profundidade (veja o LEIAME.txt dentro do pacote). Os arquivos foram validados num leitor de DXF independente, mas não numa máquina: corte uma peça de teste e confira com a folha de furação antes de produzir. Não há ainda formato próprio de fabricante (Homag .mpr, Biesse .cix).
- **Mesa e bancada:** quatro modelos (pés de MDF, pés comprados, bancada suspensa e tampo sobre gabinetes). Os pés comprados, os suportes da bancada e os gabinetes aparecem no desenho mas não entram na lista de corte: os pés e suportes entram na lista de ferragens, e os gabinetes são calculados à parte, como armário. Parafusos e buchas da parede não entram na lista, porque dependem da parede (alvenaria, drywall); confira a carga que o suporte aguenta no catálogo do fabricante. No tampo sobre gabinetes, a profundidade e a altura dos gabinetes que o sistema mostra são as que cabem embaixo do tampo; os furos de fixação são feitos por dentro de cada gabinete. Sapatas niveladoras só nos pés de MDF. Com borda engrossada, a lista conta a fita só na borda do tampo; use fita larga o bastante para cobrir tampo e faixa (o sistema avisa a largura). Nos modelos de parede não existe borda engrossada atrás.
- **Furação:** cobre junções da caixa, calço da dobradiça, puxador, copa, pinos de prateleira e, nas gavetas, corrediça (no móvel e na gaveta), montagem da caixa, fundo parafusado e fixação da frente pela contrafrente. O padrão da corrediça (furos a 37 mm da frente e a cada 128 mm, a 22,5 mm da base) é um ponto de partida: cada marca de corrediça tem um gabarito próprio, então meça a sua e grave como padrão da marcenaria. As frentes de gaveta de um mesmo vão podem aparecer como itens separados na lista de peças: os furos de fixação caem em alturas um pouco diferentes em cada uma, porque a caixa da gaveta não fica na mesma posição atrás de cada frente. Os padrões (tambor a 34 mm, calço a 37 mm, cavilha 8 × 30) são os mais comuns, mas cada marcenaria deve conferir com o gabarito da ferragem que usa e gravar o seu padrão. Projetos salvos antes desta versão continuam sem furação de montagem até alguém ligar.
- **Cobrança:** a lógica foi testada com o Mercado Pago simulado. Nenhuma assinatura real ou de teste foi criada: o passo 4 acima é obrigatório antes de vender. A nota fiscal da *assinatura* (sua, para as marcenarias) não é emitida pelo sistema. O painel de vendas não registra quem estendeu um teste nem mostra estornos: para isso, use o painel do Mercado Pago.
- **Visão IA:** a lógica foi testada com respostas simuladas; a qualidade da leitura em fotos reais depende da IA e não foi medida. O formato cobre um móvel retangular por foto, com vãos lado a lado; móveis em L, portas de correr e nichos de alturas diferentes ficam de fora (a tela avisa).
- **Marceneiro virtual:** a lógica foi testada com a IA simulada; a qualidade das respostas reais não foi medida. Ele recebe só a ficha do móvel (medidas, materiais, composição, ferragens e o que a marcenaria digitou) e tem ordem de não inventar nada fora dela, mas uma IA pode errar: o aviso na tela diz que preço, prazo e mudanças são confirmados pela marcenaria. No link, ele não muda o projeto nem registra pedidos; o cliente envia o resumo da conversa pelo WhatsApp. No editor, a medida pedida só vai para o desenho quando você clica em **Aplicar no desenho**, e o preço digitado é apagado. A conversa fica na página do móvel, não dentro da câmera de realidade aumentada: os visualizadores do Android e do iPhone não deixam sites desenharem por cima da câmera.
- **Boleto e nota fiscal:** a lógica foi testada com o Mercado Pago e a Focus NFe simulados; nenhum boleto nem nota real ou de homologação foi emitido. Os nomes dos campos da Focus vieram da documentação e de exemplos dela; confira a primeira nota em homologação campo a campo. A nota sai com um item por orçamento (o móvel, ou a montagem). Carta de correção, nota de devolução, MDF-e e importação de XML de compra não estão no sistema. Pix e cartão não estão no recebimento automático: registre como baixa manual.
- **LGPD:** o sistema guarda nome, e-mail e telefone de clientes das marcenarias. Antes de vender, publique política de privacidade e termos de uso e defina como atender pedidos de exclusão de dados.
