# Josué App

Aplicativo web **open source** para organizar músicas, reproduzir e mixar faixas e separar vocais e instrumentos no próprio computador. O servidor escuta apenas em `127.0.0.1`; não é necessário criar conta.

O projeto é independente e não é afiliado ao Moises. A separação usa o [Demucs 4](https://github.com/facebookresearch/demucs), com modelos baixados durante a instalação. Transcrição automática de letra, identificação automática de acordes e os modelos proprietários de outros serviços não fazem parte deste aplicativo.

## O que o aplicativo faz

- Importa arquivos de áudio para uma biblioteca local no navegador.
- Reproduz faixas em um Studio com formas de onda, volume, panorama, mute, solo, velocidade, tom, metrônomo e repetição de trechos.
- Separa a música em 4 canais (vocais, bateria, baixo e outros) ou 6 canais (inclui guitarra e piano, modelo experimental).
- Permite adicionar faixas, letras, acordes com marcação de tempo, seções e setlists manualmente.
- Exporta canais e mixagem em WAV. MP3 e M4A ficam disponíveis quando o motor local e o FFmpeg estiverem instalados.

## Requisitos

| Item | Necessário para |
| --- | --- |
| Windows 10/11, 64 bits | Instalação automatizada do motor de separação; os scripts atuais usam caminhos do Windows. |
| [Node.js 22 ou superior](https://nodejs.org/en/download) e npm | Servidor local e testes. |
| Navegador moderno com Web Audio e IndexedDB | Interface, reprodução e armazenamento da biblioteca. |
| Internet durante a instalação do motor | Baixar Python, pacotes e modelos, quando ainda não estiverem no computador. |
| Alguns GB livres em disco | Python, PyTorch, modelos e faixas geradas. |

Para usar apenas a biblioteca, o player e a exportação WAV, basta instalar Node.js. O motor de separação é opcional.

## Instalação no Windows

1. Instale o Node.js e confirme no PowerShell:

   ```powershell
   node --version
   npm --version
   ```

2. Clone o repositório e entre na pasta:

   ```powershell
   git clone https://github.com/micaelrauan/Josue-app.git
   cd Josue-app
   ```

   Se não tiver Git, baixe o ZIP pelo botão **Code → Download ZIP** no GitHub, extraia e abra o PowerShell na pasta extraída.

3. Inicie o servidor:

   ```powershell
   npm run dev
   ```

4. Abra **http://127.0.0.1:4174** no navegador. Mantenha o terminal aberto enquanto usa o aplicativo. Para encerrar, pressione `Ctrl+C`.

Este projeto não tem dependências npm de produção; por isso, `npm install` não é necessário para iniciar a interface. A primeira importação deve ser feita pelo botão de upload da biblioteca.

### Instalar a separação por instrumentos

No PowerShell, dentro da pasta do projeto, execute:

```powershell
npm run setup:separation
```

O script procura Python 3.11. Se não encontrar, baixa o instalador oficial para `.runtime/` e valida sua assinatura antes de executá-lo. Em seguida cria `.venv/`, instala PyTorch para CPU, Demucs, FFmpeg via `imageio-ffmpeg` e baixa os modelos para `.models/`. Isso pode levar vários minutos e baixar alguns GB. Feche o servidor com `Ctrl+C` e inicie `npm run dev` novamente após a instalação.

O modelo de 4 canais é o padrão. O de 6 canais é experimental e pode apresentar vazamento entre instrumentos. Em CPU, o processamento pode demorar mais que a duração da música. Cada arquivo enviado para separação tem limite de **250 MB** e **20 minutos**.

### Testar a instalação

```powershell
npm test
```

Os testes automatizados cobrem as APIs locais, reprodução e mixagem, formas de onda e exportação com processos simulados. Eles não executam a inferência real do Demucs. Para verificar o motor, importe uma música, abra o Studio, use **Mais opções → Separar instrumentos** e acompanhe o andamento.

## Como usar

1. Abra **Play** ou **Studio** e importe um arquivo de áudio. A aceitação do formato depende dos codecs suportados pelo navegador; o motor local usa FFmpeg para a separação.
2. Clique na música para abrir o Studio. Aguarde as formas de onda terminarem de carregar.
3. Ajuste os canais e o transporte. No menu **Mais opções**, escolha **Separar instrumentos** e selecione 4 ou 6 faixas, se instalou o motor.
4. Use **Letra**, **Acordes** e **Seções** para registrar informações manualmente. Letras no formato LRC usam marcas como `[00:12.00] Texto da linha`.
5. Use **Exportar** para baixar canais ou a mixagem. WAV funciona sem o motor; MP3 e M4A exigem FFmpeg instalado pelo script acima.

## Onde os dados ficam

- Os projetos importados, os arquivos de áudio e os ajustes do Studio ficam no **IndexedDB do navegador**. Setlists ficam no armazenamento local do mesmo navegador.
- Os arquivos temporários e resultados da separação ficam em `.data/` no computador. Os resultados também são copiados para o projeto no navegador quando o processamento termina.
- `.venv/`, `.runtime/`, `.models/` e `.data/` são ignorados pelo Git e **não** são enviados ao GitHub.
- A biblioteca está vinculada ao endereço exato usado na importação. `127.0.0.1:4174`, `localhost:4174` e portas diferentes têm armazenamentos separados. Use sempre o mesmo navegador, host e porta. Limpar os dados do site no navegador também remove os projetos salvos nele.
- O servidor escuta apenas em `127.0.0.1` e não oferece autenticação ou hospedagem pública. GitHub Pages sozinho não executa o servidor Node nem a separação.

Se quiser usar outra porta, defina `PORT` antes de iniciar. Por exemplo, no PowerShell:

```powershell
$env:PORT = '4180'
npm run dev
```

Use a mesma porta nas próximas sessões para ver a mesma biblioteca. Se a porta estiver ocupada, o servidor informa o erro em vez de mudar de porta automaticamente.

## Solução de problemas

| Sintoma | O que verificar |
| --- | --- |
| A biblioteca está vazia | Confirme o mesmo navegador, host e porta usados na importação. Confira também se os dados do site não foram apagados. |
| A porta 4174 já está em uso | Abra a instância existente em `http://127.0.0.1:4174` ou encerre o processo anterior antes de reiniciar. |
| O áudio não carrega no Studio | Experimente WAV ou MP3 compatível com o navegador. Arquivos corrompidos ou codecs não suportados aparecem como erro na faixa. |
| O motor não está disponível | Execute `npm run setup:separation`, aguarde o fim e reinicie o servidor. Confira espaço livre e conexão durante o download. |
| MP3/M4A indisponíveis | Instale o motor local para obter FFmpeg e reinicie o servidor. WAV continua disponível. |
| A separação falhou | Verifique o arquivo, o limite de 250 MB/20 minutos e os detalhes em `.data/separations/<id>/error.log`. |

## Estrutura do projeto

| Caminho | Finalidade |
| --- | --- |
| `server.js` | Servidor HTTP local e arquivos da interface. |
| `public/` | Interface, biblioteca, Studio e áudio no navegador. |
| `separation.js` e `tools/separate_audio.py` | API local e execução do Demucs. |
| `audio-export.js` | Conversão opcional para MP3/M4A. |
| `tools/setup-separation.ps1` | Instalação do motor no Windows. |
| `test/` | Testes automatizados executados por `npm test`. |

## Contribuir

Issues e pull requests são bem-vindos. Para desenvolver, crie uma branch, faça as alterações e execute `npm test` antes de enviar o pull request. Não inclua músicas pessoais, modelos baixados, ambientes virtuais ou arquivos de `.data/` nos commits.

## Licença

O código deste repositório é distribuído sob a [licença MIT](LICENSE). Demucs, PyTorch, FFmpeg e outros componentes baixados na instalação mantêm suas próprias licenças; consulte os projetos correspondentes antes de redistribuir seus binários ou modelos.

