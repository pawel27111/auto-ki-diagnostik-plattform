# AutoKI Assistent — Automotive AI Diagnostic Platform

Plattform für Werkstätten und Fahrzeugbesitzer zur OBD-II-Fahrzeugdiagnose mit
KI-gestützter Interpretation der Fehlercodes.

## 🚗 Features

### Diagnose
- **OBD-II über serielle Adapter**: ELM327 (USB/Bluetooth) und D-CAN
- **Echte Protokolldekodierung**: SAE J1979 (Mode 01, Messwerte) und SAE J2012
  (Mode 03, Fehlercodes)
- **Live-Streaming**: Messwerte per Socket.io in Echtzeit ins Frontend
- **Fahrzeugverwaltung**: mehrere Fahrzeuge je Konto, mit VIN und Kennzeichen
- **Diagnose-Verlauf**: alle Sitzungen mit Messwerten und Fehlercodes
- **CSV-Export** der Diagnoseberichte
- **Simulationsmodus** für Entwicklung ohne Hardware — alle simulierten Werte
  sind in Datenbank und Oberfläche als solche gekennzeichnet

### KI-Analyse
- OpenRouter oder lokales LM Studio, umschaltbar
- Fällt auf einen hinterlegten Katalog häufiger Codes zurück, wenn kein
  Anbieter erreichbar ist — die Analyse schlägt nie hart fehl
- Rate-Limiting pro Nutzer

## 🏗️ Architektur

### Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS 4, shadcn/ui, wouter
- **Backend**: Node.js, Express, tRPC 11, Drizzle ORM, Socket.io
- **Datenbank**: MySQL 8.0+
- **Authentifizierung**: OAuth 2.0, Session als HttpOnly-Cookie (JWT)

### Projektstruktur
```
auto-ki-assistent/
├── client/src/
│   ├── pages/             # Home, Dashboard, Diagnostic, Realtime, Settings
│   ├── components/        # App-Komponenten und shadcn/ui
│   ├── hooks/             # useOBDStreaming
│   └── lib/               # Formatierung, CSV-Export, tRPC-Client
├── server/
│   ├── _core/             # Auth, Env, Kontext, CSRF, Rate-Limiting
│   ├── obd/
│   │   ├── protocol.ts    # Reine Dekodierung, ohne I/O, voll getestet
│   │   ├── obdManager.ts  # Serieller Transport, Kommando-Queue
│   │   └── websocketHandler.ts
│   ├── llm/               # LLM-Service und Router
│   ├── obdRouter.ts       # tRPC-Endpunkte für Diagnose
│   └── db.ts              # Datenzugriff inkl. Ownership-Filter
├── drizzle/               # Schema und Migrationen
└── server/__tests__/      # Testsuite
```

## 🚀 Getting Started

### Voraussetzungen
- Node.js 18+
- pnpm 10+
- MySQL 8.0+ (die Migrationen nutzen `REGEXP_REPLACE`)

### Installation

1. **Repository klonen**
```bash
git clone <repository-url>
cd auto-ki-assistent
```

2. **Abhängigkeiten installieren**
```bash
pnpm install
# Für echte OBD-Hardware werden die nativen serialport-Bindings gebraucht.
# pnpm blockiert deren Build-Skript standardmäßig:
pnpm approve-builds
```

3. **Umgebungsvariablen konfigurieren**
```bash
cp .env.example .env
# JWT_SECRET, DATABASE_URL, VITE_APP_ID und OAUTH_SERVER_URL sind Pflicht.
# Der Server bricht beim Start ab, wenn eines davon fehlt.
```

4. **Datenbank migrieren**
```bash
pnpm db:push
```

5. **Entwicklungsserver starten**
```bash
pnpm dev
```

Die Anwendung läuft unter `http://localhost:3000`.

## 📡 OBD-Integration

### Unterstützte Hardware
- ELM327 (Bluetooth/USB), Standard OBD-II
- D-CAN Adapter (BMW, Mercedes, Audi) — auf CAN 500 kBit/s festgelegt
- Alles, was sich als serieller Port meldet und ELM-AT-Kommandos versteht

