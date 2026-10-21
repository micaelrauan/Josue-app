"""Local Demucs inference. Audio never leaves the computer."""
import json
import os
from pathlib import Path
import subprocess
import sys


def event(stage, message, progress):
    print(json.dumps(dict(stage=stage, message=message, progress=progress)), flush=True)


def dependencies():
    if sys.platform == 'darwin':
        import certifi
        os.environ.setdefault('SSL_CERT_FILE', certifi.where())
    import torch
    import soundfile
    import imageio_ffmpeg
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    from demucs.audio import convert_audio
    return torch, soundfile, imageio_ffmpeg, get_model, apply_model, convert_audio


def separate(source, output, model_name):
    torch, sf, ffmpeg, get_model, apply_model, convert_audio = dependencies()
    output = Path(output)
    event('loading', 'Carregando o modelo de IA. Na primeira execução, o modelo será baixado.', 2)
    model = get_model(model_name)
    model.eval()
    event('decoding', 'Preparando o áudio...', 7)
    decoded = output / 'decoded.wav'
    subprocess.run([ffmpeg.get_ffmpeg_exe(), '-nostdin', '-v', 'error', '-y', '-i', source, '-t', '1201',
                    '-ac', str(model.audio_channels), '-ar', str(model.samplerate), str(decoded)],
                   check=True, capture_output=True, creationflags=0x08000000 if os.name == 'nt' else 0)
    if sf.info(decoded).duration > 1200:
        decoded.unlink(missing_ok=True)
        raise ValueError('O limite de duração é 20 minutos por música.')
    data, sample_rate = sf.read(decoded, dtype='float32', always_2d=True)
    audio = torch.from_numpy(data.T.copy())
    audio = convert_audio(audio, sample_rate, model.samplerate, model.audio_channels)
    ref = audio.mean(0)
    mean, std = ref.mean(), ref.std().clamp_min(1e-8)
    normalized = (audio - mean) / std
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    event('processing', 'Separando vocais e instrumentos. Isso pode levar vários minutos.', 10)
    with torch.no_grad():
        sources = apply_model(model, normalized[None], device=device, shifts=1, split=True,
                              overlap=0.25, progress=True, num_workers=0, segment=7)[0]
    sources = sources.cpu() * std + mean
    event('saving', 'Salvando as faixas em WAV...', 96)
    # One common gain keeps the reconstructed mix balanced and avoids clipping.
    gain = max(1.0, float(sources.abs().max()) / 0.99)
    for name, audio in zip(model.sources, sources):
        sf.write(str(output / f'{name}.wav'), (audio / gain).T.numpy(), model.samplerate, subtype='PCM_16')
    decoded.unlink(missing_ok=True)
    event('completed', 'Separação concluída.', 100)


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['--check']:
            dependencies()
        elif sys.argv[1:] == ['--download-models']:
            _, _, _, get_model, _, _ = dependencies()
            for model_name in ('htdemucs', 'htdemucs_6s'):
                get_model(model_name)
        else:
            separate(*sys.argv[1:])
    except Exception as error:
        event('error', f'Não foi possível separar o áudio: {error}', 0)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
