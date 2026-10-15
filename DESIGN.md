---
name: Studio
description: Mesa de áudio escura e compacta para separar, ouvir e editar canais locais.
colors:
  canvas: "#080808"
  reading-canvas: "#030303"
  surface: "#202020"
  field: "#292929"
  section-surface: "#111111"
  text: "#f5f5f5"
  muted-text: "#aaaaaa"
  border: "#494949"
  wave-blue: "#61a0f5"
  wave-sky: "#38b6ea"
  wave-turquoise: "#19c0dd"
  wave-cyan: "#00cada"
  wave-aqua: "#2adce8"
  wave-ice: "#73edf3"
  wave-pale: "#a3f4f5"
  wave-ink: "#087f88"
  active: "#00c9c4"
  focus: "#30d7df"
  solo: "#f2c065"
typography:
  title:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "-.025em"
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "13px"
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "12px"
rounded:
  switch: "3px"
  field: "5px"
  control: "7px"
  popover: "15px"
spacing:
  tight: "8px"
  compact: "12px"
  regular: "16px"
  roomy: "20px"
components:
  button-default:
    backgroundColor: "#262626"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "36px"
  switch-active:
    backgroundColor: "{colors.active}"
    textColor: "#032c2e"
    rounded: "{rounded.switch}"
  wave:
    backgroundColor: "{colors.wave-cyan}"
    rounded: "{rounded.control}"
    height: "64px"
---

# Design System: Studio

## Overview

**Creative North Star: "Mesa de mixagem compacta"**

O Studio organiza reprodução e edição em uma superfície quase preta. A leitura principal percorre os nomes e controles dos canais à esquerda e as ondas coloridas à direita; a régua e o cursor de reprodução alinham as faixas. Popovers concentram ajustes sem deslocar o espaço de trabalho.

A referência dimensional foi observada no Moises Desktop em 15/10/2026, com uma música de demonstração e janela de 1262 × 721 px. O documento descreve a implementação local em `public/studio.css`, `public/studio-view.js` e `public/studio-controls.js`. Uma inspeção básica da versão local aberta no Opera confirmou controles à esquerda, ondas azuis/cianas, metrônomo e transporte no projeto de sete faixas. O navegador estava com zoom reduzido; não houve comparação de pixels nem confirmação de fidelidade visual fina.

**Key Characteristics:**

- Superfície escura, controles densos e pouca ornamentação.
- Ondas azuis e cianas para canais reais, com cursor branco compartilhado.
- Transporte fixado abaixo da área de faixas; letra, acordes e seções acessíveis à direita.

## Colors

A base é preta e cinza escuro; o azul e o ciano distinguem faixas e estados interativos.

### Primary

- **Ciano ativo:** indica M ligado, progresso de slider e outras seleções. O foco de teclado usa um ciano mais claro e visível.
- **Azul a ciano das ondas:** os canais usam, nessa ordem, `wave-blue`, `wave-sky`, `wave-turquoise`, `wave-cyan`, `wave-aqua`, `wave-ice` e `wave-pale`, repetidos se houver mais canais. As barras desenhadas no canvas usam `wave-ink` sobre cada fundo colorido.

### Secondary

- **Âmbar de solo:** identifica S ativo sem confundi-lo com M ativo.

### Neutral

- **Preto do Studio:** cobre a área de trabalho e o transporte; o painel de leitura usa um preto ainda mais profundo.
- **Cinzas de superfície:** separam botões, campos, popovers e lista de seções por tom e borda, sem cartões altos.
- **Texto claro e cinza:** reservam o maior contraste a título, transporte e conteúdo ativo; rótulos auxiliares recuam.

**The Channel Color Rule.** A cor acompanha cada arquivo real. Não crie uma faixa visual para áudio inexistente.

## Typography

**Display Font:** Arial, com Helvetica e sans-serif como alternativas.
**Body Font:** Arial, com Helvetica e sans-serif como alternativas.

**Character:** Tipografia direta e compacta para ler controles durante a reprodução.

### Hierarchy

- **Title** (peso 600, 16 px): nome da música no cabeçalho, truncado quando necessário.
- **Body** (13 px): controles e conteúdo comum do Studio.
- **Label** (12 px): nomes de canal, tempo, campos e ações secundárias.
- **Leitura** (30 px no desktop, 23 px no celular): linhas de letra; a linha ativa passa de cinza a branco.

