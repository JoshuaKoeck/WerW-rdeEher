# Wer würde eher?

Ein schlichtes Live-Spiel für Gruppen: Teilnehmende wählen anonym, die Spielleitung startet Fragen und deckt Antworten auf.

## Start auf einer VM

Voraussetzung: Docker mit Docker Compose Plugin.

```bash
docker compose up --build -d
```

Öffne dann `http://DEINE-EXTERNE-IP:3000` für Mitspielende und `http://DEINE-EXTERNE-IP:3000/admin` für die Spielleitung.

Für den Betrieb wird eine PocketBase-Instanz benötigt. Setze `POCKETBASE_URL` (standardmäßig `http://pocketbase:8090`), `POCKETBASE_ADMIN_EMAIL` und `POCKETBASE_ADMIN_PASSWORD` in der App-Umgebung. Der Admin-Zugang wird nur serverseitig verwendet. Beim Start legt die App die geschützten Sammlungen `players` und `questions` an und übernimmt vorhandene Teilnehmende und Fragen aus `data/game.json`, sofern die Sammlungen noch leer sind. Danach sind PocketBase die maßgebliche Quelle für Teilnehmende und Fragen; Stimmen und Rundenstatus bleiben im Docker-Volume.

Für eine lokale Compose-Instanz müssen dieselben drei Umgebungsvariablen gesetzt und die App mit PocketBase in dasselbe Compose-Netzwerk eingebunden werden.

Der übrige Spielstand (Rundenstatus und Stimmen) wird in einem Docker-Volume gespeichert. Für einen vollständigen Neustart inklusive Spielstand:

```bash
docker compose down -v
```
