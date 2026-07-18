# hakanatas.dev — Kişisel Site

[dilum.dev](https://dilum.dev/) tarzında, minimal ve tipografi odaklı kişisel bir site.
Hiçbir build aracı gerektirmez — saf HTML, CSS ve JavaScript.

## Özellikler

- 🌙 Koyu/açık tema (sistem tercihini algılar, seçim hatırlanır)
- ✨ İmleci takip eden ışıltı efekti ve nokta-ızgara arka plan
- 📜 Kaydırdıkça beliren bölümler (scroll reveal)
- 📱 Tamamen responsive tasarım
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
