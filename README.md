# Josué App

Aplicativo desktop **open source** para Windows. Organize músicas em uma biblioteca local, reproduza e mixe faixas no Studio e separe vocais e instrumentos no próprio computador. Não é necessário criar uma conta.

O projeto é independente e não é afiliado ao Moises. A separação usa [Demucs 4](https://github.com/facebookresearch/demucs). Transcrição automática de letras, reconhecimento automático de acordes e modelos proprietários de outros serviços não estão incluídos.

## Recursos

- Biblioteca de músicas importadas do computador ou por link de vídeo do YouTube.
- Studio com formas de onda, volume, panorama, mute, solo, velocidade, tom, metrônomo com estimativa automática de BPM e repetição de trechos.
- Ao importar uma música, o aplicativo pergunta se você deseja separar os instrumentos. A separação opcional cria 4 canais (vocais, bateria, baixo e outros) ou 6 canais (acrescenta guitarra e piano; modelo experimental).
- Letras, acordes com marcação de tempo, seções e setlists adicionados manualmente.
- Exportação de canais e da mixagem em WAV. MP3 e M4A ficam disponíveis com o motor local e FFmpeg instalados.

## Instalar o aplicativo pronto

1. Baixe `JosueApp-Setup.exe` na seção **Releases** do repositório, quando houver uma versão publicada. Num build local, use `dist/JosueApp-Setup.exe`.
2. Abra o instalador e clique em **Instalar**. Ele copia o aplicativo para `%LOCALAPPDATA%\Programs\Josue App`, cria um atalho no menu Iniciar e, se solicitado, na área de trabalho. Depois baixa e prepara automaticamente Python, PyTorch, Demucs, FFmpeg, yt-dlp e os modelos de separação. Em atualizações, reaproveita o motor quando as dependências existentes passam na verificação.
3. Aguarde a mensagem **Instalação concluída** e clique em **Abrir app**. A etapa do motor exige internet, alguns GB livres e pode demorar vários minutos. Se falhar, clique em **Tentar de novo**; o diagnóstico fica em `%LOCALAPPDATA%\JosueApp\install.log`.

Para remover o aplicativo, use **Desinstalar Josué App** nas configurações do Windows. Os projetos e o motor em `%LOCALAPPDATA%\JosueApp` são preservados para uma futura instalação.

A partir da versão 0.2.0, o aplicativo instalado verifica se há uma versão mais nova nas **GitHub Releases** do projeto. Quando uma atualização estiver disponível, ele oferece a opção de baixar e aplicar o instalador, preservando os projetos. A primeira instalação da versão 0.2.0 precisa ser feita manualmente; versões anteriores ainda não têm o verificador. Para publicar uma atualização, aumente `version` em `package.json` e `Version` em `tools/installer.cs`, gere `JosueApp-Setup.exe` e publique uma Release estável com tag `vX.Y.Z` e esse arquivo como anexo. O atualizador exige o digest SHA-256 fornecido pelo GitHub para o anexo. Sem Release publicada, ele apenas mantém a versão atual.

**Requisitos:** Windows 10 ou 11 de 64 bits e espaço para os arquivos de música. O executável não tem assinatura digital; o Windows pode pedir confirmação ao abrir um build local.

O aplicativo usa `127.0.0.1:4174` somente para comunicar sua janela com o serviço local. Se essa porta estiver ocupada, feche o processo que a utiliza e abra o aplicativo novamente. A interface permanece dentro da janela do aplicativo.

### Pacote portátil (alternativo)

O arquivo `JosueApp-windows-x64.zip` continua disponível para uso sem instalação. Extraia o ZIP inteiro e abra `JosueApp-win32-x64\Josue App.exe`. Nesse modo, o motor pode ser instalado manualmente na pasta extraída com:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File '.\Instalar motor.ps1'
```

O motor é instalado em `%LOCALAPPDATA%\JosueApp\engine`. A separação de uma música em CPU pode demorar mais que a duração do áudio. O modelo de 6 canais é experimental e pode misturar partes de instrumentos. O limite por arquivo enviado para separação é de **250 MB** e **20 minutos**.

## Compilar a partir do código

No Windows 10/11 de 64 bits, instale [Node.js 22 ou superior](https://nodejs.org/en/download) e Git. Depois, abra o PowerShell e execute:

```powershell
git clone https://github.com/micaelrauan/Josue-app.git
cd Josue-app
npm run build:installer
```

Também é possível baixar o código pelo botão **Code → Download ZIP** no GitHub, extrair e executar `npm run build:installer` dentro da pasta. Para gerar apenas o pacote portátil, use `npm run build:desktop`. Não há dependências npm de produção para instalar antes do build.

O script obtém o pacote oficial do Electron quando necessário, confere seu SHA-256 e gera:

| Arquivo | Uso |
| --- | --- |
| `dist/JosueApp-Setup.exe` | Instalador completo do app; baixa o motor durante a instalação. |
| `dist/JosueApp-windows-x64.zip` | Pacote portátil para uso manual. |
| `dist/JosueApp-win32-x64/Josue App.exe` | Executável portátil, gerado por `build:desktop`. |

Para modificar o ícone, edite `tools/make-icon.py`, execute `python tools/make-icon.py` e compile novamente. O Python só é necessário para gerar o ícone ou instalar o motor, não para compilar o executável padrão.

### Desenvolver sem reinstalar

No PowerShell, dentro do projeto, execute `npm run dev:desktop`. O comando reutiliza o Electron baixado em `.desktop-cache` e abre o código diretamente, sem gerar ZIP nem instalador. Alterações em `public/` recarregam a janela; alterações em `server.js`, nos serviços, em `desktop/main.cjs` ou em `package.json` reiniciam o aplicativo. Feche a janela ou pressione `Ctrl+C` para encerrar.

O modo de desenvolvimento usa a porta `4175`, guarda dados de teste em `.data/dev` e perfil em `.desktop-cache/dev-profile`. Ele reutiliza o motor já instalado em `%LOCALAPPDATA%\JosueApp\engine`; se o motor ainda não estiver instalado, a interface abre, mas a separação e a importação do YouTube exigem instalá-lo uma vez. O script prepara a permissão de leitura do cache do Electron para o sandbox do Windows. Execute o comando em um PowerShell normal da sua conta caso o ambiente de desenvolvimento bloqueie essa permissão.

Após gerar o instalador, `npm run clean:cache` remove as cópias temporárias da compilação e dos testes de extração. O instalador em `dist/` e o ZIP do Electron usado em compilações futuras são preservados.

## Usar o Studio

1. Abra **Play** ou **Studio** e importe um arquivo de áudio ou cole um link de vídeo do YouTube na tela **Adicionar música**. Links aceitam vídeos de até 20 minutos e 250 MB. Use conteúdo que você tem permissão para baixar.
2. Após importar, escolha **Separar instrumentos** ou **Agora não**. Se escolher separar, selecione 4 ou 6 faixas; o processamento acontece em sequência quando você adiciona várias músicas.
3. Clique na música para abrir o Studio e aguarde as formas de onda carregarem.
4. Ajuste os canais. Você também pode iniciar ou refazer a separação no Studio.
5. Registre letra, acordes e seções. Letras no formato LRC aceitam marcas como `[00:12.00] Texto da linha`.
6. Use **Exportar** para salvar os canais ou a mixagem. WAV funciona sem o motor.

A reprodução depende dos formatos de áudio compatíveis com o Chromium incluído no aplicativo. O motor usa FFmpeg durante a separação.

## Arquivos e privacidade

A biblioteca, os ajustes e os projetos ficam no perfil local do aplicativo em `%LOCALAPPDATA%\JosueApp`. Os arquivos temporários e resultados da separação ficam em `%LOCALAPPDATA%\JosueApp\data`; o motor opcional fica em `%LOCALAPPDATA%\JosueApp\engine`. Faça backup dessa pasta se precisar preservar seus projetos.

Os dados de instalações anteriores no navegador não são importados automaticamente para o desktop. Importe os arquivos de áudio originais no aplicativo. O aplicativo não exige conta e o serviço local escuta apenas em `127.0.0.1`.

## Resolver problemas

| Sintoma | O que fazer |
| --- | --- |
| O aplicativo avisa que a porta 4174 está ocupada | Feche outro processo que use essa porta e abra `Josue App.exe` novamente. |
| A biblioteca está vazia | Confira se está usando o mesmo perfil do Windows e se `%LOCALAPPDATA%\JosueApp` não foi apagado. Importe novamente os arquivos originais, se necessário. |
| O áudio não abre no Studio | Experimente um MP3 ou WAV válido e aguarde a importação terminar. |
| O link do YouTube não importa | Confira se é um vídeo público e disponível, dentro do limite de 20 minutos e 250 MB. Execute o instalador novamente para atualizar o importador local. |
| O motor não está disponível | Execute o instalador novamente e aguarde o fim, ou use `Instalar motor.ps1` no pacote portátil. Confira a internet, o espaço livre e `%LOCALAPPDATA%\JosueApp\install.log`. |
| MP3/M4A indisponíveis para exportar | Instale o motor para obter FFmpeg. WAV continua disponível. |
| A separação falhou | Confira o arquivo e os limites de 250 MB/20 minutos. Procure detalhes em `%LOCALAPPDATA%\JosueApp\data\separations\<id>\error.log`. |

## Desenvolver e contribuir

```powershell
npm test
```

Os testes cobrem o serviço local e partes do Studio, usando processos simulados para a separação. Eles não executam a inferência real do Demucs. Para contribuir, abra uma issue ou pull request e execute os testes antes de enviar alterações. Não inclua músicas pessoais, modelos baixados ou ambientes virtuais nos commits.

`desktop/` contém a janela e os ícones; `public/` contém a interface exibida **dentro** do aplicativo desktop; `server.js`, `separation.js` e `audio-export.js` atendem a essa interface localmente; `tools/` contém scripts de build e do motor; `test/` contém os testes. A pasta `public/` faz parte do executável e é necessária para ele funcionar.

## Licença

O código é distribuído sob a [licença MIT](LICENSE). Demucs, PyTorch, FFmpeg e outros componentes obtidos na instalação têm licenças próprias; consulte os respectivos projetos antes de redistribuir seus binários ou modelos.
