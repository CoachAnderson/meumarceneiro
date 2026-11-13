import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DadosMedicao } from '@marcenaria/core';
import { mensagemDeErro } from '../lib/erros';
import {
  buscarMedicao,
  caminhoDaFoto,
  chavesMedicao,
  doServidor,
  enviarFoto,
  enviarMedicao,
  guardarLocal,
  lerFotoLocal,
  lerLocal,
  apagarFotoLocal,
  apagarFotosPendentes,
  type RegistroLocal,
} from '../lib/medicoes';

export type Situacao =
  | { tipo: 'carregando' }
  | { tipo: 'nao_encontrada' }
  | { tipo: 'salvo' }
  | { tipo: 'salvando' }
  | { tipo: 'sem_sinal' }
  | { tipo: 'conflito' }
  | { tipo: 'erro'; mensagem: string };

const ESPERA = 1500;

/**
 * A medição aberta: lê do aparelho e do servidor, grava no aparelho a cada
 * mudança e envia ao servidor (com as fotos) quando há sinal.
 */
export function useMedicao(id: string) {
  const queryClient = useQueryClient();
  const [registro, setRegistro] = useState<RegistroLocal | null>(() => lerLocal(id));
  const [situacao, setSituacao] = useState<Situacao>({ tipo: 'carregando' });
  const atual = useRef(registro);
  const enviando = useRef(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gravarNoAparelho = useCallback((r: RegistroLocal) => {
    atual.current = r;
    setRegistro(r);
    if (!guardarLocal(r)) setSituacao({ tipo: 'erro', mensagem: 'O armazenamento deste aparelho está cheio ou bloqueado: as mudanças só valem enquanto a página estiver aberta.' });
  }, []);

  /** Sobe as fotos que estão só no aparelho e depois a medição. */
  const sincronizar = useCallback(
    async (forcar = false) => {
      const r = atual.current;
      if (!r || enviando.current) return;
      if (!r.pendente && !forcar) {
        setSituacao({ tipo: 'salvo' });
        return;
      }
      if (!navigator.onLine) {
        setSituacao({ tipo: 'sem_sinal' });
        return;
      }
      enviando.current = true;
      setSituacao({ tipo: 'salvando' });
      try {
        await apagarFotosPendentes().catch(() => undefined);
        // 1) Fotos ainda no aparelho.
        let dados = r.dados;
        for (const f of r.dados.fotos.filter((x) => !x.caminho)) {
          const blob = await lerFotoLocal(f.id);
          if (!blob) continue;
          const caminho = caminhoDaFoto(r.empresaId, r.id, f.id);
          await enviarFoto(caminho, blob);
          dados = { ...dados, fotos: dados.fotos.map((x) => (x.id === f.id ? { ...x, caminho } : x)) };
        }
        // Pode ter mudado enquanto as fotos subiam: junta os caminhos no registro mais novo.
        const agora = atual.current!;
        const caminhos = new Map(dados.fotos.filter((x) => x.caminho).map((x) => [x.id, x.caminho]));
        const base: RegistroLocal = { ...agora, dados: { ...agora.dados, fotos: agora.dados.fotos.map((x) => (x.caminho ? x : { ...x, caminho: caminhos.get(x.id) ?? null })) } };
        // 2) A medição.
        const res = await enviarMedicao(base, forcar);
        if (!res.ok) {
          setSituacao({ tipo: 'conflito' });
          return;
        }
        // Se mudou algo enquanto enviava, fica pendente (com os caminhos das fotos) para o próximo envio.
        const depois = atual.current!;
        const mudouDurante = depois !== agora;
        const fotos = depois.dados.fotos.map((x) => (x.caminho ? x : { ...x, caminho: caminhos.get(x.id) ?? null }));
        const enviado: RegistroLocal = mudouDurante ? { ...depois, dados: { ...depois.dados, fotos }, versao: res.versao, pendente: true } : { ...base, versao: res.versao, pendente: false };
        gravarNoAparelho(enviado);
        // Fotos que subiram não precisam mais ficar no aparelho.
        for (const f of base.dados.fotos) if (f.caminho) void apagarFotoLocal(f.id);
        setSituacao(enviado.pendente ? { tipo: 'salvando' } : { tipo: 'salvo' });
        void queryClient.invalidateQueries({ queryKey: chavesMedicao.lista(r.empresaId) });
      } catch (e) {
        setSituacao(navigator.onLine ? { tipo: 'erro', mensagem: mensagemDeErro(e) } : { tipo: 'sem_sinal' });
      } finally {
        enviando.current = false;
      }
      if (atual.current?.pendente) agendar();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gravarNoAparelho, queryClient],
  );

  const agendar = useCallback(() => {
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => void sincronizar(), ESPERA);
  }, [sincronizar]);

  // Abre: o aparelho manda se tiver mudança pendente; senão vale o servidor.
  useEffect(() => {
    let vivo = true;
    const local = lerLocal(id);
    if (local) gravarNoAparelho(local);
    if (!navigator.onLine) {
      setSituacao(local ? (local.pendente ? { tipo: 'sem_sinal' } : { tipo: 'salvo' }) : { tipo: 'nao_encontrada' });
      return;
    }
    buscarMedicao(id)
      .then((m) => {
        if (!vivo) return;
        if (!m) {
          if (local) void sincronizar();
          else setSituacao({ tipo: 'nao_encontrada' });
          return;
        }
        if (local?.pendente) {
          if (local.versao !== null && local.versao < m.versao) setSituacao({ tipo: 'conflito' });
          else void sincronizar();
        } else {
          gravarNoAparelho(doServidor(m));
          setSituacao({ tipo: 'salvo' });
        }
      })
      .catch((e) => vivo && setSituacao(local ? { tipo: 'sem_sinal' } : { tipo: 'erro', mensagem: mensagemDeErro(e) }));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Voltou o sinal: envia o que ficou.
  useEffect(() => {
    const voltou = () => void sincronizar();
    window.addEventListener('online', voltou);
    return () => window.removeEventListener('online', voltou);
  }, [sincronizar]);

  useEffect(
    () => () => {
      if (relogio.current) clearTimeout(relogio.current);
    },
    [],
  );

  /** Muda a medição: grava no aparelho na hora e envia logo depois. */
  const mudar = useCallback(
    (f: (r: RegistroLocal) => RegistroLocal) => {
      const r = atual.current;
      if (!r) return;
      gravarNoAparelho({ ...f(r), pendente: true, alteradoEm: new Date().toISOString() });
      agendar();
    },
    [gravarNoAparelho, agendar],
  );
  const mudarDados = useCallback((f: (d: DadosMedicao) => DadosMedicao) => mudar((r) => ({ ...r, dados: f(r.dados) })), [mudar]);

  /** Conflito: fica com a versão deste aparelho (grava por cima) ou com a do servidor. */
  const resolver = useCallback(
    async (ficar: 'minha' | 'servidor') => {
      if (ficar === 'minha') {
        await sincronizar(true);
        return;
      }
      const m = await buscarMedicao(id);
      if (m) {
        gravarNoAparelho(doServidor(m));
        setSituacao({ tipo: 'salvo' });
      }
    },
    [id, sincronizar, gravarNoAparelho],
  );

  return { registro, situacao, mudar, mudarDados, sincronizar, resolver };
}
