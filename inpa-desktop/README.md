# INPA AI Copilot

Das Projekt besteht aus zwei getrennten lokalen Prozessen:

- `InpaAi.Bridge`: x86/.NET Framework 4.8, JSON-Lines ueber stdin/stdout
- `InpaAi.Copilot`: x86/.NET Framework 4.8, WinForms-Oberflaeche

Die Bridge behaelt ihre feste Phase-1A-Allowlist und erweitert sie in Phase 2C
um 68 exakt gebundene Read-only-Discovery-Befehle. Der Copilot kann weiterhin
keine SGBD- oder Jobnamen uebergeben: Er sendet nur einen festen Befehlsnamen,
den die Bridge nochmals gegen SGBD, PRG-Hash, Job, leere Argumente und Timeout
prueft. Eine generische Jobausfuehrung existiert nicht.

## Architektur

```text
WinForms Copilot
  |-- HTTP(S) --> gewaehlter KI-Provider
  |
  `-- stdin/stdout --> separater InpaAi.Bridge-Prozess
                        |-- Start: nur {"command":"health"}
                        `-- Phase 2C: ein fester Discovery-Befehl je Probe
```

Es gibt keinen lokalen Webserver, keinen Netzwerk-Listener und keine
OpenAI-Integration. Providerzugriffe laufen asynchron, sind abbrechbar und
haben einen einstellbaren Timeout. HTTP-Weiterleitungen und Cookies sind
deaktiviert; Antworten sind standardmaessig auf 1 MiB begrenzt.

## Phase 2C Discovery

Das feste Manifest `2C.2` enthaelt 68 statisch belegte E46-Proben. Es erlaubt
nur `IDENT_AIF` fuer `MS430DS0`, `IDENT` fuer die belegten SGBDs und den
explizit als Seriennummer-Lesejob belegten `CDC/SER_NR_DOM_LESEN`. Jede
installierte PRG wird vor einer Probe gegen ihren fest hinterlegten SHA-256-
Wert geprueft. Diagnoseadressen wurden nicht geraten und bleiben deshalb leer.

Die Proben laufen streng sequenziell. Nur `NoResponse` darf genau einmal
wiederholt werden. Die Zeilenzustaende sind:

```text
NotChecked, Reachable, NoResponse, UnsupportedProbe,
SgbdError, TransportError, Cancelled
```

Antwortet keine verifizierte Probe, zeigt die Anwendung
`Fahrzeugverbindung konnte nicht bestaetigt werden`. Das wird nicht als
Fahrzeug mit null Steuergeraeten interpretiert.

Das dynamische Fahrzeugprofil wird nur fuer die aktuelle Sitzung gehalten.
Eine sicher gelesene 17-stellige VIN bindet dieses Profil; eine andere VIN
ersetzt es. Nur bestaetigte Steuergeraete gelangen in KI-Kontext,
Sprachsteuerungsmenge und Diagnosegruppen. Es gibt keinen periodischen
Hintergrundscan. Nach dem fahrzeugfreien Start-Healthcheck beginnt Discovery
nur durch `Erneut pruefen`.

Statischer Nachweis und Offline-Ergebnisbericht:

```text
docs\e46-discovery-static-evidence.md
PHASE-2C-OFFLINE-REPORT.md
```

## Phase 2B Offline

Die spaetere MS43-Anbindung ist ausschliesslich als statisches Datenmodell
vorbereitet:

```text
config\ms43-profile.offline.json
  profileState:     OFFLINE_ONLY
  runtimeVerified:  false
  executionEnabled: false
  SGBD:             MS430DS0
```

Das Profil enthaelt 36 statisch belegte Kandidatenjobs und 53 direkt aus
`MS430.IPO` zugeordnete Ergebnisfelder. Es ist keine Bridge-Allowlist.
Der Profil-Loader verwirft jedes Profil mit aktiviertem Ausfuehrungsflag.
`OfflineExecutionPolicy` kann fuer ein solches Profil keine Bridge-Anfrage
erzeugen.

Der vollstaendige Katalog mit IPO-Offsets, Einheiten und Quellen liegt unter:

```text
docs\ms43-static-catalog.md
docs\ms43-prg-jobs.txt
docs\ms43-ipo-strings.txt
```

Die Evidence-Dateien koennen rein statisch neu erzeugt werden:

```powershell
.\tools\Export-Ms43StaticEvidence.ps1
```

Das Skript liest nur `MS430.IPO` und `ms430ds0.prg`. Es fuehrt keinen
EDIABAS-Job aus.

## Diagnose-Datenvertrag

Das neutrale Schema steht in
`schemas\diagnostic-data-contract.schema.json`. Pflichtfelder sind:

```text
schemaVersion, source, dataMode, vehicleProfile, ecu, job,
capturedAtUtc, durationMs, values, missingFields, errors, runtimeVerified
```

Jeder Messwert enthaelt `rawFieldName`, `normalizedName`, `value`, `unit`,
`validity`, `sourceJob` und `mappingStatus`. Unbekannte Ergebnisfelder bleiben
mit unveraendertem Namen und Wert als `unmapped` erhalten. Fehlende Werte
werden nicht durch `0`, `false` oder andere Ersatzwerte aufgefuellt.

