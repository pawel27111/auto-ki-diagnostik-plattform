# AutoKI Assistent — Fix-Liste aus dem Code-Review

> **Status: abgeschlossen.** Alle 112 Punkte sind auf `claude/code-review-imfvku`
> umgesetzt. Die Liste bleibt als Nachweis erhalten: sie sagt, was geändert
> wurde und warum. Der aktuelle Projektstand steht in `todo.md`.
>
> Verifikation: `pnpm check` (fehlerfrei), `pnpm lint` (fehlerfrei),
> `pnpm test` (86 Tests). Die Zugriffskontroll-Tests wurden gegen die
> wiederhergestellte Sicherheitslücke geprüft und schlagen dort fehl — sie
> messen also tatsächlich etwas.

Stand: 2026-08-21 · Basis: Branch `claude/code-review-imfvku`

Bearbeitungsreihenfolge war **P0 → P1 → P2 → P3 → P4**.

Legende der Aufwandsschätzung: `S` < 1 h · `M` 1–4 h · `L` > 4 h

---

## P0 — Sicherheit (blockiert Deployment)

### 1. IDOR: Ownership-Checks in `server/obdRouter.ts` ergänzen `L`

Nur `diagnostics.start` (Zeile 88) und `diagnostics.listByVehicle` (Zeile 126) prüfen
den Besitzer. Jeder eingeloggte Nutzer kann durch Hochzählen der IDs fremde Daten
lesen **und schreiben**.

- [x] Helper `assertVehicleOwnership(userId, vehicleId)` in `server/db.ts` anlegen
- [x] Helper `assertDiagnosticOwnership(userId, diagnosticId)` in `server/db.ts` anlegen
      (Join `diagnostics.userId`, nicht nur `vehicleId`)
- [x] `vehicles.getById` — `obdRouter.ts:47` — Check ergänzen
- [x] `diagnostics.getById` — `obdRouter.ts:115` — Check ergänzen
- [x] `diagnostics.getParameters` — `obdRouter.ts:167` — Check ergänzen
- [x] `diagnostics.getErrorCodes` — `obdRouter.ts:196` — Check ergänzen
- [x] `diagnostics.addParameter` — `obdRouter.ts:139` — Schreibzugriff absichern
- [x] `diagnostics.addErrorCode` — `obdRouter.ts:174` — Schreibzugriff absichern
- [x] `diagnostics.complete` — `obdRouter.ts:203` — Schreibzugriff absichern
- [x] `diagnostics.fail` — `obdRouter.ts:235` — Schreibzugriff absichern
- [x] `mock.simulateDiagnostic` — `obdRouter.ts:253` — Schreibzugriff absichern
- [x] Statt `throw new Error(...)` durchgängig `TRPCError` mit Code `FORBIDDEN` /
      `NOT_FOUND` verwenden (aktuell leaken generische Errors als 500)
- [x] Regressionstests: fremde ID → 403 für jede der 9 Prozeduren

### 2. Socket.io: Authentifizierung und Zugriffskontrolle `L`

`server/obd/websocketHandler.ts` hat **keinerlei** Auth. Jede beliebige Website kann
sich verbinden (`origin: "*"`, Zeile 29) und u. a. `errorcode:clear` senden — das
löscht den realen Fehlerspeicher des Fahrzeugs (`obdManager.clearErrorCodes`,
`websocketHandler.ts:281`).

- [x] `io.use()`-Middleware: Session-Cookie parsen und über `sdk.verifySession()`
      validieren; unauthentifizierte Sockets ablehnen
- [x] `cors.origin` auf die konkreten erlaubten Origins einschränken (Wildcard entfernen)
- [x] `port` aus `diagnostic:start` gegen eine Whitelist prüfen — aktuell wird ein
      beliebiger, vom Client gelieferter String als serielle Gerätedatei geöffnet
- [x] `sessionId` serverseitig erzeugen (`crypto.randomUUID()`) statt vom Client zu
      übernehmen (`useOBDStreaming.ts:114`: `session-${Date.now()}` ist ratbar)
