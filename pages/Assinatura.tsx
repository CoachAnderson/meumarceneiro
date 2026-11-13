import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OFERTAS, resumirAcesso, type ResumoAcesso, type StatusAssinatura } from '@marcenaria/core';
import { formatarMoeda } from '@marcenaria/catalog';
import { useAuth } from '../auth/AuthProvider';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, Carregando, Cartao, Titulo } from '../components/ui';
import { buscarAssinatura, buscarSituacao, chamarAssinatura, chaveAssinatura, chaveSituacao, enderecoDePagamento, ErroAssinatura, type Assinatura as Linha } from '../lib/assinatura';
import { mensagemDeErro } from '../lib/erros';
import { emailValido, formatarData } from '../lib/validacao';

const OFERTA = OFERTAS.mensal;

const NOME_STATUS: Record<StatusAssinatura, string> = {
  pendente: 'Aguardando pagamento',
  ativa: 'Ativa',
  pausada: 'Pausada',
  cancelada: 'Cancelada',
};

export function textoDoAcesso(r: ResumoAcesso): string {
  const dias = `${r.diasRestantes} ${r.diasRestantes === 1 ? 'dia' : 'dias'}`;
  if (r.tipo === 'teste') return `Período de teste: ${r.diasRestantes === 1 ? 'falta' : 'faltam'} ${dias}.`;
  if (r.tipo === 'ativa') return 'Assinatura em dia.';
  if (r.tipo === 'encerrando') return `A assinatura não vai renovar. O acesso completo vale por mais ${dias}.`;
  return 'Sem assinatura ativa: os dados ficam disponíveis para consulta, mas não é possível criar nem alterar.';
}

