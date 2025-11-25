# AutoKI Assistent - Automotive AI Diagnostic Platform

Eine professionelle Plattform für Automechaniker und Fahrzeugbegeisterte zur Durchführung intelligenter Fahrzeugdiagnosen über OBD-II (On-Board Diagnostics) mit KI-gestützter Analyse.

## 🚗 Features

### Core-Funktionalität
- **OBD-II Diagnose**: Echtzeitverbindung mit Fahrzeugmotorsteuerung über OBD-Kabel (D-CAN, ELM327)
- **Echtzeit-Datenerfassung**: Motorparameter wie RPM, Temperatur, Druck, Sauerstoffsensor
- **Fehlercode-Analyse**: Automatische Erfassung und Interpretation von Fehlercodes (DTC)
- **Fahrzeugverwaltung**: Verwaltung mehrerer Fahrzeuge mit VIN, Baujahr, Motortyp
- **Diagnose-Verlauf**: Speicherung und Verfolgung aller Diagnose-Sitzungen
- **Benutzerautentifizierung**: Sichere Benutzer-Verwaltung mit OAuth

### Benutzeroberfläche
- **Landing Page**: Professionelle Präsentation mit Hero-Section und Feature-Übersicht
- **Dashboard**: Fahrzeugverwaltung, Diagnose-Übersicht, Berichte
- **Diagnose-Interface**: Live-Datenvisualisierung mit interaktiven Grafiken
- **Responsive Design**: Optimiert für Desktop, Tablet und Mobile

## 🏗️ Architektur

### Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Shadcn UI
- **Backend**: Node.js, Express, tRPC, Drizzle ORM
- **Datenbank**: MySQL mit Drizzle Schema
- **Authentifizierung**: OAuth 2.0 mit Manus
- **Deployment**: Docker-ready, Cloud-native

### Datenbankschema
```
- users: Benutzer und Authentifizierung
- vehicles: Fahrzeuginformationen (VIN, Make, Model, Year, etc.)
- obdDevices: OBD-Geräte-Verwaltung (ELM327, CAN Adapter, etc.)
- diagnostics: Diagnose-Sitzungen mit Status und Metriken
- errorCodes: Erfasste Fehlercodes mit Schweregrad
- obdParameters: Echtzeit-OBD-Parameter und Messwerte
- diagnosticReports: Generierte Diagnoseberichte
```

## 🚀 Getting Started

### Voraussetzungen
- Node.js 18+
- MySQL 8.0+
- Git

### Installation

1. **Repository klonen**
```bash
git clone <repository-url>
cd auto-ki-assistent
```

2. **Abhängigkeiten installieren**
```bash
pnpm install
```

3. **Umgebungsvariablen konfigurieren**
```bash
cp .env.example .env
# Bearbeiten Sie .env mit Ihren Konfigurationen
```

4. **Datenbank initialisieren**
```bash
pnpm db:push
```

5. **Entwicklungsserver starten**
```bash
pnpm dev
```

Die Anwendung läuft dann unter `http://localhost:3000`

## 📡 OBD-Integration

### Unterstützte Hardware
- **ELM327 Bluetooth/USB Adapter** (Standard OBD-II)
- **D-CAN Adapter** (BMW, Mercedes, Audi)
- **WiFi OBD-Module**
- **Proprietäre CAN-Adapter**

### OBD-Parameter
Die Plattform erfasst folgende Standard-Parameter:
- **010C**: Engine RPM (Drehzahl)
- **010D**: Vehicle Speed (Geschwindigkeit)
- **0105**: Engine Coolant Temperature (Motortemperatur)
- **010A**: Fuel Pressure (Kraftstoffdruck)
- **0114**: O2 Sensor (Sauerstoffsensor)
- Und viele weitere...

### Fehlercode-Interpretation
Automatische Erfassung und Kategorisierung von DTC-Codes:
- **P0xxx**: Powertrain (Motor, Getriebe)
- **C0xxx**: Chassis (Bremsen, Aufhängung)
- **B0xxx**: Body (Karosserie, Beleuchtung)
- **U0xxx**: Network (Kommunikation)

## 🔌 API-Endpoints

### Fahrzeuge
- `POST /api/trpc/obd.vehicles.create` - Neues Fahrzeug hinzufügen
- `GET /api/trpc/obd.vehicles.list` - Alle Fahrzeuge auflisten
- `GET /api/trpc/obd.vehicles.getById` - Fahrzeug nach ID abrufen

