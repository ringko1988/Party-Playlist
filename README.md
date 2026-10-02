# Party-Playlist

Gäste scannen einen QR-Code und wünschen sich Songs – per YouTube-Link oder per Titel und Interpret.
Gästewünsche laufen in der Reihenfolge, in der sie eingehen; ist keiner offen, spielt die eigene
YouTube-Playlist zufällig weiter.

- **Wunschseite:** https://ringko1988.github.io/Party-Playlist/
- **Abspielseite:** https://ringko1988.github.io/Party-Playlist/player.html

## Aufbau

| Teil | Datei |
|---|---|
| Wunschseite | `index.html`, `js/wish.js` |
| Abspielseite | `player.html`, `js/player.js` |
| Logik (Links erkennen, Mischen, Reihenfolge) | `js/youtube.js`, `js/queue.js` |
| Verbindung zum Backend | `js/api.js`, `js/config.js` |
| Backend (Google Apps Script über einem Google Sheet) | `apps-script/Code.gs`, `apps-script/Logik.gs` |

## Entwicklung

```bash
npm test               # automatische Tests (Node 20.11+)
node tools/serve.js    # lokale Vorschau auf http://localhost:8080
```

Made by [ringko.tv](https://ringko.tv)