## Layout

Na referência de 1262 × 721 px, o cabeçalho mede 94 px de altura. A implementação usa essa altura no desktop, régua de 54 px, coluna fixa de controles de 236 px, linhas de faixa de 69 px com ondas de 64 px e transporte com altura mínima de 86 px. A linha da faixa reserva 5 px abaixo da onda. O transporte contém volume geral, saltos de 10 segundos, reprodução, loop e posição; os botões de letra, acordes e seções ficam à direita.

O zoom alarga a linha do tempo dentro de uma área rolável. Os nomes e os controles de canal permanecem visíveis na margem esquerda. O painel de seções ocupa 240 px à direita. Quando aberto, o painel de leitura cobre as ondas e preserva a coluna de controles no desktop.

Até 1100 px, os controles do cabeçalho e o transporte se comprimem. Até 700 px, a coluna de canais passa a 174 px, o cabeçalho a 116 px, a régua a 42 px e o transporte a no mínimo 118 px. Leitura e seções cobrem a área de faixas; os controles encobertos saem da navegação por teclado.

## Elevation & Depth

A hierarquia vem principalmente de tons de superfície. Popovers têm sombra (`0 12px 30px #0008`); o painel lateral de seções recebe sombra no celular. Ondas e controles de faixa ficam planos para manter o alinhamento da linha do tempo.

## Shapes

Os controles têm cantos suavemente arredondados (7 px); campos usam 5 px, M/S usam 3 px, ondas usam 7 px e popovers usam 15 px. Sliders têm trilhas finas e indicadores circulares; panorama usa um disco com marca radial. Régua, cursor e limites do loop mantêm linhas retas e finas.

## Components

### Buttons and switches

Botões comuns têm fundo cinza escuro, texto claro, altura mínima de 36 px e realce de fundo ao passar o ponteiro. O foco visível usa contorno ciano de 2 px com afastamento de 3 px. M ativo fica ciano; S ativo fica âmbar. Os controles de transporte usam fundo transparente, enquanto o botão selecionado de leitura fica branco com texto escuro.

### Fields and sliders

Campos de texto, número e seleção têm superfície cinza, borda média e canto de 5 px. Sliders de volume e tempo usam trilha fina ciana sobre cinza, com indicador circular. O slider de posição tem indicador menor e tempos em números tabulares.

### Wave tracks

Cada linha mostra M, S, nome, volume e panorama na coluna esquerda. A onda à direita tem fundo azul/ciano, barras calculadas do áudio carregado, cursor branco, estado atenuado para canais silenciados e região de loop translúcida. O original fica oculto após separação e pode ser revelado no menu. O metrônomo ocupa uma linha de controle própria, sem onda fictícia.

### Popovers

Painéis escuros abrem sobre o Studio para BPM/velocidade, tom/afinação, pré-contagem, exportação, opções, volume geral e loop. Exportação agrupa formato, canais, ZIP de todos os canais e mix. MP3 e M4A dependem da disponibilidade do conversor local; WAV é a opção inicial.

### Reading and sections

O painel de leitura oferece letra LRC e acordes cronometrados importados ou editados; verso e acorde ativos acompanham a posição. Acordes reconhecidos ganham transposição e diagrama local de violão. Seções formam uma lista de marcadores à direita. A implementação não inclui transcrição ou identificação automática de acordes.

## Do's and Don'ts

### Do:

- **Do** manter régua, cursor e ondas alinhados entre todos os canais.
- **Do** usar a paleta das ondas para canais carregados e preservar a distinção ciano de M e âmbar de S.
- **Do** mostrar estados de foco visível e remover da navegação por teclado os painéis cobertos no celular.

### Don't:

- **Don't** representar como automático o texto ou os acordes que exigem importação/edição local.
- **Don't** apresentar canais, ondas ou divisões que não existam nos arquivos do projeto.
- **Don't** tratar a inspeção básica do render local como confirmação de fidelidade pixel a pixel; a revisão independente de código aprovou os quatro ajustes de usabilidade/exportação, e os testes de controles e formatos não substituem uma audição e inspeção visual detalhada.
