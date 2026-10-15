# Josué App

Aplicativo desktop **open source** para Windows. Organize músicas em uma biblioteca local, reproduza e mixe faixas no Studio e, com o motor opcional instalado, separe vocais e instrumentos no próprio computador. Não é necessário criar uma conta.

O projeto é independente e não é afiliado ao Moises. A separação usa [Demucs 4](https://github.com/facebookresearch/demucs). Transcrição automática de letras, reconhecimento automático de acordes e modelos proprietários de outros serviços não estão incluídos.

## Recursos

- Biblioteca de músicas importadas do computador.
- Studio com formas de onda, volume, panorama, mute, solo, velocidade, tom, metrônomo e repetição de trechos.
- Separação opcional em 4 canais (vocais, bateria, baixo e outros) ou 6 canais (acrescenta guitarra e piano; modelo experimental).
- Letras, acordes com marcação de tempo, seções e setlists adicionados manualmente.
- Exportação de canais e da mixagem em WAV. MP3 e M4A ficam disponíveis com o motor local e FFmpeg instalados.

## Instalar o aplicativo pronto

1. Baixe `JosueApp-windows-x64.zip` na seção **Releases** do repositório, quando houver uma versão publicada. Se estiver trabalhando com uma cópia do projeto já compilada, use `dist/JosueApp-windows-x64.zip`.
2. Extraia o ZIP inteiro para uma pasta de sua escolha. Mantenha os arquivos e a pasta `resources` juntos.
3. Abra `JosueApp-win32-x64\Josue App.exe`. O aplicativo é portátil: não há instalador nem é necessário instalar Node.js para executar o player, a biblioteca e a exportação WAV.

**Requisitos:** Windows 10 ou 11 de 64 bits e espaço para os arquivos de música. O executável não tem assinatura digital; o Windows pode pedir confirmação ao abrir um build local.

O aplicativo usa `127.0.0.1:4174` somente para comunicar sua janela com o serviço local. Se essa porta estiver ocupada, feche o processo que a utiliza e abra o aplicativo novamente. A interface permanece dentro da janela do aplicativo.

### Instalar o motor de separação (opcional)

1. Conecte-se à internet e reserve alguns GB livres para Python, PyTorch, FFmpeg e os modelos.
2. Abra o PowerShell na pasta extraída, onde estão `Josue App.exe` e `Instalar motor.ps1`.
3. Execute:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File '.\Instalar motor.ps1'
   ```

4. Aguarde a instalação terminar e feche e abra o aplicativo novamente.

O motor é instalado em `%LOCALAPPDATA%\JosueApp\engine`. A separação de uma música em CPU pode demorar mais que a duração do áudio. O modelo de 6 canais é experimental e pode misturar partes de instrumentos. O limite por arquivo enviado para separação é de **250 MB** e **20 minutos**.

## Compilar a partir do código

No Windows 10/11 de 64 bits, instale [Node.js 22 ou superior](https://nodejs.org/en/download) e Git. Depois, abra o PowerShell e execute:

```powershell
git clone https://github.com/micaelrauan/Josue-app.git
cd Josue-app
npm run build:desktop
```

Também é possível baixar o código pelo botão **Code → Download ZIP** no GitHub, extrair e executar `npm run build:desktop` dentro da pasta. Não há dependências npm de produção para instalar antes do build.

O script obtém o pacote oficial do Electron quando necessário, confere seu SHA-256 e gera:

| Arquivo | Uso |
| --- | --- |
| `dist/JosueApp-win32-x64/Josue App.exe` | Executável portátil com ícone próprio. |
| `dist/JosueApp-windows-x64.zip` | Pacote completo para distribuir ou copiar para outro computador. |

Para modificar o ícone, edite `tools/make-icon.py`, execute `python tools/make-icon.py` e compile novamente. O Python só é necessário para gerar o ícone ou instalar o motor, não para compilar o executável padrão.

## Usar o Studio

1. Abra **Play** ou **Studio** e importe um arquivo de áudio.
2. Clique na música para abrir o Studio e aguarde as formas de onda carregarem.
3. Ajuste os canais. Se instalou o motor, use **Mais opções → Separar instrumentos** e escolha 4 ou 6 canais.
4. Registre letra, acordes e seções. Letras no formato LRC aceitam marcas como `[00:12.00] Texto da linha`.
5. Use **Exportar** para salvar os canais ou a mixagem. WAV funciona sem o motor.

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
| O motor não está disponível | Execute `Instalar motor.ps1` na pasta do aplicativo, aguarde o fim e reinicie o aplicativo. Confira a internet e o espaço livre. |
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
