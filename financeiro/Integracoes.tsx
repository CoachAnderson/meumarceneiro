import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEmpresaAtual } from '../empresa/EmpresaProvider';
import { Aviso, Botao, Campo, CampoSelecao, Cartao, Carregando } from '../components/ui';
import { buscarIntegracoes, chamarCobranca, chaveIntegracoes, enderecoAvisoBoleto, type Integracao, type Provedor } from '../lib/cobranca';
import { formatarData } from '../lib/projetos';
import type { ContaFinanceira } from '../lib/financeiro';

type Ambiente = 'teste' | 'producao';

function Situacao({ i }: { i: Integracao | undefined }) {
  if (!i) return <p className="text-sm text-stone-500">Não ligado.</p>;
  return (
    <p className="text-sm">
      <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${i.ambiente === 'producao' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-950'}`}>
        {i.ambiente === 'producao' ? 'Produção' : 'Teste'}
      </span>
      Chave terminada em <span className="font-mono">{i.final}</span> · salva em {formatarData(i.updated_at)}
    </p>
  );
}

function EscolhaAmbiente({ valor, aoMudar, rotuloTeste }: { valor: Ambiente; aoMudar: (a: Ambiente) => void; rotuloTeste: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Ambiente">
      {(['teste', 'producao'] as const).map((a) => (
        <button
          key={a}
          type="button"
          role="radio"
          aria-checked={valor === a}
          onClick={() => aoMudar(a)}
          className={`min-h-10 rounded-full px-4 text-sm font-medium ring-1 ${valor === a ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-700 ring-stone-300'}`}
        >
          {a === 'teste' ? rotuloTeste : 'Produção (de verdade)'}
        </button>
      ))}
    </div>
  );
}

function useSalvar(empresaId: string) {
  const queryClient = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  async function salvar(corpo: Record<string, unknown>, mensagem: string) {
    setErro(null);
    setOk(null);
    setOcupado(true);
    try {
      await chamarCobranca({ empresa: empresaId, ...corpo });
      await queryClient.invalidateQueries({ queryKey: chaveIntegracoes(empresaId) });
      setOk(mensagem);
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
      return false;
    } finally {
      setOcupado(false);
    }
  }
  return { salvar, ocupado, erro, ok };
}

function MercadoPago({ empresaId, atual, contas }: { empresaId: string; atual: Integracao | undefined; contas: readonly ContaFinanceira[] }) {
  const [ambiente, setAmbiente] = useState<Ambiente>(atual?.ambiente ?? 'teste');
  const [token, setToken] = useState('');
  const [conta, setConta] = useState(typeof atual?.dados.conta_id === 'string' ? atual.dados.conta_id : '');
  const [copiado, setCopiado] = useState(false);
  const { salvar, ocupado, erro, ok } = useSalvar(empresaId);
  const aviso = enderecoAvisoBoleto(empresaId);

  async function gravar() {
    if (ambiente === 'producao' && (token || atual?.ambiente !== 'producao') && !window.confirm('Produção: os boletos gerados serão de verdade e o cliente pode pagar. Continuar?')) return;
    if (await salvar({ acao: 'salvar_integracao', provedor: 'mercado_pago', ambiente, token: token || undefined, dados: conta ? { conta_id: conta } : {} }, 'Mercado Pago ligado.')) setToken('');
  }

  return (
    <Cartao titulo="Boleto · Mercado Pago da marcenaria" descricao="O boleto sai da conta Mercado Pago da marcenaria e o dinheiro cai direto nela. O sistema guarda a chave cifrada e nunca a mostra de novo.">
      <div className="space-y-4">
        <Situacao i={atual} />
        <EscolhaAmbiente valor={ambiente} aoMudar={setAmbiente} rotuloTeste="Teste" />
        <Campo
          rotulo={atual ? 'Nova chave (deixe vazio para manter a atual)' : 'Access Token'}
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          ajuda="No Mercado Pago: Suas integrações → sua aplicação → Credenciais de teste ou de produção → Access Token."
        />
        <CampoSelecao rotulo="Conta onde o boleto pago entra" value={conta} onChange={(e) => setConta(e.target.value)}>
          <option value="">Nenhuma (só marca como recebido)</option>
          {contas
            .filter((c) => c.ativa)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
        </CampoSelecao>
        <div className="rounded-lg bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
          <p className="mb-1 font-medium text-stone-900">Aviso de pagamento (opcional, recomendado)</p>
          <p className="mb-2 text-stone-600">
            Para a baixa ser na hora: no Mercado Pago, em Suas integrações → sua aplicação → Webhooks, cole este endereço e marque o evento <strong>Order</strong>. Sem ele, o sistema confere os boletos quando você abre o Financeiro.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded bg-white px-2 py-1 text-xs break-all ring-1 ring-stone-200">{aviso}</code>
            <Botao
              variante="secundario"
              onClick={() =>
                void navigator.clipboard.writeText(aviso).then(() => {
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2000);
                })
              }
            >
              {copiado ? 'Copiado' : 'Copiar'}
            </Botao>
          </div>
        </div>
        {erro && <Aviso>{erro}</Aviso>}
        {ok && <Aviso tipo="sucesso">{ok}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Botao onClick={() => void gravar()} carregando={ocupado}>
            {atual ? 'Salvar' : 'Testar e ligar'}
          </Botao>
          {atual && (
            <Botao variante="perigo" onClick={() => window.confirm('Desligar o boleto? A chave é apagada do sistema.') && void salvar({ acao: 'remover_integracao', provedor: 'mercado_pago' }, 'Desligado.')}>
              Desligar
            </Botao>
          )}
        </div>
      </div>
    </Cartao>
  );
}

const CAMPOS_FISCAIS: Array<{ k: string; rotulo: string; ajuda: string; placeholder?: string }> = [
  { k: 'cnpj', rotulo: 'CNPJ da marcenaria', ajuda: 'Só números. O mesmo cadastrado na Focus NFe, com o certificado A1.' },
  { k: 'uf', rotulo: 'UF da marcenaria', ajuda: 'Duas letras (SP). Define CFOP de dentro ou de fora do estado.', placeholder: 'SP' },
  { k: 'natureza_operacao', rotulo: 'Natureza da operação', ajuda: 'Texto que vai na nota.', placeholder: 'Venda de produção do estabelecimento' },
  { k: 'cfop_estadual', rotulo: 'CFOP dentro do estado', ajuda: 'Começa com 5. Confirme com o contador.' },
  { k: 'cfop_interestadual', rotulo: 'CFOP para fora do estado', ajuda: 'Começa com 6. Confirme com o contador.' },
  { k: 'ncm', rotulo: 'NCM padrão dos móveis', ajuda: '8 números. Pode mudar em cada nota. Confirme com o contador.' },
  { k: 'unidade', rotulo: 'Unidade', ajuda: 'UN, PC, CJ…', placeholder: 'UN' },
  { k: 'icms_situacao_tributaria', rotulo: 'ICMS: CSOSN ou CST', ajuda: 'Simples Nacional usa CSOSN (3 números). Confirme com o contador.' },
  { k: 'icms_origem', rotulo: 'Origem da mercadoria', ajuda: '0 = nacional.' },
  { k: 'pis_situacao_tributaria', rotulo: 'PIS: situação tributária', ajuda: '2 números. Confirme com o contador.' },
  { k: 'cofins_situacao_tributaria', rotulo: 'COFINS: situação tributária', ajuda: '2 números. Confirme com o contador.' },
  { k: 'modalidade_frete', rotulo: 'Frete', ajuda: '9 = sem frete; 0 = por conta da marcenaria; 1 = do cliente.' },
  { k: 'presenca_comprador', rotulo: 'Presença do comprador', ajuda: '1 = presencial; 9 = outros. Confirme com o contador.' },
];

const CAMPOS_NFSE: Array<{ k: string; rotulo: string; ajuda: string }> = [
  { k: 'inscricao_municipal', rotulo: 'Inscrição municipal', ajuda: 'Da marcenaria, na prefeitura.' },
  { k: 'codigo_municipio', rotulo: 'Código IBGE do município', ajuda: '7 números (o município da marcenaria).' },
  { k: 'item_lista_servico', rotulo: 'Item da lista de serviço', ajuda: 'Da LC 116 para a montagem. Confirme com o contador.' },
  { k: 'codigo_tributario_municipio', rotulo: 'Código tributário do município', ajuda: 'Se a prefeitura pedir.' },
  { k: 'aliquota', rotulo: 'Alíquota do ISS (%)', ajuda: 'Com ponto: 2.00' },
];

function FocusNfe({ empresaId, atual, cnpjEmpresa }: { empresaId: string; atual: Integracao | undefined; cnpjEmpresa: string | null }) {
  const d = atual?.dados ?? {};
  const [ambiente, setAmbiente] = useState<Ambiente>(atual?.ambiente ?? 'teste');
  const [token, setToken] = useState('');
  const [fiscal, setFiscal] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const c of CAMPOS_FISCAIS) v[c.k] = typeof d[c.k] === 'string' ? (d[c.k] as string) : '';
    if (!v.cnpj && cnpjEmpresa) v.cnpj = cnpjEmpresa;
    return v;
  });
  const nfseAtual = (d.nfse ?? null) as Record<string, unknown> | null;
  const [comNfse, setComNfse] = useState(!!nfseAtual);
  const [nfse, setNfse] = useState<Record<string, string>>(() => Object.fromEntries(CAMPOS_NFSE.map((c) => [c.k, typeof nfseAtual?.[c.k] === 'string' ? (nfseAtual[c.k] as string) : ''])));
  const [issRetido, setIssRetido] = useState(nfseAtual?.iss_retido === true);
  const { salvar, ocupado, erro, ok } = useSalvar(empresaId);

  async function gravar() {
    if (ambiente === 'producao' && (token || atual?.ambiente !== 'producao') && !window.confirm('Produção: as notas emitidas valem de verdade na SEFAZ e na prefeitura. Já testou em homologação? Continuar?')) return;
    const dados: Record<string, unknown> = Object.fromEntries(Object.entries(fiscal).map(([k, v]) => [k, v.trim()]));
    dados.uf = String(dados.uf ?? '').toUpperCase();
    dados.cnpj = String(dados.cnpj ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (comNfse) dados.nfse = { ...Object.fromEntries(Object.entries(nfse).map(([k, v]) => [k, v.trim()])), iss_retido: issRetido };
    if (await salvar({ acao: 'salvar_integracao', provedor: 'focus_nfe', ambiente, token: token || undefined, dados }, 'Focus NFe ligada.')) setToken('');
  }

  return (
    <Cartao titulo="Nota fiscal · Focus NFe da marcenaria" descricao="A marcenaria contrata a Focus NFe, cadastra o CNPJ e o certificado digital A1 lá, e cola aqui o token. Emita primeiro em homologação (teste) e confira com o contador.">
      <div className="space-y-4">
        <Situacao i={atual} />
        <EscolhaAmbiente valor={ambiente} aoMudar={setAmbiente} rotuloTeste="Homologação (teste)" />
        <Campo
          rotulo={atual ? 'Novo token (deixe vazio para manter o atual)' : 'Token da empresa na Focus NFe'}
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          ajuda="No painel da Focus NFe: Empresas → sua empresa → token de homologação ou de produção."
        />
        <Aviso tipo="info">Os códigos fiscais abaixo dependem do regime e da atividade da marcenaria. O sistema não sugere valores: preencha com o seu contador.</Aviso>
        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPOS_FISCAIS.map((c) => (
            <Campo key={c.k} rotulo={c.rotulo} value={fiscal[c.k] ?? ''} placeholder={c.placeholder} ajuda={c.ajuda} maxLength={60} onChange={(e) => setFiscal((f) => ({ ...f, [c.k]: e.target.value }))} />
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={comNfse} onChange={(e) => setComNfse(e.target.checked)} className="size-4 accent-amber-600" />
          Também emito NFS-e (nota de serviço, para a montagem)
        </label>
        {comNfse && (
          <div className="grid gap-3 rounded-lg bg-stone-50 p-3 ring-1 ring-stone-200 sm:grid-cols-2">
            {CAMPOS_NFSE.map((c) => (
              <Campo key={c.k} rotulo={c.rotulo} value={nfse[c.k] ?? ''} ajuda={c.ajuda} maxLength={20} onChange={(e) => setNfse((f) => ({ ...f, [c.k]: e.target.value }))} />
            ))}
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={issRetido} onChange={(e) => setIssRetido(e.target.checked)} className="size-4 accent-amber-600" />
              ISS retido pelo cliente
            </label>
          </div>
        )}
        {erro && <Aviso>{erro}</Aviso>}
        {ok && <Aviso tipo="sucesso">{ok}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Botao onClick={() => void gravar()} carregando={ocupado}>
            {atual ? 'Salvar' : 'Testar e ligar'}
          </Botao>
          {atual && (
            <Botao variante="perigo" onClick={() => window.confirm('Desligar a nota fiscal? O token é apagado do sistema.') && void salvar({ acao: 'remover_integracao', provedor: 'focus_nfe' }, 'Desligada.')}>
              Desligar
            </Botao>
          )}
        </div>
      </div>
    </Cartao>
  );
}

/** Ligar o boleto (Mercado Pago) e a nota fiscal (Focus NFe) da marcenaria. */
export function Integracoes({ contas }: { contas: readonly ContaFinanceira[] }) {
  const { empresa } = useEmpresaAtual();
  const consulta = useQuery({ queryKey: chaveIntegracoes(empresa.id), queryFn: () => buscarIntegracoes(empresa.id) });
  if (consulta.isPending) return <Carregando />;
  if (consulta.error) return <Aviso>{consulta.error instanceof Error ? consulta.error.message : 'Erro ao carregar.'}</Aviso>;
  const por = (p: Provedor) => consulta.data.find((i) => i.provedor === p);
  return (
    <div className="space-y-6">
      <MercadoPago key={`mp-${por('mercado_pago')?.updated_at ?? ''}`} empresaId={empresa.id} atual={por('mercado_pago')} contas={contas} />
      <FocusNfe key={`focus-${por('focus_nfe')?.updated_at ?? ''}`} empresaId={empresa.id} atual={por('focus_nfe')} cnpjEmpresa={(empresa as { cnpj?: string | null }).cnpj ?? null} />
    </div>
  );
}
