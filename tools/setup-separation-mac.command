#!/usr/bin/env bash
set -euo pipefail

data="$HOME/Library/Application Support/JosueApp/engine"
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Instale Python 3.11 ou 3.12 e execute este arquivo novamente.'
  read -r -p 'Pressione Enter para fechar...'
  exit 1
fi
python3 -c 'import sys; assert (3, 11) <= sys.version_info[:2] <= (3, 12), "Use Python 3.11 ou 3.12"'
mkdir -p "$data"
python3 -m venv "$data/.venv"
"$data/.venv/bin/python3" -m pip install --upgrade pip
"$data/.venv/bin/python3" -m pip install torch torchaudio demucs yt-dlp imageio-ffmpeg
"$data/.venv/bin/python3" -c 'import demucs, torch, yt_dlp, imageio_ffmpeg; print("Motor instalado com sucesso.")'
echo 'Reinicie o Josue App para usar separação e importação por link.'
read -r -p 'Pressione Enter para fechar...'