export function Assinatura() {
  const { empresa, papel } = useEmpresaAtual();
  const { usuario } = useAuth();
  const queryClient = useQueryClient();
  const dono = papel === 'dono';

  const situacao = useQuery({ queryKey: chaveSituacao(empresa.id), queryFn: () => buscarSituacao(empresa.id) });
  const assinatura = useQuery({ queryKey: chaveAssinatura(empresa.id), queryFn: () => buscarAssinatura(empresa.id), enabled: dono });

  const [email, setEmail] = useState(usuario?.email ?? '');
  const [processando, setProcessando] = useState<null | 'assinar' | 'pausar' | 'reativar' | 'cancelar' | 'consultar'>(null);
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'sucesso' | 'info'; texto: string } | null>(null);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);

  const recarregar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: chaveSituacao(empresa.id) }),
      queryClient.invalidateQueries({ queryKey: chaveAssinatura(empresa.id) }),
    ]);

  // Ao abrir a tela (inclusive na volta do Mercado Pago), o dono confere a situação na fonte.
  const conferida = useRef<string | null>(null);
  useEffect(() => {
    if (!dono || conferida.current === empresa.id) return;
    conferida.current = empresa.id;
    chamarAssinatura(empresa.id, { acao: 'consultar' })
      .then(recarregar)
      .catch(() => {
        // Cobrança não publicada ou Mercado Pago fora do ar: a tela mostra o que o banco já sabe.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dono, empresa.id]);

  async function executar(acao: 'pausar' | 'reativar' | 'cancelar' | 'consultar', sucesso: string) {
    if (processando) return;
    setProcessando(acao);
    setMensagem(null);
    try {
      await chamarAssinatura(empresa.id, { acao });
      await recarregar();
      setMensagem({ tipo: 'sucesso', texto: sucesso });
      setConfirmarCancelamento(false);
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof ErroAssinatura ? e.message : mensagemDeErro(e) });
    } finally {
      setProcessando(null);
    }
  }

  async function aoAssinar(evento: FormEvent) {
    evento.preventDefault();
    if (processando) return; // um clique, uma assinatura
    setProcessando('assinar');
    setMensagem(null);
    try {
      const r = await chamarAssinatura(empresa.id, { acao: 'assinar', plano: OFERTA.codigo, email: email.trim() });
      const destino = enderecoDePagamento(r.init_point);
      if (!destino) throw new ErroAssinatura('O servidor respondeu sem o endereço de pagamento. Tente de novo.', 'resposta');
      setMensagem({ tipo: 'info', texto: 'Abrindo a página segura do Mercado Pago…' });
      window.location.assign(destino);
      // Fica em "processando" até a página trocar.
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof ErroAssinatura ? `${e.message}${e.codigo === 'mp' || e.codigo === 'rede' ? ' Nada foi cobrado.' : ''}` : mensagemDeErro(e) });
      setProcessando(null);
    }
  }

  if (situacao.isPending || (dono && assinatura.isPending)) {
    return (
      <>
        <Titulo>Assinatura</Titulo>
        <Carregando texto="Carregando a situação da assinatura…" />
      </>
    );
  }
  if (situacao.isError || assinatura.isError) {
    return (
      <>
        <Titulo>Assinatura</Titulo>
        <Aviso>{mensagemDeErro(situacao.error ?? assinatura.error)} Atualize a página para tentar de novo.</Aviso>
      </>
    );
  }

  const resumo = resumirAcesso(situacao.data);
  const linha: Linha | null = assinatura.data ?? null;
  const viva = linha && linha.status !== 'cancelada' ? linha : null;
  const podeAssinar = dono && (!viva || viva.status === 'pendente');
  const erroEmail = email.trim() && !emailValido(email) ? 'E-mail inválido.' : null;

  return (
    <div data-mp-subscriptions-page="without-plan-pending">
      <Titulo subtitulo="Plano do Meu Marceneiro para esta empresa. O pagamento é feito na página do Mercado Pago.">Assinatura</Titulo>
      <div className="space-y-6">
        <Aviso tipo={resumo.tipo === 'bloqueada' ? 'erro' : resumo.tipo === 'ativa' ? 'sucesso' : 'info'}>
          {textoDoAcesso(resumo)}
          {resumo.ate && resumo.tipo !== 'ativa' && <> Até {formatarData(resumo.ate)}.</>}
        </Aviso>

        {mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}

        {!dono && (
          <Cartao titulo="Quem cuida da assinatura">
            <p className="text-sm text-stone-600">Só o dono da empresa assina, pausa ou cancela o plano. Se o acesso estiver bloqueado, avise o dono.</p>
          </Cartao>
        )}

        {dono && viva && viva.status !== 'pendente' && (
          <Cartao titulo={OFERTA.nome} descricao={`${formatarMoeda(viva.valor_centavos ?? OFERTA.valorCentavos)} por mês, cobrado pelo Mercado Pago.`}>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-stone-500">Situação</dt>
                <dd className="font-medium">{NOME_STATUS[viva.status]}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Última cobrança aprovada</dt>
                <dd className="font-medium">{viva.ultima_cobranca ? formatarData(viva.ultima_cobranca) : 'Em processamento'}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Próxima cobrança</dt>
                <dd className="font-medium">{viva.proxima_cobranca ? formatarData(viva.proxima_cobranca) : 'Não há'}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Conta que paga</dt>
                <dd className="truncate font-medium">{viva.pagador_email ?? 'Não informada'}</dd>
              </div>
            </dl>
            {viva.status === 'ativa' && !viva.ultima_cobranca && (
              <p className="mt-4 text-sm text-stone-500">A primeira cobrança costuma ser processada em até uma hora. Enquanto isso o acesso já está liberado.</p>
            )}
            <div className="mt-5 flex flex-wrap gap-3">
              <Botao variante="secundario" carregando={processando === 'consultar'} disabled={!!processando} onClick={() => executar('consultar', 'Situação atualizada.')}>
                Atualizar situação
              </Botao>
              {viva.status === 'ativa' && (
                <Botao variante="secundario" carregando={processando === 'pausar'} disabled={!!processando} onClick={() => executar('pausar', 'Assinatura pausada. Não haverá novas cobranças até você reativar.')}>
                  Pausar
                </Botao>
              )}
              {viva.status === 'pausada' && (
                <Botao carregando={processando === 'reativar'} disabled={!!processando} onClick={() => executar('reativar', 'Assinatura reativada.')}>
                  Reativar
                </Botao>
              )}
              {!confirmarCancelamento ? (
                <Botao variante="perigo" disabled={!!processando} onClick={() => setConfirmarCancelamento(true)}>
                  Cancelar assinatura
                </Botao>
              ) : (
                <span className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-stone-700">Cancelar de vez? O acesso vale até o fim do período já pago.</span>
                  <Botao variante="perigo" carregando={processando === 'cancelar'} disabled={!!processando} onClick={() => executar('cancelar', 'Assinatura cancelada. Não haverá novas cobranças.')}>
                    Sim, cancelar
                  </Botao>
                  <Botao variante="discreto" disabled={!!processando} onClick={() => setConfirmarCancelamento(false)}>
                    Voltar
                  </Botao>
                </span>
              )}
            </div>
          </Cartao>
        )}

        {podeAssinar && (
          <Cartao titulo={OFERTA.nome} descricao="Tudo liberado: projetos, plano de corte, orçamentos, produção, estoque, equipe sem limite de usuários e Visão IA.">
            <p className="text-3xl font-semibold tracking-tight text-stone-900">
              {formatarMoeda(OFERTA.valorCentavos)} <span className="text-base font-normal text-stone-500">por mês</span>
            </p>
            <ul className="mt-3 space-y-1 text-sm text-stone-600">
              <li>Cobrança mensal automática pelo Mercado Pago. A primeira acontece logo após a confirmação.</li>
              <li>Sem fidelidade: pause ou cancele nesta tela quando quiser.</li>
              <li>Os dados de pagamento ficam só no Mercado Pago; este sistema não os recebe.</li>
            </ul>
            {viva?.status === 'pendente' && (
              <p className="mt-4 text-sm text-amber-800">Há uma assinatura iniciada e ainda não paga. Ao continuar, ela é descartada e uma nova é criada.</p>
            )}
            <form onSubmit={aoAssinar} className="mt-5 grid max-w-md gap-4" noValidate>
              <Campo
                rotulo="E-mail da conta do Mercado Pago que vai pagar"
                ajuda="Precisa ser o e-mail com que você entra no Mercado Pago."
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                erro={erroEmail}
                obrigatorio
              />
              <div>
                <Botao type="submit" data-mp-subscription-cta="without-plan-pending" carregando={processando === 'assinar'} disabled={!!processando || !emailValido(email)}>
                  {processando === 'assinar' ? 'Processando…' : 'Assinar com Mercado Pago'}
                </Botao>
              </div>
            </form>
          </Cartao>
        )}

        {dono && linha?.status === 'cancelada' && (
          <p className="text-sm text-stone-500">
            Assinatura anterior cancelada{linha.ultima_cobranca ? `; última cobrança em ${formatarData(linha.ultima_cobranca)}` : ''}.
          </p>
        )}
      </div>
    </div>
  );
}
