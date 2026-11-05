# Mac masaüstü uygulaması

Admin panelini ayrı bir pencerede açar (tarayıcı sekmesi değil).

## Kurulum (bir kez)

```bash
cd desktop
npm install
```

## Çalıştır

```bash
npm start
```

Proje klasöründen `start-app.command` dosyasına çift tıklayarak veya `npm run app` komutuyla da açabilirsiniz.

Varsayılan adres: `https://crm.salediscount.online/admin`

Yerel geliştirme:

```bash
CRM_DEV=1 CRM_ADMIN_URL=http://localhost:8787/admin npm start
```

## .dmg oluştur

```bash
npm run dist
```

Çıktı:

- **`dist/CRM Item Satis-1.0.0-arm64.dmg`** — kurulum (Apple Silicon M1/M2/M3)
- `dist/CRM Item Satis-1.0.0-arm64-mac.zip` — zip alternatif

İlk açılışta macOS “tanınmıyor” derse: `.app` veya `.dmg` üzerinde **Sağ tık → Aç** (imzasız build).

Intel Mac için ayrı build gerekir (`arch: x64` — istenirse eklenir).