- [x] `handleDiagnosticStart` (`websocketHandler.ts:117`): bestehende Session mit
      gleicher ID nicht mehr kommentarlos überschreiben → Session-Übernahme möglich
- [x] Alle Socket-Payloads mit Zod validieren (aktuell ungeprüftes `any`)
- [x] `userId` an der Session speichern und bei jedem Event gegen den Socket prüfen

### 3. Cross-Session-Datenleck im Parameter-Broadcast `M`

`websocketHandler.ts:82-97`: Der `parameter`-Listener schreibt jeden Messwert in
**jede** aktive Session, unabhängig vom Port. Bei zwei parallelen Diagnosen sehen
beide Clients die Daten des jeweils anderen Fahrzeugs.

- [x] Messwert mit dem `port` markieren und nur an Sessions mit passendem Port senden
- [x] Konsistent auf Socket.io-Rooms (`session:${id}`) umstellen; das parallel
      gepflegte `session.clients`-Set entfernen

### 4. CSRF-Absicherung `M`

- [x] `server/_core/cookies.ts:45` — `sameSite: "none"` überdenken. Ohne CSRF-Token
      wird das Session-Cookie bei Cross-Site-POSTs mitgeschickt. Entweder `"lax"`
      oder ein Double-Submit-Token einführen
- [x] Bei `sameSite: "none"` verwerfen Browser das Cookie ohne `secure` — lokal über
      HTTP funktioniert der Login damit gar nicht. Dev-Pfad explizit auf `"lax"` setzen
- [x] OAuth-`state` als echtes CSRF-Nonce: aktuell `btoa(redirectUri)`
      (`client/src/const.ts:12`) und serverseitig `atob(state)` ohne Whitelist
      (`server/_core/sdk.ts:42`) — vollständig vorhersagbar
- [x] Redirect-URI serverseitig gegen eine Whitelist prüfen (Open-Redirect)

### 5. Session-Token-Härtung `S`

- [x] `server/_core/sdk.ts:213` — `appId` aus dem JWT gegen `ENV.appId` vergleichen
      (wird ausgelesen, aber nie geprüft)
- [x] `server/_core/env.ts:3` — Startup-Validierung ergänzen: fehlt `JWT_SECRET`,
      wird aktuell mit leerem Schlüssel signiert und der Fehler fällt erst beim
      ersten Login auf. Prozess beim Boot mit klarer Meldung abbrechen
- [x] Gleiches für `VITE_APP_ID`, `OAUTH_SERVER_URL`, `DATABASE_URL`
- [x] Token-Laufzeit von 1 Jahr (`ONE_YEAR_MS`) überdenken

---

## P1 — Kernfunktionalität (App tut aktuell nichts)

### 6. Phase-4-Module sind toter Code — Einstiegspunkte fehlen `M`

`server/obd/websocketHandler.ts` und `server/llm/llmService.ts` werden **nirgends
importiert**. `initializeWebSocket()` und `initializeLLMService()` werden nie
aufgerufen. Der Client-Hook verbindet sich gegen einen Endpunkt, den es nicht gibt,
und läuft in Reconnect-Schleifen.

- [x] `initializeWebSocket(server)` in `server/_core/index.ts` nach `createServer(app)`
      aufrufen
- [x] `initializeLLMService(config)` beim Start aufrufen, Konfiguration aus `ENV` lesen
- [x] `LLMConfig` in `server/_core/env.ts` aufnehmen
      (`OPENROUTER_API_KEY`, `LMSTUDIO_BASE_URL`, `LLM_PROVIDER`)
- [x] tRPC-Endpunkt für `analyzeErrorCode` ergänzen, damit die LLM-Analyse überhaupt
      erreichbar ist
- [x] `todo.md`: Phase 4.1 / 4.2 / 4.3 sind als ✅ markiert, obwohl nichts angebunden
      ist — Status korrigieren

### 7. Insert-Endpunkte geben hartkodierte IDs zurück `M`

Alle Create-Mutations liefern `1` statt der echten ID. Der Client kann die eben
angelegte Ressource nicht referenzieren.

