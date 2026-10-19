#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo 'Este build precisa ser executado no macOS.' >&2
  exit 1
fi

arch="${1:-$(uname -m)}"
case "$arch" in
  arm64) electron_arch=arm64 ;;
  x86_64|x64) electron_arch=x64 ;;
  *) echo "Arquitetura não suportada: $arch" >&2; exit 1 ;;
esac

root="$(cd "$(dirname "$0")/.." && pwd)"
app_version="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version' "$root/package.json")"
version=43.8.0
archive="electron-v${version}-darwin-${electron_arch}.zip"
cache="$root/.desktop-cache"
dist="$root/dist"
work="$cache/mac-${electron_arch}"
mkdir -p "$cache" "$dist"

if [[ ! -f "$cache/$archive" ]]; then
  curl --fail --location --retry 3 --output "$cache/$archive" \
    "https://github.com/electron/electron/releases/download/v${version}/${archive}"
fi
curl --fail --location --retry 3 --output "$cache/SHASUMS256-${version}.txt" \
  "https://github.com/electron/electron/releases/download/v${version}/SHASUMS256.txt"
expected="$(awk -v file="$archive" '$2 == file || $2 == "*" file {print $1}' "$cache/SHASUMS256-${version}.txt")"
[[ -n "$expected" ]] || { echo 'Hash do Electron ausente.' >&2; exit 1; }
actual="$(shasum -a 256 "$cache/$archive" | awk '{print $1}')"
[[ "$actual" == "$expected" ]] || { echo 'SHA-256 do Electron não confere.' >&2; exit 1; }

rm -rf "$work"
mkdir -p "$work"
ditto -x -k "$cache/$archive" "$work"
mv "$work/Electron.app" "$work/Josue App.app"
app="$work/Josue App.app"
payload="$app/Contents/Resources/app"
mkdir -p "$payload/desktop" "$payload/tools"
cp "$root"/{package.json,server.js,separation.js,audio-export.js,youtube-import.js,LICENSE} "$payload/"
ditto "$root/public" "$payload/public"
cp "$root/desktop"/{main.cjs,updates.cjs,icon.png} "$payload/desktop/"
cp "$root/tools/separate_audio.py" "$payload/tools/"
rm -f "$app/Contents/Resources/default_app.asar"

plist="$app/Contents/Info.plist"
set_plist() {
  local target="$1" key="$2" value="$3"
  if /usr/libexec/PlistBuddy -c "Print :$key" "$target" >/dev/null 2>&1; then
    /usr/libexec/PlistBuddy -c "Set :$key $value" "$target"
  else
    /usr/libexec/PlistBuddy -c "Add :$key string $value" "$target"
  fi
}
set_plist "$plist" CFBundleName 'Josue App'
set_plist "$plist" CFBundleDisplayName 'Josue App'
set_plist "$plist" CFBundleIdentifier com.micaelrauan.josueapp
set_plist "$plist" CFBundleShortVersionString "$app_version"
set_plist "$plist" CFBundleVersion "$app_version"
set_plist "$plist" LSMinimumSystemVersion 12.0
for helper_plist in "$app"/Contents/Frameworks/*Helper*.app/Contents/Info.plist; do
  [[ -f "$helper_plist" ]] || continue
  set_plist "$helper_plist" CFBundleName 'Josue App Helper'
  set_plist "$helper_plist" CFBundleDisplayName 'Josue App Helper'
  set_plist "$helper_plist" LSMinimumSystemVersion 12.0
done
iconset="$work/Josue.iconset"
mkdir -p "$iconset"
for size in 16 32 64 128 256 512 1024; do
  sips -s format png -z "$size" "$size" "$root/desktop/icon.png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
done
cp "$iconset/icon_32x32.png" "$iconset/icon_16x16@2x.png"
mv "$iconset/icon_64x64.png" "$iconset/icon_32x32@2x.png"
cp "$iconset/icon_256x256.png" "$iconset/icon_128x128@2x.png"
cp "$iconset/icon_512x512.png" "$iconset/icon_256x256@2x.png"
mv "$iconset/icon_1024x1024.png" "$iconset/icon_512x512@2x.png"
iconutil -c icns "$iconset" -o "$app/Contents/Resources/Josue.icns"
set_plist "$plist" CFBundleIconFile Josue.icns
codesign --force --deep --sign - "$app"

stage="$work/installer"
mkdir -p "$stage"
ditto "$app" "$stage/Josue App.app"
ln -s /Applications "$stage/Applications"
cp "$root/tools/setup-separation-mac.command" "$stage/Instalar motor.command"
chmod +x "$stage/Instalar motor.command"
output="$dist/JosueApp-mac-${electron_arch}.dmg"
rm -f "$output"
hdiutil create -quiet -volname 'Josue App' -srcfolder "$stage" -format UDZO -ov "$output"
echo "Instalador pronto: $output"
