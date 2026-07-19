# hakanatas.dev — Kişisel Site

[dilum.dev](https://dilum.dev/) ruhunda, interaktif bir "yolculuk" arka planına sahip
kişisel site. Hiçbir build aracı gerektirmez — saf HTML, CSS ve JavaScript.

## Özellikler

- 🚴 **İnteraktif sahne**: Sayfayı kaydırdıkça arka plandaki manzarada pedal
  çevirerek ilerleyen bir bisikletli (`scene.js`, saf canvas — bağımlılık yok)
- 🌙 **Gece/gündüz geçişi**: Tema düğmesi tüm manzarayı dönüştürür — geceleri
  yıldızlar, hilal, sokak lambaları ve bisikletin far ışığı; gündüz güneş,
  bulutlar ve kuşlar
- 🪧 Her bölüme yaklaşırken yol kenarında beliren tabelalar (About, Experience…)
- 📏 Sol altta kat edilen mesafeyi gösteren kilometre sayacı
- 🏔️ Paralaks katmanlar: dağlar, tepeler, ağaçlar, çalılar
- 📜 Kaydırdıkça beliren cam görünümlü içerik panelleri
- 📱 Tamamen responsive; `prefers-reduced-motion` tercihine saygılı
- ⚡ Sıfır bağımlılık, tek sayfa

## İçeriği güncelleme

LinkedIn profiliniz giriş gerektirdiği için deneyim ve proje bölümleri örnek
içerikle dolduruldu. Kendi bilgilerinizle güncellemek için `index.html`
içindeki şu bölümleri düzenleyin:

| Bölüm | Nerede |
|---|---|
| İsim, unvan, tanıtım | `<!-- HERO -->` bölümü |
| Hakkımda metni ve yetenekler | `<!-- ABOUT -->` bölümü |
| İş deneyimleri | `<!-- EXPERIENCE -->` içindeki `timeline-item` blokları |
| Projeler | `<!-- PROJECTS -->` içindeki `project-card` blokları |
| Sosyal bağlantılar | Hero'daki `social-row` listesi |

Renkleri değiştirmek için `styles.css` başındaki `--accent` ve `--bg`
değişkenlerini düzenlemeniz yeterli.

## Yayınlama (GitHub Pages)

1. GitHub'da **Settings → Pages** sayfasına gidin
2. **Source**: "Deploy from a branch" seçin
3. **Branch**: `main` (veya bu branch) ve `/ (root)` seçip kaydedin
4. Siteniz birkaç dakika içinde `https://hakanatas.github.io/kisisel/` adresinde yayında olur

Özel alan adı (ör. `hakanatas.dev`) bağlamak için aynı sayfadaki
**Custom domain** alanını kullanabilirsiniz.

## Yerelde çalıştırma

```bash
# Herhangi bir statik sunucu yeterli, örneğin:
python3 -m http.server 8000
# → http://localhost:8000
```