- [x] `server/db.ts` — `createVehicle`, `createObdDevice`, `createDiagnostic`,
      `createErrorCode`, `createObdParameter`: `result[0].insertId` zurückgeben
      (Drizzle-Typ ist `MySqlRawQueryResult = [ResultSetHeader, FieldPacket[]]`)
- [x] `obdRouter.ts:32` — `vehicleId: 1` → echte ID
- [x] `obdRouter.ts:70` — `deviceId: 1` → echte ID
- [x] `obdRouter.ts:109` — `diagnosticId: 1` → echte ID
- [x] `obdRouter.ts:163` — `parameterId: 1` → echte ID
- [x] `obdRouter.ts:192` — `errorCodeId: 1` → echte ID

### 8. Client an die API anschließen `L`

Kein einziger `trpc.obd.*`-Aufruf im gesamten Client. Beide Hauptseiten zeigen
ausschließlich fest einprogrammierte Daten.

- [x] `client/src/pages/Dashboard.tsx` — hartkodierte Fahrzeugliste (BMW/Mercedes/Audi)
      durch `trpc.obd.vehicles.list` ersetzen
- [x] `Dashboard.tsx` — Kennzahlen ("3 Fahrzeuge", "24 Diagnosen", "2 Warnungen")
      aus echten Daten berechnen
- [x] `Dashboard.tsx` — Diagnose-Historie über `trpc.obd.diagnostics.listByVehicle` laden
- [x] `Dashboard.tsx:124` — Button "Fahrzeug hinzufügen" hat keinen Handler:
      Dialog + `trpc.obd.vehicles.create` implementieren
- [x] `Dashboard.tsx:59` — Zahnrad verlinkt auf `/settings`, die Route existiert nicht →
      Seite anlegen oder Button entfernen
- [x] `client/src/pages/DiagnosticInterface.tsx:69` — `setTimeout`-Simulation durch
      `diagnostics.start` + `mock.simulateDiagnostic` + `getParameters`/`getErrorCodes`
      ersetzen
- [x] `DiagnosticInterface.tsx` — Fahrzeug-Dropdown aus `vehicles.list` befüllen
      (aktuell drei feste `<option>`)
- [x] `DiagnosticInterface.tsx` — fester OBD-Status "Verbunden" durch echten Gerätestatus
      ersetzen
- [x] `DiagnosticInterface.tsx:530/533` — "Bericht herunterladen" / "per E-Mail"
      implementieren oder entfernen
- [x] `RealtimeDiagnostic.tsx` — feste Fahrzeug- und Port-Listen durch
      `vehicles.list` bzw. `obdManager.getAvailablePorts()` ersetzen

### 9. OBD-Manager liefert Zufallszahlen statt Messwerten `L`

`server/obd/obdManager.ts:211`: `const value = Math.random() * 100; // Mock value`.
`readErrorCodes` (`:344`) gibt feste Mock-DTCs zurück. Die UI zeigt beides ohne
Kennzeichnung als echte Fahrzeugdaten — bei einer Diagnoseplattform ein Haftungsrisiko.

- [x] Echten ELM327-Response-Parser implementieren (Hex-Payload → physikalischer Wert
      je PID) oder die vorhandene, aber ungenutzte Dependency `obd-parser` einbinden
      (das leere Interface in `obdManager.ts:5` ersetzen)
- [x] `readErrorCodes` (`:335`): Mode-`03`-Antwort tatsächlich dekodieren
      (2 Byte pro DTC, Präfix P/C/B/U aus den oberen Bits)
- [x] Solange kein echter Parser existiert: Mock-Werte im Response-Objekt als
      `simulated: true` markieren und in der UI sichtbar kennzeichnen
- [x] `handleData` (`:161`): eingehende serielle Daten puffern und erst am
      `>`-Prompt auswerten — Fragmentierung wird aktuell ignoriert
- [x] `initializeDevice` (`:126`): AT-Kommandos nacheinander auf Antwort warten statt
      per `setTimeout` blind zu feuern; `AT RA` ohne Adressargument prüfen/entfernen

### 10. Listener-Leak und Race Condition in `requestParameter` `M`

