# Wer würde eher?

Ein schlichtes Live-Spiel für Gruppen: Teilnehmende wählen anonym, die Spielleitung startet Fragen und deckt Antworten auf.

## Start auf einer VM

Voraussetzung: Docker mit Docker Compose Plugin.

```bash
docker compose up --build -d
```

Öffne dann `http://DEINE-EXTERNE-IP:3000` für Mitspielende und `http://DEINE-EXTERNE-IP:3000/admin` für die Spielleitung.

Die Spielrunde wird in einem Docker-Volume gespeichert und überlebt Container-Neustarts. Für einen vollständigen Neustart inklusive Spielstand:

```bash
docker compose down -v
```
