import { supabase } from "./supabase";
import type { Papel } from "./tipos";

export const podeUsarVisao = (papel: Papel) => papel !== "producao";

export const chaveCotaVisao = (empresaId: string) =>
  ["visao-cota", empresaId] as const;

export async function buscarCotaVisao(
  empresaId: string,
): Promise<{ usadas: number; limite: number }> {
  const { data, error } = await supabase.rpc("cota_visao", {
    p_empresa: empresaId,
  });
  if (error) throw error;
  return data as { usadas: number; limite: number };
}

export interface ImagemPreparada {
  tipo: "image/jpeg";
  base64: string;
  /** Para mostrar na tela (fica só no navegador). */
  url: string;
  largura: number;
  altura: number;
}

/** Lado maior enviado à IA. Acima disso ela reduz a imagem de qualquer jeito; menor é mais rápido e barato. */
const LADO_MAXIMO = 1568;

/**
 * Reduz a foto no navegador e converte para JPEG. Além de economizar, tira os
 * dados embutidos do arquivo original (local da foto, aparelho).
 */
export async function prepararImagem(arquivo: File): Promise<ImagemPreparada> {
  if (!arquivo.type.startsWith("image/"))
    throw new Error("Escolha um arquivo de imagem (foto, JPEG, PNG ou WebP).");
  if (arquivo.size > 30 * 1024 * 1024)
    throw new Error("A imagem tem mais de 30 MB. Escolha uma foto menor.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo, {
      imageOrientation: "from-image",
    });
  } catch {
    throw new Error(
      "Não foi possível abrir a imagem neste navegador. Tente uma foto em JPEG ou PNG.",
    );
  }
  const escala = Math.min(
    1,
    LADO_MAXIMO / Math.max(bitmap.width, bitmap.height),
  );
  const largura = Math.max(1, Math.round(bitmap.width * escala));
  const altura = Math.max(1, Math.round(bitmap.height * escala));
  if (Math.min(largura, altura) < 200)
    throw new Error(
      "A imagem é pequena demais para a IA ler (mínimo de 200 pixels no lado menor).",
    );
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error("Não foi possível preparar a imagem neste navegador.");
  // Fundo branco: PNG transparente não vira preto no JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return {
    tipo: "image/jpeg",
    base64: url.slice(url.indexOf(",") + 1),
    url,
    largura,
    altura,
  };
}

export class ErroVisao extends Error {
  constructor(
    mensagem: string,
    readonly codigo: string,
    readonly explicacao: string | null = null,
    /** Passos para o dono do sistema resolver (quando o problema é de configuração). */
    readonly ajuda: string[] = [],
  ) {
    super(mensagem);
    this.name = "ErroVisao";
  }
}

/** O que o dono do sistema confere quando a função não responde. */
export const AJUDA_FUNCAO = [
  'No painel do Supabase, abra Edge Functions e veja se "visao-ia" está na lista. Se não estiver, publique: supabase functions deploy visao-ia',
  "Em Edge Functions → Secrets, confira se existe ANTHROPIC_API_KEY. Se você criou VISAO_ORIGEM, ele precisa ser o endereço exato do site (com https://, sem barra no final), ou apague esse segredo.",
  "Em Edge Functions → visao-ia → Logs, veja se aparece algum erro ao tentar de novo.",
];

/**
 * Sem resposta legível da função: descobre se é a internet ou a função. Se o
 * banco responde, a internet e o Supabase estão de pé, e o problema é a função
 * (não publicada, falhando ao iniciar ou recusando o endereço do site).
 */
async function diagnosticarFalha(empresaId: string): Promise<ErroVisao> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return new ErroVisao(
      "Este aparelho está sem internet. Conecte e tente de novo.",
      "rede",
    );
  }
  let banco = false;
  try {
    banco = !(await supabase.rpc('cota_visao', { p_empresa: empresaId })).error;
  } catch {
    banco = false;
  }
  if (!banco)
    return new ErroVisao(
      "Não foi possível falar com o servidor. Confira a internet e tente de novo.",
      "rede",
    );
  return new ErroVisao(
    "O sistema está no ar, mas a função da Visão IA não respondeu. Isso é configuração do servidor, não da sua internet. Se você não é o dono do sistema, mostre esta mensagem a ele.",
    "funcao_sem_resposta",
    null,
    AJUDA_FUNCAO,
  );
}

/** Envia a imagem à função de servidor e devolve a leitura bruta da IA. */
export async function analisarImagem(p: {
  empresaId: string;
  imagem: ImagemPreparada;
  medidas: { largura?: number; altura?: number; profundidade?: number };
  nota: string;
}): Promise<{ leitura: unknown; modelo: string }> {
  const { data, error } = await supabase.functions.invoke("visao-ia", {
    body: {
      empresaId: p.empresaId,
      imagem: { tipo: p.imagem.tipo, base64: p.imagem.base64 },
      medidas: p.medidas,
      nota: p.nota.trim() || undefined,
    },
  });
  if (error) {
    // Erro com resposta da função: usa a mensagem dela.
    const resposta = (error as { context?: unknown }).context;
    if (resposta instanceof Response) {
      const corpo = (await resposta.json().catch(() => null)) as {
        erro?: string;
        codigo?: string;
        explicacao?: string | null;
      } | null;
      if (corpo?.erro)
        throw new ErroVisao(
          corpo.erro,
          corpo.codigo ?? "erro",
          corpo.explicacao ?? null,
        );
      if (resposta.status === 404)
        throw new ErroVisao(
          "A Visão IA ainda não foi publicada neste sistema.",
          "sem_funcao",
          null,
          AJUDA_FUNCAO,
        );
      if (resposta.status === 401)
        throw new ErroVisao(
          "Sua sessão expirou. Saia e entre de novo no sistema.",
          "sem_login",
        );
      if (resposta.status >= 500)
        throw new ErroVisao(
          "A função da Visão IA falhou ao iniciar no servidor.",
          "falha_servidor",
          null,
          AJUDA_FUNCAO,
        );
    }
    throw await diagnosticarFalha(p.empresaId);
  }
  const d = data as { leitura?: unknown; modelo?: string } | null;
  if (!d || d.leitura === undefined)
    throw new ErroVisao(
      "O servidor respondeu sem a leitura. Tente de novo.",
      "resposta",
    );
  return { leitura: d.leitura, modelo: d.modelo ?? "" };
}