`obdManager.ts:199-222`

- [x] Bei Timeout den über `this.once("data", …)` (`:221`) registrierten Handler
      entfernen — er bleibt sonst dauerhaft hängen (EventEmitter-Warnung ab 11)
- [x] Anfragen serialisieren oder Antworten per PID zuordnen: aktuell hängen alle
      parallelen Anfragen am selben `data`-Event, die erste Antwort löst den
      erstbesten Handler auf → Messwerte landen beim falschen PID
- [x] `startScanning` (`:238`): Überlappung verhindern (Intervall 1000 ms, aber
      5 PIDs × bis zu 1000 ms Timeout = bis zu 5 s pro Durchlauf)
- [x] `connectDevice`: bei fehlgeschlagenem `open()` den Port aus `this.devices`
      entfernen (wird vor dem Öffnen gesetzt und bleibt bei Fehler zurück)

---

## P2 — Datenbank

### 11. Indizes und Fremdschlüssel fehlen vollständig `M`

Beide Migrationen (`drizzle/0000_green_dormammu.sql`, `0001_moaning_jackal.sql`)
enthalten weder `FOREIGN KEY` noch `INDEX`. Jede Abfrage ist ein Full Table Scan.

- [x] Index auf `vehicles.userId`
- [x] Index auf `diagnostics.vehicleId`, `diagnostics.userId`
- [x] Index auf `errorCodes.diagnosticId`
- [x] Index auf `obdParameters.diagnosticId` und `obdParameters.timestamp`
      (wächst am schnellsten — Echtzeit-Messwerte)
- [x] Index auf `obdDevices.userId`, `diagnosticReports.diagnosticId`
- [x] Fremdschlüssel mit `ON DELETE CASCADE` für alle obigen Relationen
      (`.references()` in `drizzle/schema.ts`) — sonst entstehen verwaiste Zeilen
- [x] Migration generieren und auf einer Kopie der Daten testen

### 12. Schema-Korrekturen `M`

- [x] `drizzle/schema.ts:32` — `vin` ist global `unique`. Zwei Nutzer (Werkstatt und
      Halter) können dasselbe Fahrzeug nicht anlegen → auf `UNIQUE(userId, vin)` ändern
- [x] Messwerte als Zahlen statt `varchar`: `diagnostics.rpm` (`:77`),
      `engineTemperature`, `speed`, `fuelPressure`, `oxygenSensor`,
      `obdParameters.value` (`:114`), `minValue`, `maxValue`
- [x] `boolean` statt `int` für `obdDevices.isActive` (`:56`),
      `errorCodes.isResolved` (`:100`), `obdParameters.isNormal` (`:118`)
- [x] Retention-Strategie für `obdParameters` festlegen (Aggregation oder Löschjob)

### 13. Schreibzugriff bei jedem Request drosseln `S`

- [x] `server/_core/sdk.ts:295` — `upsertUser({ lastSignedIn })` läuft bei **jedem**
      tRPC-Call, auch bei jeder Query. Auf max. 1× pro Stunde je Nutzer begrenzen

---

## P3 — Bugs und Robustheit

### 14. `stopDiagnostic` stoppt nichts `S`

- [x] `client/src/pages/DiagnosticInterface.tsx:183` — `setInterval` und das
      5-Sekunden-`setTimeout` abräumen. Aktuell erscheint nach "Stoppen" trotzdem
      das Diagnoseergebnis
- [x] Beide Timer per `useRef` halten und im `useEffect`-Cleanup löschen
      (aktuell `setState` auf unmounted Component möglich)

### 15. Inkonsistente Mock-Daten `S`

- [x] `server/obdRouter.ts:320` vs. `:349/:350` — `Math.random()` wird mehrfach
      unabhängig ausgewertet. Ergebnis: `errorCount: 2` bei null gespeicherten Codes
      oder umgekehrt. Einmal würfeln, Ergebnis wiederverwenden

### 16. Ungeschützte Fehlerbehandlung `S`

- [x] `server/obdRouter.ts:34` — `error.message.includes(...)` wirft selbst, wenn
      `error` kein `message` hat. Auf `error.code === "ER_DUP_ENTRY"` umstellen

