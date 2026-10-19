# Josué App

Aplicativo local para organizar setlists, importar músicas e trabalhar com áudio no Studio. Não exige conta. Seus projetos ficam no próprio computador.

## Baixar

[![Baixar para Windows](https://img.shields.io/badge/Baixar-Windows-1687B9?style=for-the-badge&logo=windows)](https://github.com/micaelrauan/Josue-app/releases/latest/download/JosueApp-Setup.exe)
[![Baixar para Mac](https://img.shields.io/badge/Baixar-Mac-333333?style=for-the-badge&logo=apple)](https://github.com/micaelrauan/Josue-app/releases/latest/download/JosueApp-mac-arm64.dmg)

O app para Mac requer macOS 12 (Monterey) ou mais recente. O botão Mac baixa a versão para Apple Silicon (M1 ou mais recente). Para Mac Intel, [baixe o instalador Intel](https://github.com/micaelrauan/Josue-app/releases/latest/download/JosueApp-mac-x64.dmg). Abra o DMG e arraste **Josue App** para **Applications**. O app para macOS usa assinatura local; na primeira abertura, pode ser necessário clicar com o botão direito no aplicativo e escolher **Abrir**. Os arquivos aparecem na Release depois que o build de Windows e os dois builds de Mac terminam.

No Windows, execute **JosueApp-Setup.exe**. Ele instala o aplicativo e prepara o motor de áudio. O pacote portátil **JosueApp-windows-x64.zip** também fica disponível na Release.

## O que você pode fazer

- **Setlists:** crie listas e adicione músicas pelo Studio.
- **Studio:** reproduza, ajuste faixas, velocidade e tom, marque letras e acordes, e exporte áudio.
- **Adicionar música:** importe arquivos locais ou um link do YouTube.
- **Separação opcional:** use Demucs para separar vocais e instrumentos em 4 ou 6 faixas. O modelo de 6 faixas é experimental.

No macOS, o Studio e a importação de arquivos locais funcionam após instalar o app. Para separação, importação por link e exportação MP3/M4A, instale Python 3.11 ou 3.12 e execute **Instalar motor.command** incluído no DMG. Essa etapa baixa PyTorch, Demucs, yt-dlp e FFmpeg, requer internet e alguns GB livres. Reinicie o app ao terminar. Exportação WAV funciona sem o motor.

Use somente conteúdo que você tem permissão para baixar. A importação por link e a separação aceitam arquivos de até 250 MB e 20 minutos. Separar áudio em CPU pode levar vários minutos.

## Estrutura do projeto

| Caminho | Finalidade |
| --- | --- |
| `public/` | Interface: navegação, setlists, importação e Studio. |
| `desktop/` | Janela Electron e atualizações do Windows. |
| `server.js`, `separation.js`, `youtube-import.js`, `audio-export.js` | Serviço local e processamento de áudio. |
| `tools/` | Build de Windows e Mac, instaladores e motor. |
| `test/` | Testes do serviço e do Studio. |
| `.github/workflows/` | Publicação dos instaladores. |

O aplicativo escuta somente em `127.0.0.1`. No Windows os dados ficam em `%LOCALAPPDATA%\JosueApp`; no macOS, em `~/Library/Application Support/JosueApp`. Faça backup dessa pasta para preservar seus projetos. O motor e os modelos baixados ficam fora do repositório.

## Desenvolver

Requer [Node.js 22+](https://nodejs.org/en/download). Clone o repositório e execute `npm test` antes de enviar alterações.

| Comando | Ambiente | Resultado |
| --- | --- | --- |
| `npm run dev:desktop` | Windows | Abre o app com recarga automática. |
| `npm run build:installer` | Windows | Gera `dist/JosueApp-Setup.exe`. |
| `npm run build:mac` | macOS | Gera um DMG para a arquitetura atual. |
| `bash tools/build-mac.sh x64` | macOS | Gera o DMG para Mac Intel. |
| `bash tools/build-mac.sh arm64` | macOS | Gera o DMG para Apple Silicon. |

O build baixa o Electron oficial e confere SHA-256. A publicação ocorre pelo workflow em `main` quando a versão estável aumenta em `package.json` e `tools/installer.cs`. Não inclua `dist/`, `.desktop-cache/`, ambientes Python, modelos, músicas ou segredos em commits.

## Licença

Código sob [MIT](LICENSE). O projeto é independente e não é afiliado ao Moises. Demucs, PyTorch, FFmpeg e os demais componentes baixados têm licenças próprias.
