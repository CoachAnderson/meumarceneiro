import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { DIAS_TESTE, DIAS_TOLERANCIA, OFERTAS } from '@marcenaria/core';
import { formatarMoeda } from '@marcenaria/catalog';
import { Marca } from '../components/Marca';
import { Aviso } from '../components/ui';
import { dataDaVersao, legalIncompleto, RESPONSAVEL as R } from '../lib/legal';

const PRECO = formatarMoeda(OFERTAS.mensal.valorCentavos);

function Documento({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <Link to="/" aria-label="Meu Marceneiro, início">
            <Marca />
          </Link>
          <nav className="ml-auto flex gap-4 text-sm font-medium text-stone-600" aria-label="Documentos">
            <Link to="/termos" className="underline-offset-4 hover:underline">
              Termos de Uso
            </Link>
            <Link to="/privacidade" className="underline-offset-4 hover:underline">
              Privacidade
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        {legalIncompleto && (
          <div className="mb-6">
            <Aviso>Documento em preparação: faltam os dados da empresa responsável. Ainda não vale como versão final.</Aviso>
          </div>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">{titulo}</h1>
        <p className="mt-2 text-sm text-stone-500">Versão de {dataDaVersao()}.</p>
        <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-stone-800">{children}</div>
      </main>
    </div>
  );
}

function Secao({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-stone-900">
        {n}. {titulo}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const Lista = ({ children }: { children: ReactNode }) => <ul className="list-disc space-y-1.5 pl-5">{children}</ul>;

export function Termos() {
  return (
    <Documento titulo="Termos de Uso">
      <Secao n={1} titulo="Quem somos e o que é este documento">
        <p>
          O Meu Marceneiro é um sistema pela internet para marcenarias: projeto de móveis, lista de peças, furação, plano de corte, orçamento, produção e estoque. Ele é oferecido por {R.razaoSocial}, CNPJ {R.cnpj}, com endereço em {R.endereco}.
        </p>
        <p>Estes Termos são o contrato entre nós e quem usa o sistema. Ao criar uma conta, você declara que leu e aceita estes Termos e a <Link to="/privacidade" className="underline underline-offset-4">Política de Privacidade</Link>. Se não concordar, não use o sistema.</p>
      </Secao>

      <Secao n={2} titulo="Conta e equipe">
        <Lista>
          <li>Para usar o sistema é preciso ter 18 anos ou mais e informar dados verdadeiros.</li>
          <li>Cada pessoa usa a própria conta. Guarde sua senha; o que for feito com ela é de sua responsabilidade.</li>
          <li>Quem cria a marcenaria no sistema é o dono dela aqui dentro: convida a equipe, define o que cada um pode fazer e responde pela assinatura.</li>
          <li>Se perceber uso indevido da sua conta, avise-nos em {R.emailContato}.</li>
        </Lista>
      </Secao>

      <Secao n={3} titulo="Período de teste, plano e pagamento">
        <Lista>
          <li>Cada marcenaria nova tem {DIAS_TESTE} dias de teste, com tudo liberado e sem informar pagamento.</li>
          <li>Depois do teste, o uso completo depende da assinatura do plano mensal, de {PRECO} por mês.</li>
          <li>A cobrança é mensal e automática, feita pelo Mercado Pago na forma de pagamento que você cadastrar lá. Os dados do cartão ficam com o Mercado Pago; nós não os recebemos.</li>
          <li>Se a cobrança falhar, o Mercado Pago tenta de novo nos dias seguintes. O acesso completo é mantido por {DIAS_TOLERANCIA} dias depois do vencimento.</li>
          <li>Sem teste e sem pagamento em dia, a marcenaria fica em modo de consulta: continua vendo, imprimindo e exportando tudo, mas não cria nem altera. Nada é apagado por falta de pagamento.</li>
          <li>O preço pode mudar. Avisaremos com pelo menos 30 dias de antecedência, e o novo valor só vale para as cobranças seguintes ao aviso.</li>
        </Lista>
      </Secao>

      <Secao n={4} titulo="Cancelamento e devolução">
        <Lista>
          <li>Você pode pausar ou cancelar a assinatura quando quiser, na tela Assinatura, sem multa.</li>
          <li>Ao cancelar, não há novas cobranças e o acesso completo continua até o fim do período já pago.</li>
          <li>Se a contratação foi feita pela internet e você se arrepender em até 7 dias da primeira cobrança, devolvemos o valor integral. Basta pedir em {R.emailContato}.</li>
          <li>Fora desse caso, não há devolução proporcional de mensalidade já paga.</li>
        </Lista>
      </Secao>

      <Secao n={5} titulo="O que o sistema calcula e o que cabe a você conferir">
        <p>O sistema faz contas a partir das medidas, materiais, folgas e gabaritos que você informa. Ele é uma ferramenta de trabalho, não substitui a conferência de quem fabrica.</p>
        <Lista>
          <li>Antes de cortar, furar ou comprar material, confira as medidas, a lista de peças, a furação e o plano de corte.</li>
          <li>As medidas padrão de furação e de ferragens seguem o que é mais comum no mercado. Confira com o gabarito do fabricante da ferragem que você usa e ajuste os parâmetros.</li>
          <li>Preços, margens e orçamentos saem dos valores que você cadastrou. A decisão de preço e o que você combina com o seu cliente são seus.</li>
          <li>A Visão IA lê uma foto e propõe um projeto. A leitura pode errar. As medidas devem ser tiradas no local e conferidas antes de produzir.</li>
        </Lista>
      </Secao>

      <Secao n={6} titulo="Uso permitido">
        <p>Você se compromete a não:</p>
        <Lista>
          <li>usar o sistema para fim ilegal ou para prejudicar outras pessoas;</li>
          <li>tentar acessar dados de outra marcenaria, burlar limites ou testar falhas de segurança sem nossa autorização por escrito;</li>
          <li>copiar, revender ou sublicenciar o sistema, ou usar robôs para extrair dados em massa;</li>
          <li>enviar à Visão IA imagens que não tenha o direito de usar ou que mostrem pessoas sem autorização delas.</li>
        </Lista>
        <p>Podemos suspender a conta que descumprir estas regras, avisando o motivo.</p>
      </Secao>

      <Secao n={7} titulo="Seus dados">
        <Lista>
          <li>Os clientes, projetos, orçamentos e demais dados que você cadastra são seus. Nós os guardamos e processamos só para o sistema funcionar para você.</li>
          <li>Você pode exportar listas, planos e orçamentos em CSV, Excel e PDF a qualquer momento, inclusive em modo de consulta.</li>
          <li>Quando você cadastra dados dos seus clientes, é você quem decide por que e como usá-los, e é você quem responde por isso perante eles. Nós atuamos a seu serviço, como explica a Política de Privacidade.</li>
          <li>Se encerrar a conta, apagamos os dados da marcenaria em até 90 dias, salvo o que a lei mandar guardar.</li>
        </Lista>
      </Secao>

      <Secao n={8} titulo="Disponibilidade e suporte">
        <p>Trabalhamos para o sistema ficar no ar e correto, mas ele depende de serviços de terceiros (hospedagem, banco de dados, pagamento, inteligência artificial) e da internet. Pode haver paradas para manutenção e falhas. Não garantimos funcionamento ininterrupto nem ausência de erros. O suporte é feito por {R.emailContato}.</p>
      </Secao>

      <Secao n={9} titulo="Propriedade do sistema">
        <p>O sistema, a marca Meu Marceneiro, o código e o desenho das telas pertencem a {R.razaoSocial}. A assinatura dá o direito de usar o sistema enquanto estiver em vigor; não transfere nenhum direito sobre ele.</p>
      </Secao>

      <Secao n={10} titulo="Limite de responsabilidade">
        <p>Na medida permitida pela lei:</p>
        <Lista>
          <li>não respondemos por perdas de material, retrabalho, atraso de obra ou lucro que deixou de ser obtido em razão de medidas, parâmetros ou preços informados errado, ou de peças produzidas sem a conferência prevista no item 5;</li>
          <li>nossa responsabilidade total por danos ligados ao uso do sistema fica limitada ao valor que você pagou de assinatura nos 12 meses anteriores ao fato.</li>
        </Lista>
        <p>Nada aqui afasta direitos que a lei garante ao consumidor e que não podem ser limitados por contrato.</p>
      </Secao>

      <Secao n={11} titulo="Mudanças nestes Termos">
        <p>Podemos atualizar estes Termos. Mudanças importantes serão avisadas dentro do sistema ou por e-mail com pelo menos 15 dias de antecedência. Continuar usando o sistema depois da data de vigência significa que você aceita a nova versão.</p>
      </Secao>

      <Secao n={12} titulo="Lei e foro">
        <p>Estes Termos seguem as leis do Brasil. Fica escolhido o foro de {R.foro} para resolver questões sobre eles, ressalvado o direito do consumidor de acionar o foro do seu domicílio.</p>
        <p>Contato: {R.emailContato}.</p>
      </Secao>
    </Documento>
  );
}

export function Privacidade() {
  return (
    <Documento titulo="Política de Privacidade">
      <Secao n={1} titulo="Quem trata os seus dados">
        <p>
          {R.razaoSocial}, CNPJ {R.cnpj}, com endereço em {R.endereco}, é a responsável pelo Meu Marceneiro. Esta Política explica quais dados pessoais tratamos, para quê, com quem compartilhamos e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).
        </p>
        <p>Para qualquer assunto de privacidade, fale com o nosso encarregado: {R.emailPrivacidade}.</p>
      </Secao>

      <Secao n={2} titulo="Dois papéis diferentes">
        <Lista>
          <li><strong>Dados de quem usa o sistema</strong> (você e a sua equipe): nós decidimos como tratá-los e respondemos por isso. Somos a controladora.</li>
          <li><strong>Dados que a marcenaria cadastra</strong> (os clientes dela, por exemplo): a marcenaria decide por que e como usá-los. Ela é a controladora; nós apenas guardamos e processamos a serviço dela, como operadora. Pedidos de titulares sobre esses dados devem ser feitos à marcenaria, e nós a ajudamos a atender.</li>
        </Lista>
      </Secao>

      <Secao n={3} titulo="Quais dados tratamos">
        <Lista>
          <li><strong>Conta:</strong> nome, e-mail, senha (guardada de forma cifrada, que não conseguimos ler), data de cadastro e a versão dos Termos que você aceitou.</li>
          <li><strong>Marcenaria:</strong> nome, CNPJ (se informado), quem faz parte da equipe e a função de cada pessoa.</li>
          <li><strong>Assinatura:</strong> o e-mail da conta do Mercado Pago que paga, a situação da assinatura e as datas e valores das cobranças. Não recebemos nem guardamos número de cartão.</li>
          <li><strong>Dados de trabalho:</strong> clientes da marcenaria (nome, documento, e-mail, telefone, endereço e observações, conforme ela preencher), fornecedores, projetos, orçamentos, ordens de produção e estoque.</li>
          <li><strong>Visão IA:</strong> a imagem enviada e as medidas informadas. A imagem é reduzida no seu aparelho, perde os dados embutidos (como local da foto), é enviada para análise e não fica guardada por nós. Guardamos só o registro de uso (quem pediu, quando e o consumo), sem a imagem.</li>
          <li><strong>Ver no ambiente:</strong> quando a marcenaria gera um link para ver o móvel pela câmera do celular, guardamos um arquivo 3D só com a forma do móvel (sem nome, preço ou dado de cliente). Quem tiver o link consegue abrir esse arquivo, sem conta.</li>
          <li><strong>Registros técnicos:</strong> data, hora e endereço IP dos acessos, mantidos pelos serviços de hospedagem, como exige o Marco Civil da Internet.</li>
        </Lista>
        <p>Não pedimos dados sensíveis (saúde, religião, biometria e semelhantes). Não os coloque em campos de observação.</p>
      </Secao>

      <Secao n={4} titulo="Para que usamos e com que base legal">
        <Lista>
          <li><strong>Fazer o sistema funcionar para você</strong> (conta, equipe, projetos, cálculos, exportações): execução do contrato.</li>
          <li><strong>Cobrar a assinatura</strong> e controlar o acesso: execução do contrato.</li>
          <li><strong>Segurança</strong>, prevenção de fraude e registros de acesso: obrigação legal e legítimo interesse.</li>
          <li><strong>Avisos sobre o serviço</strong> (vencimento, mudanças, falhas): execução do contrato.</li>
          <li><strong>Acompanhar o uso de forma agregada</strong> para melhorar o sistema e atender você (por exemplo, saber que uma marcenaria está em teste): legítimo interesse.</li>
        </Lista>
        <p>Não vendemos dados pessoais e não os usamos para publicidade de terceiros.</p>
      </Secao>

      <Secao n={5} titulo="Com quem compartilhamos">
        <p>Só com as empresas que fazem o sistema funcionar, e apenas o necessário:</p>
        <Lista>
          <li><strong>Supabase:</strong> banco de dados, login e funções de servidor.</li>
          <li><strong>Provedor de hospedagem do site:</strong> entrega das telas do sistema.</li>
          <li><strong>Mercado Pago:</strong> cobrança da assinatura. O pagamento acontece na página dele, sob a política de privacidade dele.</li>
          <li><strong>Anthropic:</strong> análise das imagens enviadas à Visão IA.</li>
        </Lista>
        <p>Também podemos compartilhar dados quando a lei ou uma ordem de autoridade competente exigir.</p>
        <p>Quem administra o Meu Marceneiro vê os dados comerciais de cada marcenaria (nome, dono, e-mail, situação da assinatura e cobranças), mas não os clientes, projetos e orçamentos dela.</p>
      </Secao>

      <Secao n={6} titulo="Transferência para outros países">
        <p>Alguns desses fornecedores guardam ou processam dados fora do Brasil. Nesses casos, a transferência é feita com as garantias previstas na LGPD, como cláusulas contratuais de proteção de dados.</p>
      </Secao>

      <Secao n={7} titulo="Por quanto tempo guardamos">
        <Lista>
          <li>Dados da conta e da marcenaria: enquanto a conta existir.</li>
          <li>Depois do encerramento: apagamos em até 90 dias, salvo o que a lei mandar guardar.</li>
          <li>Registros de cobrança: pelo prazo exigido pela legislação fiscal e para defesa de direitos.</li>
          <li>Registros de acesso: pelo menos 6 meses, como determina o Marco Civil da Internet.</li>
          <li>Imagens da Visão IA: não são guardadas por nós.</li>
        </Lista>
      </Secao>

      <Secao n={8} titulo="Como protegemos">
        <Lista>
          <li>Cada marcenaria só enxerga os próprios dados; a separação é feita no banco de dados e verificada por testes automáticos.</li>
          <li>Comunicação cifrada (HTTPS) e senhas guardadas de forma cifrada.</li>
          <li>Permissões por função dentro da equipe.</li>
          <li>Chaves de pagamento e de inteligência artificial ficam só no servidor.</li>
        </Lista>
        <p>Nenhum sistema é imune a falhas. Se houver incidente de segurança com risco relevante para você, avisaremos você e a Autoridade Nacional de Proteção de Dados, como manda a lei.</p>
      </Secao>

      <Secao n={9} titulo="Cookies e armazenamento no seu aparelho">
        <p>Não usamos cookies de publicidade nem de rastreamento. O sistema guarda no seu navegador apenas o necessário para funcionar: a sessão de login, a marcenaria escolhida e o rascunho em que você está trabalhando.</p>
      </Secao>

      <Secao n={10} titulo="Seus direitos">
        <p>Você pode, a qualquer momento, pedir:</p>
        <Lista>
          <li>confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>correção de dados incompletos ou desatualizados;</li>
          <li>eliminação de dados desnecessários ou tratados em desacordo com a lei;</li>
          <li>portabilidade e informação sobre com quem compartilhamos;</li>
          <li>revisão ou oposição a tratamento feito com base em legítimo interesse.</li>
        </Lista>
        <p>Peça por {R.emailPrivacidade}. Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
      </Secao>

      <Secao n={11} titulo="Menores de idade">
        <p>O sistema é voltado a profissionais e empresas e não se destina a menores de 18 anos.</p>
      </Secao>

      <Secao n={12} titulo="Mudanças nesta Política">
        <p>Podemos atualizar esta Política. A versão em vigor fica sempre nesta página, com a data no topo. Mudanças importantes serão avisadas dentro do sistema ou por e-mail.</p>
      </Secao>
    </Documento>
  );
}