### 17. Unbegrenztes Speicherwachstum `S`

- [x] `server/obd/websocketHandler.ts:86` und `:215` — `session.parameters.push()`
      begrenzen (Ringpuffer, z. B. letzte 500)
- [x] `client/src/hooks/useOBDStreaming.ts:62` — `setParameters(prev => [...prev, …])`
      begrenzen; die UI zeigt ohnehin nur die letzten 10
      (`RealtimeDiagnostic.tsx:159`)
- [x] Beendete Sessions aus `this.sessions` entfernen (bleiben nach
      `diagnostic:stop` mit `isActive: false` liegen)

### 18. Destruktive Aktion ohne Rückfrage `S`

- [x] `client/src/pages/RealtimeDiagnostic.tsx:221` — "Löschen" löscht den
      Fehlerspeicher des Fahrzeugs unwiderruflich. `AlertDialog` mit Bestätigung
      vorschalten (Komponente ist bereits im Projekt vorhanden)

### 19. Auth-Guard vor dem Render `S`

- [x] `client/src/pages/Dashboard.tsx:23` und
      `client/src/pages/DiagnosticInterface.tsx:62` — Redirect im `useEffect` feuert
      während `meQuery` noch lädt → Flackern beim Reload. Stattdessen die bereits
      vorhandene Option `useAuth({ redirectOnUnauthenticated: true })` nutzen
- [x] `client/src/App.tsx:14` — geschützte Routen in einen `<ProtectedRoute>`-Wrapper
      legen (der Kommentar dort weist selbst darauf hin)

### 20. Side Effect in der Render-Phase `S`

- [x] `client/src/_core/hooks/useAuth.ts:45` — `localStorage.setItem()` steht im
      `useMemo` und schreibt bei fehlenden Daten den String `"undefined"`.
      In einen `useEffect` verschieben
- [x] Prüfen, ob Nutzer-PII überhaupt in den localStorage muss

### 21. Numerische Berechnung auf Strings `S`

- [x] `client/src/pages/DiagnosticInterface.tsx:419` — `parseFloat(param.value)`
      erzeugt bei fehlenden `minValue`/`maxValue` `NaN` in der CSS-`width`.
      Ergebnis auf 0–100 clampen und `NaN` abfangen

### 22. LLM-Service härten `M`

- [x] `server/llm/llmService.ts:47` und `:59` — `timeout` auf beiden axios-Instanzen
      setzen (aktuell können Requests unbegrenzt hängen)
- [x] `:123` — Default-Modell `meta-llama/llama-2-70b-chat` ist veraltet, durch ein
      aktuelles Modell ersetzen
- [x] `:156` / `:213` — LLM-Antwort mit Zod validieren statt
      `analysis.recommendations || []` (kein Array-Check)
- [x] `:97` — Fallback ist asymmetrisch: OpenRouter → LM Studio existiert,
      LM Studio → OpenRouter nicht
- [x] `analyzeWithOpenRouter` und `analyzeWithLMStudio` sind zu ~90 % identisch —
      zu einer Methode zusammenführen
- [x] `determineSeverity` (`:225`): `code.includes("0300")` matcht zu unscharf,
      auf exakten Vergleich umstellen
- [x] Rate-Limiting für LLM-Aufrufe, bevor der Endpunkt öffentlich erreichbar ist

---

## P4 — Tests, Hygiene, Dokumentation

### 23. Tests `L`

Aktuell existiert **genau ein** Test (`server/auth.logout.test.ts`, Boilerplate).

- [x] `tsconfig.json:2` — `"exclude": ["**/*.test.ts"]` entfernen, damit Tests
      typgeprüft werden
- [x] Tests für alle Ownership-Checks aus P0/1 (fremde ID → 403)
- [x] Tests für `obdRouter` Happy Path (Vehicle → Diagnostic → Parameter → Complete)
- [x] Tests für den OBD-Response-Parser aus P1/9
- [x] Tests für `llmService`: Fallback-Kette und Parsing kaputter LLM-Antworten
- [x] Test für die Socket-Auth-Middleware