### Port-Freigabe

Der zu öffnende Port wird vom Browser gemeldet. Damit ein Client nicht
beliebige Gerätedateien auf dem Server ansprechen kann, werden nur Ports aus
`OBD_ALLOWED_PORTS` geöffnet:

```bash
OBD_ALLOWED_PORTS=/dev/ttyUSB0,/dev/ttyACM0
```

Ist die Variable leer, ist der Hardwarezugriff deaktiviert; der
Simulationsmodus funktioniert weiterhin.

### Unterstützte PIDs

`server/obd/protocol.ts` dekodiert unter anderem:

| PID  | Messwert                        | Einheit |
|------|---------------------------------|---------|
| 0104 | Berechnete Motorlast            | %       |
| 0105 | Kühlmitteltemperatur            | °C      |
| 010A | Kraftstoffdruck                 | kPa     |
| 010C | Motordrehzahl                   | rpm     |
| 010D | Geschwindigkeit                 | km/h    |
| 0110 | Luftmassenstrom                 | g/s     |
| 0111 | Drosselklappenstellung          | %       |
| 0114 | Lambdasonde (Bank 1, Sensor 1)  | V       |
| 0142 | Steuergerätespannung            | V       |

Die vollständige Liste liefert `obd.pids.list`.

### Fehlercodes

Mode-03-Antworten werden nach SAE J2012 dekodiert. Das erste Byte bestimmt
Systemgruppe und erste Ziffer:

- **P0xxx** Powertrain (Motor, Getriebe)
- **C0xxx** Chassis (Bremsen, Fahrwerk)
- **B0xxx** Body (Karosserie, Beleuchtung)
- **U0xxx** Network (Kommunikation)

## 🔌 API

Alle Endpunkte laufen über tRPC unter `/api/trpc`. Jede Prozedur, die eine
Fahrzeug- oder Diagnose-ID entgegennimmt, filtert die Abfrage auf den
angemeldeten Nutzer — eine fremde ID ist von einer nicht existierenden nicht
unterscheidbar.

### Fahrzeuge
- `obd.vehicles.create`, `obd.vehicles.list`, `obd.vehicles.getById`

### Geräte
- `obd.devices.create`, `obd.devices.list`, `obd.devices.availablePorts`

### Diagnosen
- `obd.diagnostics.start`, `getById`, `listByVehicle`, `listRecent`
- `obd.diagnostics.addParameter`, `getParameters`
- `obd.diagnostics.addErrorCode`, `getErrorCodes`
- `obd.diagnostics.complete`, `fail`, `cancel`

### KI-Analyse
- `llm.status`, `llm.analyzeCode`, `llm.analyzeDiagnostic`

### Simulation
- `obd.mock.simulateDiagnostic`

### Live-Streaming

Socket.io unter `/api/socket.io`. Die Verbindung wird im Handshake über das
Session-Cookie authentifiziert; nicht angemeldete Sockets werden abgewiesen.

| Client → Server      | Nutzlast                                   |
|----------------------|--------------------------------------------|
| `diagnostic:start`   | `{ vehicleId, port, diagnosticId?, intervalMs? }` |
| `diagnostic:stop`    | `{ sessionId }`                            |
| `parameter:request`  | `{ sessionId, pid }`                       |
| `errorcode:read`     | `{ sessionId }`                            |
| `errorcode:clear`    | `{ sessionId, confirm: true }`             |

Jedes Event wird mit einem Ack beantwortet (`{ ok: true }` oder
`{ ok: false, error }`). Session-IDs vergibt der Server.

## 🔐 Sicherheit

- **OAuth 2.0** mit CSRF-Nonce im `state`-Parameter und Redirect-Whitelist
- **Session** als HttpOnly-Cookie, JWT mit `appId`-Prüfung, 30 Tage Laufzeit
- **Ownership-Filter in SQL** auf allen Fahrzeug- und Diagnose-Zugriffen
- **Origin-Prüfung** vor jeder mutierenden Anfrage
- **Port-Allowlist** für den seriellen Zugriff
- **Zod-Validierung** aller tRPC- und Socket-Nutzlasten
- **Rate-Limiting** der KI-Analyse pro Nutzer
- **Bestätigungspflicht** vor dem Löschen des Fehlerspeichers

