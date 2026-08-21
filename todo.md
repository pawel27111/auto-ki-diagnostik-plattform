# AutoKI Assistent — Project TODO

## Phase 1: Analyse & Initialisierung ✅
- [x] GitHub-Projekt und Binaries analysieren
- [x] Full-Stack-Projekt aufsetzen (Server, DB, Auth)
- [x] Projektstruktur und Abhängigkeiten

## Phase 2: Frontend & Design ✅
- [x] Landing Page mit Hero-Section
- [x] Dashboard-Layout
- [x] Diagnose-Interface
- [x] Einstellungsseite
- [x] Visuelle Assets und Branding
- [x] Datenvisualisierung für OBD-Messwerte
- [x] Diagnosebericht (CSV-Export)
- [x] Responsives Design

## Phase 3: Backend & Kernfunktionen ✅
- [x] Datenbankschema für Fahrzeuge, Diagnosen und Nutzer
  (inkl. Indizes, Fremdschlüssel und numerischer Messwerttypen)
- [x] OBD-Geräteverbindung
- [x] Auslesen von OBD-Parametern (echte SAE-J1979-Dekodierung)
- [x] Fehlercodes lesen und interpretieren (SAE J2012)
- [x] Diagnose-Datenverarbeitung
- [x] Fahrzeugverwaltungs-API
- [x] Echtzeit-Streaming über Socket.io
- [x] Diagnose-Historie und Berichte
- [x] Authentifizierung und Autorisierung
- [ ] EdiabasLib-Wrapper für herstellerspezifische Diagnose

## Phase 4: Produktivfunktionen ✅

### 4.1 OBD-Hardware ✅
- [x] Socket.io-Server, im Serverstart eingebunden
- [x] ELM327 über USB/Bluetooth
- [x] D-CAN-Adapter
- [x] Parameter-Streaming vom Fahrzeug
- [x] Fehlerbehandlung, Kommando-Queue, sauberes Verbindungs-Cleanup
- [x] Port-Erkennung mit serverseitiger Allowlist

### 4.2 LLM-Integration ✅
- [x] OpenRouter-Anbindung
- [x] LM Studio für lokale Inferenz
- [x] Fehlercode-Analyse mit Reparaturempfehlungen
- [x] Anbieterwechsel und beidseitiger Fallback
- [x] Validierung der Modellantwort, Rate-Limiting

### 4.3 Echtzeit-Streaming ✅
- [x] Socket.io-Server mit Handshake-Authentifizierung
- [x] Live-Parameter ins Frontend
- [x] Fehlercode-Benachrichtigungen
- [x] Mehrere Clients je Sitzung über Rooms
- [x] Verbindungs- und Sitzungsverwaltung

## Phase 5: Sicherheit & Qualität ✅
- [x] Zugriffskontrolle auf allen Fahrzeug- und Diagnose-Endpunkten
- [x] CSRF-Schutz (OAuth-Nonce, Origin-Prüfung)
- [x] Startvalidierung der Konfiguration
- [x] Testsuite für Protokoll, Zugriffskontrolle, CSRF, Rate-Limiting
- [x] ESLint mit typbewussten Regeln
- [x] Asset-Optimierung

## Phase 6: KI & erweiterte Funktionen
- [ ] Anomalieerkennung über den Diagnoseverlauf
- [ ] Predictive Maintenance
- [ ] Natürlichsprachliche Abfragen
- [ ] Vergleich mehrerer Diagnosen desselben Fahrzeugs

## Phase 7: Betrieb & Deployment
- [ ] Aufräumjob für alte OBD-Messwerte (`pruneObdParameters` existiert,
      wird aber von nichts aufgerufen)
- [ ] Deployment-Pipeline
- [ ] Nutzerdokumentation
- [ ] Bundle-Splitting (aktuell ein Chunk über 500 kB)
- [ ] Rate-Limiting über mehrere Instanzen (aktuell prozesslokal)