Lokale Diagnose-JSON-Dateien koennen in der UI importiert werden.
`LIVE` ohne `runtimeVerified: true`, falsche Einheiten, unpassende Jobs,
typfalsche numerische Werte und manipulierte Profile werden abgewiesen.
Der bisherige allgemeine Fahrzeugzugriff bleibt weiterhin deaktiviert und mit
`Fahrzeugtest noch nicht freigegeben` beschriftet. Phase 2C schaltet nur die
festen Identifikationsproben frei, sobald ein Live-Test ausdruecklich bestaetigt
wurde.

## Provider

### Ollama lokal oder Tailscale

Standardadresse: `http://127.0.0.1:11434`

```text
GET  {baseUrl}/api/tags
POST {baseUrl}/api/chat
```

### Ollama Cloud

Feste Adresse: `https://ollama.com`

```text
GET  https://ollama.com/api/tags
POST https://ollama.com/api/chat
```

Die Authentifizierung wird ausschliesslich zur Laufzeit aus
`OLLAMA_API_KEY` gelesen. Die Cloud-Adresse kann nicht geaendert werden.

### LM Studio lokal oder Tailscale

Standardadresse: `http://127.0.0.1:1234`

```text
GET  {baseUrl}/v1/models
POST {baseUrl}/v1/chat/completions
```

Ein optionales Token wird ausschliesslich zur Laufzeit aus
`LM_STUDIO_API_TOKEN` gelesen. Das Nachrichtenformat ist nur das lokale
LM-Studio-Protokoll; Hosts unter `openai.com` werden explizit abgewiesen.

Bei beiden Chat-Protokollen ist `stream` weiterhin immer `false`.
Modellkennungen werden nicht einprogrammiert, sondern nur aus der aktuellen
Provider-Modellliste uebernommen.

## Sichere Konfiguration

`copilot-settings.json` liegt neben `InpaAi.Copilot.exe` und enthaelt nur:

```text
Provider
BaseUrl
ModelId
TimeoutSeconds
```

API-Schluessel, Tokens, Prompts, Modellantworten und Fahrzeugdaten werden
nicht gespeichert. Geheimnisse muessen dem gestarteten Prozess bereits als
Umgebungsvariablen vererbt worden sein; die Anwendung zeigt oder protokolliert
ihren Inhalt nicht.

## Build

Es wird nichts installiert oder wiederhergestellt. `build.ps1` verwendet den
bereits installierten 32-Bit-.NET-Framework-Compiler.

```powershell
.\build.ps1 -Configuration Release
```

Wichtige Ausgaben:

```text
artifacts\Release\bridge\InpaAi.Bridge.exe
artifacts\Release\copilot\InpaAi.Copilot.exe
artifacts\Release\tests\InpaAi.Bridge.Tests.exe
artifacts\Release\tests\InpaAi.Copilot.Tests.exe
artifacts\Release\tests\InpaAi.Copilot.UiSmoke.exe
```

Auf diesem Rechner ist .NET Framework 4.8.1 samt 4.8.1-Referenzpaket
installiert, jedoch nicht das separate 4.8-Targeting-Pack. Der paketfreie
Build verwendet deshalb den installierten Framework-Compiler und nur APIs,
die bereits in .NET Framework 4.8 vorhanden sind.

## Start

Nach einem erfolgreichen Release-Build:

```powershell
.\artifacts\Release\copilot\InpaAi.Copilot.exe
```

Die Bridge wird relativ zum Copilot unter
`artifacts\Release\bridge\InpaAi.Bridge.exe` gesucht. Beim Start prueft der
Copilot nur `health`; die Discovery startet nicht automatisch.
Providerverbindungen, Modellabfragen und Discovery erfolgen erst nach einer
Benutzeraktion.

## Offline-Tests

```powershell
.\artifacts\Release\tests\InpaAi.Bridge.Tests.exe
.\artifacts\Release\tests\InpaAi.Copilot.Tests.exe
.\artifacts\Release\tests\InpaAi.Copilot.UiSmoke.exe
.\artifacts\Release\tests\InpaAi.Copilot.Tests.exe --discovery-dry-run
```

Die Provider-Tests verwenden lokale JSON-Fixtures und einen In-Process-
HTTP-Handler. Der Bridge-Prozesstest verwendet eine lokale Fake-Bridge. Die
sechs gueltigen Diagnosefaelle unter `fixtures\synthetic` sind ausdruecklich als
`SYNTHETIC` markiert und stellen keine Daten eines realen Fahrzeugs dar.

Der vollstaendige Phase-2C-Nachweis steht in
`PHASE-2C-OFFLINE-REPORT.md`. Die Berichte der Phasen 1A, 2A und 2B bleiben
erhalten.

## Phase-1A-Bridge direkt verwenden

Die urspruengliche Phase-1A-Teilmenge der festen Bridge-Allowlist bleibt
erhalten:

```text
health
tmode-info                -> TMODE / INFO
tmode-initialisierung     -> TMODE / INITIALISIERUNG
```

Beispiel fuer den fahrzeugfreien Status:

```powershell
'{"command":"health"}' | .\artifacts\Release\bridge\InpaAi.Bridge.exe
```

Jede Anfrage erzeugt genau eine JSON-Antwortzeile auf stdout.
Diagnosemeldungen gehen ausschliesslich an stderr.
