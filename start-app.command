#!/usr/bin/env bash

ROOT="$(cd "$(dirname "$0")" && pwd)"

pause_before_exit() {
  if [[ -t 0 ]]; then
    read -r -p "Kapatmak için Enter'a basın..."
  fi
}

if ! command -v npm >/dev/null 2>&1; then
  echo "Hata: npm bulunamadı. Önce Node.js kurun."
  pause_before_exit
  exit 1
fi

if [[ ! -x "$ROOT/desktop/node_modules/.bin/electron" ]]; then
  echo "Electron bağımlılıkları kuruluyor..."
  if ! npm --prefix "$ROOT/desktop" ci; then
    echo "Hata: Electron bağımlılıkları kurulamadı."
    pause_before_exit
    exit 1
  fi
fi

echo "CRM Item Satış masaüstü uygulaması başlatılıyor..."
npm --prefix "$ROOT/desktop" start
status=$?

if [[ $status -ne 0 ]]; then
  echo "Uygulama hata koduyla kapandı: $status"
  pause_before_exit
fi

exit "$status"