### ⚠️ Löschen des Fehlerspeichers

`errorcode:clear` sendet OBD Mode 04. Das löscht neben den Fehlercodes auch
Freeze-Frame-Daten und setzt die Readiness-Monitore zurück, die für die
Abgasuntersuchung benötigt werden. Der Vorgang ist nicht umkehrbar; die
Oberfläche verlangt deshalb eine ausdrückliche Bestätigung.

## 📊 Diagnose-Workflow

1. Fahrzeug im Dashboard anlegen
2. OBD-Adapter anschließen, Port in `OBD_ALLOWED_PORTS` freigeben
3. Diagnose starten — ohne Hardware übernimmt der Simulator
4. Messwerte und Fehlercodes werden erfasst
5. KI-Analyse für Ursachen und Reparaturvorschläge anstoßen
6. Bericht als CSV exportieren

## 🧪 Entwicklung

```bash
pnpm dev              # Entwicklungsserver
pnpm build            # Produktions-Build (Client + Server)
pnpm start            # Produktionsserver

pnpm check            # TypeScript
pnpm lint             # ESLint
pnpm lint:fix         # ESLint mit Autofix
pnpm format           # Prettier
pnpm test             # Tests einmalig
pnpm test:watch       # Tests im Watch-Modus

pnpm db:generate      # Migration aus dem Schema erzeugen
pnpm db:migrate       # Migrationen anwenden
pnpm db:push          # generate + migrate
pnpm db:studio        # Drizzle Studio
```

### Tests

Die Suite deckt vor allem die Stellen ab, an denen ein Fehler teuer wäre:

- `protocol.test.ts` — PID- und DTC-Dekodierung gegen bekannte Bytefolgen
- `obdRouter.ownership.test.ts` — jede Prozedur gegen fremde IDs, inklusive
  der Prüfung, dass bei Ablehnung kein Schreibzugriff stattfindet
- `csrf.test.ts` — Origin-Prüfung inklusive Präfix-Verwechslung
- `rateLimit.test.ts`, `llmService.test.ts`, `report.test.ts`, `format.test.ts`

### Datenhaltung

`obdParameters` wächst im Livebetrieb am schnellsten (rund fünf Zeilen pro
Sekunde je aktiver Sitzung). `pruneObdParameters(olderThan)` in `server/db.ts`
löscht alte Messwerte; ein Aufrufer dafür ist noch nicht eingerichtet.

## 🔄 Roadmap

### Umgesetzt
- [x] OBD-Diagnose-Interface mit echter Protokolldekodierung
- [x] Fahrzeugverwaltung und Diagnose-Verlauf
- [x] Fehlercode-Erfassung und -Interpretation
- [x] Benutzer-Authentifizierung und Zugriffskontrolle
- [x] Live-Streaming über Socket.io
- [x] KI-Analyse mit OpenRouter und LM Studio
- [x] CSV-Berichtsexport

### Offen
- [ ] Anomalieerkennung über den Diagnoseverlauf
- [ ] Predictive Maintenance
- [ ] Natürlichsprachliche Abfragen
- [ ] EdiabasLib-Integration für herstellerspezifische Diagnose
- [ ] Flotten-Management
- [ ] Aufräumjob für alte Messwerte
- [ ] Deployment-Pipeline

## 📱 Android-App

Natives Android-Projekt (Kotlin, Jetpack Compose) im [`android/`](android/)
Verzeichnis — verbindet sich per Bluetooth direkt mit ELM327-/D-CAN-Adaptern
und spricht mit demselben tRPC-Backend wie diese Web-Oberfläche. Details und
Build-Anleitung: [android/README.md](android/README.md).

## 📝 Lizenz

MIT License

## 🤝 Beitragen

Siehe [CONTRIBUTING.md](CONTRIBUTING.md). Vor einem Pull Request bitte
`pnpm check`, `pnpm lint` und `pnpm test` ausführen.

---

**Entwickelt für Automechaniker und Fahrzeugbegeisterte**
