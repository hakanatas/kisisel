# hakanatas.dev — Sürülebilir 3D Portföy 🏎️

[bruno-simon.com](https://bruno-simon.com/) ruhunda interaktif bir portföy:
minyatür bir İstanbul'da oyuncak araba sürerek bölümleri keşfediyorsunuz.

**Hiçbir kütüphane yok** — Three.js yok, fizik motoru yok. WebGL2 render
motoru, araba fiziği ve dünya tamamen bu repoda, saf JavaScript ile yazıldı.

## Nasıl oynanır

| Girdi | Eylem |
|---|---|
| `W A S D` / ok tuşları | sür |
| `Space` | fren / drift |
| `R` | arabayı başa al |
| Mobil | ekrandaki joystick |

Renkli dairelere (About, Experience, Projects, Contact) arabayla girince
ilgili bölüm paneli açılır. "HAKAN ATAS" harflerine, lobutlara, konilere ve
kasalara çarpabilirsiniz — hepsi devrilir.

## Dünyada neler var

- 🗼 Low-poly **Galata Kulesi** (Projects meydanı)
- 🌉 Boğaz üzerinde **asma köprü** ve **Kız Kulesi**
- ⛴️ Kıyı boyunca süzülen **vapur**, iskele ve yük kasaları
- 🥨 Şemsiyeli **simit arabası**
- 🎳 Devrilebilir lobutlar, harf blokları, trafik konileri
- 🌳 Park, ağaçlar, sokak lambaları, çitler ve bulutlar

## Teknik yapı

```
js/
  math3d.js   — mat4/vec3 matematiği (column-major, WebGL uyumlu)
  engine.js   — WebGL2 renderer: tek shader, flat shading, sis, canvas dokular
  meshes.js   — geometri üreticileri (kutu, silindir, ağaç, lobut…)
  world.js    — dünya inşası: statik mesh (tek draw call), tabelalar,
                devrilebilir nesneler, çarpışma daireleri, bölgeler
  car.js      — araba modeli + arcade sürüş fiziği (grip, drift, direksiyon)
  main.js     — oyun döngüsü, girdi, kamera, çarpışmalar, panel/HUD
```

- Statik dünya tek bir birleştirilmiş vertex buffer → tek draw call
- Devrilebilir nesneler: basitleştirilmiş rigid-body (yerçekimi, sekme,
  dönme, sönümleme)
- Yazılar `<canvas>` ile üretilip doku olarak yükleniyor
- Gölgeler: nesne altı yumuşak "blob" diskleri
- WebGL yoksa zarif bir fallback kartı gösterilir

### Debug parametreleri

`?car=x,z,derece` arabayı ışınlar · `?cam=x,y,z,tx,ty,tz` serbest kamera ·
`?drive=sn` otomatik gaz · `?warp=sn` fiziği önceden simüle eder (test için)

## İçeriği güncelleme

Bölüm metinleri `index.html` içindeki `<template id="content-*">`
bloklarında. Deneyim ve projeleri kendi bilgilerinizle güncelleyin.
Dünyayı özelleştirmek için `js/world.js`'e bakın — her şey okunabilir
fonksiyonlarla kurulu.

## Yayınlama (GitHub Pages)

1. **Settings → Pages** → Source: "Deploy from a branch"
2. Branch: `main` + `/ (root)` → Save
3. Site `https://hakanatas.github.io/kisisel/` adresinde yayında

## Varlıklar ve lisanslar

`assets/` klasöründeki 3D modeller:

- **Galata Kulesi** — Hakan Ataş (bu proje için)
- **Araba** (`car.glb`) — [Kenney](https://kenney.nl) (CC0)
- **"Tree"** (`tree1.glb`) — [farhad.Guli](https://skfb.ly/U8nv), [CC-BY 4.0](http://creativecommons.org/licenses/by/4.0/)

## Yerelde çalıştırma

```bash
python3 -m http.server 8000   # ES modülleri için sunucu şart
# → http://localhost:8000
```
