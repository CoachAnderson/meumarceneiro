// Gerado a partir de packages/core/src/visao.ts. Não edite à mão: rode GERAR=1 npm test.
export default {
  "ferramenta": {
    "name": "registrar_leitura_do_movel",
    "description": "Registra a leitura de UM móvel de marcenaria (armário, gabinete, roupeiro, estante, balcão, aéreo, cômoda) visto na imagem, como um módulo retangular. Use esta ferramenta sempre que a imagem mostrar um móvel desse tipo, mesmo que parte dele não possa ser representada (liste essas partes em nao_representado). Não use se a imagem não mostrar um móvel de caixa (por exemplo: pessoa, paisagem, cadeira, sofá, mesa sem caixa, documento); nesse caso responda em texto, em uma frase, dizendo o que a imagem mostra. Os vãos são contados da esquerda para a direita, separados por divisórias verticais de altura inteira.",
    "strict": true,
    "input_schema": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "tipo_de_movel",
        "montagem",
        "modo_frente",
        "largura_mm",
        "altura_mm",
        "profundidade_mm",
        "origem_das_medidas",
        "confianca",
        "vaos",
        "observacoes",
        "nao_representado"
      ],
      "properties": {
        "tipo_de_movel": {
          "type": "string",
          "description": "Nome curto do móvel em português, por exemplo \"Gabinete de cozinha com 2 portas\"."
        },
        "montagem": {
          "type": "string",
          "enum": [
            "tampo_base_entre_laterais",
            "tampo_sobre_laterais",
            "base_entre_laterais_travessas"
          ],
          "description": "tampo_base_entre_laterais: laterais inteiras, tampo e base entre elas (armários e roupeiros em geral). tampo_sobre_laterais: tampo por cima, cobrindo as laterais (cômodas, balcões com tampo aparente). base_entre_laterais_travessas: sem tampo, com travessas (gabinete que recebe pia ou bancada de pedra)."
        },
        "modo_frente": {
          "type": "string",
          "enum": [
            "sobreposta",
            "embutida"
          ],
          "description": "sobreposta: portas e gavetas cobrem a caixa. embutida: ficam dentro do vão, com a caixa aparente em volta."
        },
        "largura_mm": {
          "type": "integer",
          "description": "Largura externa total, em milímetros. Use a medida informada pelo usuário quando houver."
        },
        "altura_mm": {
          "type": "integer",
          "description": "Altura externa total da caixa, em milímetros, sem pés nem rodapé."
        },
        "profundidade_mm": {
          "type": "integer",
          "description": "Profundidade externa, em milímetros."
        },
        "origem_das_medidas": {
          "type": "string",
          "enum": [
            "informadas",
            "parciais",
            "estimadas"
          ],
          "description": "informadas: o usuário deu as três medidas. parciais: deu uma ou duas e as outras foram calculadas pela proporção na imagem. estimadas: nenhuma medida foi dada; valores típicos pela aparência."
        },
        "confianca": {
          "type": "string",
          "enum": [
            "alta",
            "media",
            "baixa"
          ],
          "description": "Confiança na leitura da estrutura (vãos e frentes), não nas medidas."
        },
        "vaos": {
          "type": "array",
          "description": "Um item por vão, da esquerda para a direita. Móvel sem divisória vertical tem um vão.",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "proporcao_largura",
              "frente",
              "portas",
              "lado_dobradicas",
              "gavetas",
              "prateleiras"
            ],
            "properties": {
              "proporcao_largura": {
                "type": "integer",
                "description": "Largura deste vão em relação aos outros, em partes (por exemplo 1, 1, 2). Vãos iguais: todos 1."
              },
              "frente": {
                "type": "string",
                "enum": [
                  "aberto",
                  "porta",
                  "gavetas"
                ],
                "description": "O que fecha o vão. Vão com porta em cima e gaveta embaixo: escolha o que ocupa mais altura e descreva o resto em nao_representado."
              },
              "portas": {
                "type": "integer",
                "description": "Com frente = porta: 1 ou 2. Nos outros casos: 0."
              },
              "lado_dobradicas": {
                "type": "string",
                "enum": [
                  "esquerda",
                  "direita",
                  "nao_se_aplica"
                ],
                "description": "Com 1 porta: lado das dobradiças (oposto ao puxador)."
              },
              "gavetas": {
                "type": "integer",
                "description": "Com frente = gavetas: quantas, empilhadas. Nos outros casos: 0."
              },
              "prateleiras": {
                "type": "integer",
                "description": "Prateleiras visíveis ou prováveis dentro do vão. Vão com gavetas: 0. Se a porta está fechada, estime pelo tipo de móvel e avise em observacoes."
              }
            }
          }
        },
        "observacoes": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Frases curtas sobre o que foi suposto ou não deu para ver (até 6)."
        },
        "nao_representado": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Partes do móvel que este formato não representa: portas de correr, vidro, nichos de alturas diferentes, pés, rodapé, tamponamento, puxadores especiais, cantos, curvas (até 8)."
        }
      }
    }
  },
  "instrucoes": "Você é um marceneiro experiente lendo a foto de um móvel para um sistema de projeto. Descreva só o que a imagem mostra; quando supuser algo, diga em observacoes. Se houver vários móveis, leia o principal (o maior ou mais central) e avise. Medidas: use as que o usuário informar; para as que faltarem, calcule pela proporção na imagem a partir das informadas; sem nenhuma, use medidas típicas do tipo de móvel e marque como estimadas. Não invente detalhes que não aparecem. Responda em português do Brasil."
} as const;
