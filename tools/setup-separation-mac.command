#!/usr/bin/env bash
set -euo pipefail

data="$HOME/Library/Application Support/JosueApp/engine"
venv_python="$data/.venv/bin/python3"
python_package=''
python_directory=''

finish() {
  local result=$?
  if [[ -n "$python_package" ]]; then rm -f "$python_package" || true; fi
  if [[ -n "$python_directory" ]]; then rmdir "$python_directory" || true; fi
  if (( result != 0 )); then
    echo 'A instalação do motor não foi concluída. Veja o erro acima e execute este comando novamente.' >&2
  fi
  if [[ -t 0 ]]; then read -r -p 'Pressione Enter para fechar...' _ || true; fi
}
trap finish EXIT

compatible_python() {
  local candidate="$1"
  if [[ "$candidate" != /* ]]; then
    candidate="$(command -v "$candidate" 2>/dev/null)" || return 1
  fi
  [[ -x "$candidate" ]] || return 1
  "$candidate" -c 'import sys; raise SystemExit(sys.version_info[:2] not in ((3, 11), (3, 12)))' >/dev/null 2>&1 || return 1
  printf '%s\n' "$candidate"
}

find_python() {
  local candidate
  for candidate in \
    /Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 \
    /Library/Frameworks/Python.framework/Versions/3.11/bin/python3.11 \
    /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 \
    /usr/local/bin/python3.12 /usr/local/bin/python3.11 \
    python3.12 python3.11 python3; do
    compatible_python "$candidate" && return 0
  done
  return 1
}

if compatible_python "$venv_python" >/dev/null 2>&1; then
  echo 'Usando o ambiente Python do motor já instalado.'
else
  if ! base_python="$(find_python)"; then
    echo 'Python 3.11 ou 3.12 não encontrado. Baixando Python 3.12.10 do python.org...'
    python_directory="$(mktemp -d "${TMPDIR:-/tmp}/josue-python.XXXXXX")"
    python_package="$python_directory/python-3.12.10-macos11.pkg"
    curl --fail --location --retry 3 --output "$python_package" \
      'https://www.python.org/ftp/python/3.12.10/python-3.12.10-macos11.pkg'
    expected='8373e58da4ea146b3eb1c1f9834f19a319440b6b679b06050b1f9ee3237aa8e4'
    actual="$(shasum -a 256 "$python_package" | awk '{print $1}')"
    if [[ "$actual" != "$expected" ]]; then
      echo 'A verificação SHA-256 do instalador do Python falhou.' >&2
      exit 1
    fi
    echo 'Conclua a instalação do Python na janela que será aberta e feche o Instalador. Depois o motor continuará automaticamente.'
    open -W "$python_package"
    if ! base_python="$(find_python)"; then
      echo 'Python 3.12 não foi instalado. Conclua a instalação e execute este comando novamente.' >&2
      exit 1
    fi
  fi
  echo "Preparando o motor com $base_python..."
  mkdir -p "$data"
  "$base_python" -m venv --clear "$data/.venv"
fi

"$venv_python" -m pip install --upgrade pip
"$venv_python" -m pip install 'numpy<2' 'torch==2.2.2' 'torchaudio==2.2.2' \
  'demucs==4.0.1' soundfile certifi 'yt-dlp[default]' imageio-ffmpeg
"$venv_python" -c 'import demucs, torch, torchaudio, yt_dlp, imageio_ffmpeg; imageio_ffmpeg.get_ffmpeg_exe(); print("Motor instalado com sucesso.")'
echo 'Reinicie o Josué App para usar separação, importação por link e exportação MP3/M4A.'
