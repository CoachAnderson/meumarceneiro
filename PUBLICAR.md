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

- A chave `service_role` e a senha do banco. O site usa só a chave `anon`, que é pública por desenho: quem protege os dados são as regras do banco (RLS), testadas em `packages/db-tests`.

## 2. Site

O build gera arquivos estáticos em `apps/web/dist`.

Variáveis de ambiente do build (as duas são públicas):

| Variável | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto, `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | chave `anon` do projeto |

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
- **Mesa:** só o tipo "mesa com pés de MDF" (tampo, dois pés em painel, saia, travessa e borda engrossada opcional). Não há ainda mesa com pés comprados, bancada suspensa nem tampo sobre gabinetes. Com borda engrossada, a lista conta a fita só na borda do tampo; use fita larga o bastante para cobrir tampo e faixa (o sistema avisa a largura). Sapatas ou niveladores dos pés não entram na lista de ferragens.
- **Furação:** cobre junções da caixa, calço da dobradiça, puxador, copa, pinos de prateleira e, nas gavetas, corrediça (no móvel e na gaveta), montagem da caixa, fundo parafusado e fixação da frente pela contrafrente. Não há exportação para CNC. O padrão da corrediça (furos a 37 mm da frente e a cada 128 mm, a 22,5 mm da base) é um ponto de partida: cada marca de corrediça tem um gabarito próprio, então meça a sua e grave como padrão da marcenaria. As frentes de gaveta de um mesmo vão podem aparecer como itens separados na lista de peças: os furos de fixação caem em alturas um pouco diferentes em cada uma, porque a caixa da gaveta não fica na mesma posição atrás de cada frente. Os padrões (tambor a 34 mm, calço a 37 mm, cavilha 8 × 30) são os mais comuns, mas cada marcenaria deve conferir com o gabarito da ferragem que usa e gravar o seu padrão. Projetos salvos antes desta versão continuam sem furação de montagem até alguém ligar.
- **Cobrança:** a lógica foi testada com o Mercado Pago simulado. Nenhuma assinatura real ou de teste foi criada: o passo 4 acima é obrigatório antes de vender. Não há emissão de nota fiscal. O painel de vendas não registra quem estendeu um teste nem mostra estornos: para isso, use o painel do Mercado Pago.
- **Visão IA:** a lógica foi testada com respostas simuladas; a qualidade da leitura em fotos reais depende da IA e não foi medida. O formato cobre um móvel retangular por foto, com vãos lado a lado; móveis em L, portas de correr e nichos de alturas diferentes ficam de fora (a tela avisa).
- **LGPD:** o sistema guarda nome, e-mail e telefone de clientes das marcenarias. Antes de vender, publique política de privacidade e termos de uso e defina como atender pedidos de exclusão de dados.