### Diagnosen
- `POST /api/trpc/obd.diagnostics.start` - Diagnose starten
- `GET /api/trpc/obd.diagnostics.getById` - Diagnose abrufen
- `GET /api/trpc/obd.diagnostics.listByVehicle` - Diagnosen für Fahrzeug
- `POST /api/trpc/obd.diagnostics.addParameter` - Parameter hinzufügen
- `POST /api/trpc/obd.diagnostics.addErrorCode` - Fehlercode hinzufügen
- `POST /api/trpc/obd.diagnostics.complete` - Diagnose abschließen

### Mock-Simulation (für Tests ohne Hardware)
- `POST /api/trpc/obd.mock.simulateDiagnostic` - Diagnose simulieren

## 📊 Diagnose-Workflow

1. **Fahrzeug auswählen** - Wählen Sie ein registriertes Fahrzeug
2. **OBD-Gerät verbinden** - Verbinden Sie das OBD-Kabel mit dem Fahrzeug
3. **Diagnose starten** - Initiieren Sie einen Scan (Full, Quick, oder Custom)
4. **Daten erfassen** - Die Plattform liest Echtzeit-Parameter und Fehlercodes
5. **Analyse durchführen** - KI-gestützte Interpretation der Fehler
6. **Bericht generieren** - Erstellen Sie einen exportierbaren Diagnose-Bericht

## 🔐 Sicherheit

- **OAuth 2.0 Authentifizierung** für sichere Benutzer-Verwaltung
- **Verschlüsselte Datenverbindung** zwischen Client und Server
- **Datenschutz**: Alle Fahrzeug- und Diagnose-Daten sind benutzer-spezifisch
- **Rollen-basierte Zugriffskontrolle** (User, Admin)

## 📝 Lizenz

MIT License - siehe LICENSE Datei für Details

## 🤝 Beitragen

Beiträge sind willkommen! Bitte erstellen Sie einen Pull Request mit:
- Klarer Beschreibung der Änderungen
- Tests für neue Features
- Aktualisierte Dokumentation

## 📞 Support

Bei Fragen oder Problemen:
- Erstellen Sie ein Issue im Repository
- Kontaktieren Sie das Support-Team
- Konsultieren Sie die Dokumentation

## 🔄 Roadmap

### Phase 1: Basis-Funktionalität ✅
- [x] OBD-Diagnose-Interface
- [x] Fahrzeugverwaltung
- [x] Fehlercode-Erfassung
- [x] Benutzer-Authentifizierung

### Phase 2: KI & Erweiterte Features 🚧
- [ ] KI-gestützte Fehleranalyse
- [ ] Anomalieerkennung
- [ ] Predictive Maintenance
- [ ] Natürlichsprachliche Abfragen

### Phase 3: Integration & Skalierung 📅
- [ ] EdiabasLib Integration
- [ ] Multi-Fahrzeug-Flotten-Management
- [ ] Mobile App (iOS/Android)
- [ ] Cloud-Synchronisation

## 👨‍💻 Entwicklung

### Projekt-Struktur
```
auto-ki-assistent/
├── client/                 # Frontend (React)
│   ├── src/
│   │   ├── pages/         # Seiten (Home, Dashboard, Diagnostic)
│   │   ├── components/    # UI-Komponenten
│   │   └── const.ts       # Konfiguration
│   └── public/            # Statische Assets
├── server/                # Backend (Node.js)
│   ├── _core/            # Kern-Module (Auth, Database, etc.)
│   ├── obdRouter.ts      # OBD API Router
│   ├── db.ts             # Datenbankfunktionen
│   └── routers.ts        # tRPC Router
├── drizzle/              # Datenbankschema
│   └── schema.ts         # Drizzle ORM Schema
└── README.md             # Diese Datei
```

### Befehle
```bash
# Entwicklung
pnpm dev              # Entwicklungsserver starten
pnpm build            # Für Production bauen
pnpm start            # Production Server starten

# Datenbank
pnpm db:push          # Schema zur DB pushen
pnpm db:studio        # Drizzle Studio öffnen

# Testing
pnpm test             # Tests ausführen
pnpm lint             # Code-Linting

# Deployment
pnpm docker:build     # Docker Image bauen
```

## 📚 Weitere Ressourcen

- [OBD-II Spezifikation](https://en.wikipedia.org/wiki/OBD-II_PIDs)
- [ELM327 Dokumentation](https://www.elmelectronics.com/)
- [React Dokumentation](https://react.dev)
- [Drizzle ORM Guide](https://orm.drizzle.team)

---

**Entwickelt mit ❤️ für Automechaniker und Fahrzeugbegeisterte**

**Version**: 1.0.0  
**Letztes Update**: November 2025