### 24. Abhängigkeiten und toter Code `S`

- [x] Ungenutzte Dependencies entfernen: `openai`, `@aws-sdk/client-s3`,
      `@aws-sdk/s3-request-presigner`, `framer-motion`
- [x] `obd-parser` entweder in `obdManager.ts` einbinden (siehe P1/9) oder entfernen
- [x] Nicht geroutete Komponenten klären: `ComponentShowcase.tsx` (1437 Zeilen),
      `Map.tsx`, `ManusDialog.tsx`, `AIChatBox.tsx`, `DashboardLayout.tsx`
- [x] `pnpm approve-builds` für `@serialport/bindings-cpp` — ohne die nativen
      Bindings crasht der OBD-Manager beim Import. Im Setup dokumentieren
- [x] 27 `any`-Casts abbauen, insbesondere `socket: any` in
      `websocketHandler.ts:118, 158, 194, 235, 268, 304`
- [x] `console.log` durch einen strukturierten Logger ersetzen (25 Vorkommen)

### 25. Assets `S`

- [x] `client/public/autoki-logo.png` — 938 KB für ein 40×40-Icon. Auf SVG oder
      optimiertes PNG umstellen
- [x] `client/public/autoki-hero-banner.png` — 1,69 MB, wird auf `Home.tsx` zweimal
      geladen (Zeile 47 und 97). Komprimieren, WebP anbieten, `loading="lazy"`

### 26. Dokumentation korrigieren `S`

- [x] `README.md` nennt `pnpm lint`, `pnpm db:studio`, `pnpm docker:build` — keines
      dieser Skripte existiert in `package.json`. Ergänzen oder aus dem README streichen
- [x] `.env.example` anlegen — Installationsschritt 3 im README (`cp .env.example .env`)
      schlägt aktuell fehl
- [x] README behauptet "Docker-ready" — es gibt kein Dockerfile
- [x] README nennt "OAuth 2.0" und "Rollen-basierte Zugriffskontrolle (User, Admin)"
      als Sicherheitsmerkmale; die Rollenprüfung wird außerhalb von
      `systemRouter.notifyOwner` nirgends verwendet
- [x] `todo.md` — Phase 3 und 4 als abgeschlossen markiert, obwohl Frontend und
      Backend nicht verbunden sind (siehe P1/6)
- [x] `package.json` — Lint-Setup ergänzen (ESLint fehlt komplett, nur Prettier vorhanden)

---

## Zusammenfassung

| Priorität | Themen | Einzelaufgaben |
|-----------|--------|----------------|
| P0 Sicherheit | 5 | 30 |
| P1 Kernfunktionalität | 5 | 30 |
| P2 Datenbank | 3 | 12 |
| P3 Bugs | 9 | 20 |
| P4 Hygiene | 4 | 20 |
| **Gesamt** | **26** | **112** |

Alle Punkte umgesetzt. Zwei Dinge, die beim Umsetzen dazukamen und nicht in der
ursprünglichen Liste standen:

- `tsconfig.json` setzte kein `target`, tsc nahm damit ES5 an und lehnte
  Iteration über `Map`/`Set` ab. Jetzt `ES2022`.
- `client/index.html` enthielt nicht aufgelöste `%VITE_*%`-Platzhalter, wodurch
  Favicon und Seitentitel im Browser kaputt waren. Jetzt feste Werte.

Offen geblieben und bewusst nicht angefasst:

- `vite-plugin-manus-runtime` schleust rund 360 kB Editor-Overlay in den
  Produktions-Build (`dist/public/index.html`). Das lässt sich auf den
  Entwicklungsmodus beschränken, könnte aber die Vorschau der Hosting-Plattform
  brechen — das ist eine Plattformentscheidung, keine Codequalitätsfrage.
- Die Helfer unter `server/_core/` (`map.ts`, `imageGeneration.ts`,
  `dataApi.ts`, `llm.ts`, `storage.ts`) werden von nichts aufgerufen. Sie
  gehören zur Template-Infrastruktur und wurden deshalb nicht entfernt.
