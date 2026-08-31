# Phase 2A Pruefbericht

Datum: 2026-07-26

## Ergebnis

Die getrennte Provider- und UI-Schicht `InpaAi.Copilot` wurde als
WinForms-Anwendung fuer .NET Framework 4.8 umgesetzt und mit den vorhandenen
lokalen Werkzeugen gebaut. Die Phase-1A-Bridge bleibt ein separater
x86-Prozess und wurde funktional nicht erweitert oder abgeschwaecht.

Der Release-Build, alle 9 Phase-1A-Tests, alle 45 fahrzeugfreien
Phase-2A-Tests sowie der UI- und Produktionsstart-Smoke-Test sind erfolgreich.
Die lokale Ollama-Verbindung und die Modellliste waren live erreichbar. Genau
ein lokaler Chatversuch mit einem bereits vorhandenen Modell lieferte innerhalb
des Testfensters keinen Chatinhalt; er wurde nicht wiederholt. Dieser
Live-Diagnoseschritt ist deshalb nicht als bestanden ausgewiesen.

## Sicherheitsgrenzen

- Keine Datei unter `C:\EDIABAS` oder `C:\EC-APPS` wurde veraendert.
- Keine INI-, Registry-, PATH-, Firewall-, Tailscale- oder
  Netzwerkfreigaben-Einstellung wurde geaendert.
- Keine DLL wurde ersetzt.
- Keine Software, kein SDK, kein Paket und kein Build-Werkzeug wurde
  installiert.
- Kein Modell wurde heruntergeladen, geloescht oder ueber eine
  Modellverwaltungs-API geladen.
- In Phase 2A lief kein TMODE-, MS43-, MS430DS0- oder Fahrzeugjob.
- Der Copilot hat an die Bridge ausschliesslich
  `{"command":"health"}` gesendet.
- Es wurde keine OpenAI-API, keine OpenAI-Bibliothek und kein
  `OPENAI_API_KEY` verwendet.
- Es wurde keine Verbindung zu `api.openai.com` aufgebaut. Der
  URL-Normalisierer weist `openai.com` und dessen Subdomains explizit ab.
- Keine realen Schluessel oder Tokens wurden angezeigt, gespeichert oder
  protokolliert.

Die vier geschuetzten Phase-1A-Dateien haben weiterhin dieselben SHA-256-Werte:

```text
C:\EDIABAS\Bin\EDIABAS.INI
11606DC5ACC838B332A898F5DD8B23965CCF822C61E76642309D3BBD59AB7A98

C:\EDIABAS\Bin\obd.ini
DDAF2C69A90D3B4896A964649790836248EDAEE731DEA15933868339430BC265

C:\EDIABAS\Bin\NET\4.0\apiNET32.dll
E5B66D123959BDB5F3F47D20B8674E25064F021E3535AD2B06E77B510D99878C

C:\EDIABAS\Bin\api32.dll
15265157215B814F44397DF49C9964448F5F0A9F8A02E1B432406C92E6215A48
```

## Gepruefte Umgebung

### Build-Werkzeuge

```text
Visual Studio / Build Tools: nicht installiert
vswhere.exe:                 nicht vorhanden
dotnet SDK:                  nicht vorhanden
MSBuild x86:                 C:\Windows\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe
MSBuild-Version:             4.8.9032.0
C#-Compiler x86:             C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe
Compiler-Version:            4.8.9232.0
.NET-Framework-Runtime:      4.8.1, Release 533320, x86 und x64
4.8-Targeting-Pack:          nicht installiert
4.8.1-Targeting-Pack/SDK:    installiert
```

`build.ps1` verwendet direkt den vorhandenen 32-Bit-Framework-Compiler. Es
findet kein Paket-Restore und kein Download statt. Die Projektmetadaten zielen
auf `.NET Framework 4.8`; der Quellcode verwendet nur dort vorhandene APIs.

### Provider und Netzwerk

```text
Ollama:
  Pfad:       C:\Users\CryptoHaus\AppData\Local\Programs\Ollama\ollama.exe
  Version:    0.17.4
  Root-GET:   http://127.0.0.1:11434 -> HTTP 200, "Ollama is running"
  /api/tags:  erreichbar, 1 Modell: qwen3:0.6b

LM Studio:
  Pfad:       C:\Users\CryptoHaus\AppData\Local\Programs\LM Studio\LM Studio.exe
  Version:    0.4.17-beta+2
  Root-GET:   http://127.0.0.1:1234 -> nicht erreichbar

lms CLI:
  Pfad:       C:\Users\CryptoHaus\.lmstudio\bin\lms.exe
  Version:    1.3.3, Commit 6041ae0

Tailscale:
  Pfad:       C:\Program Files\Tailscale\tailscale.exe
  Version:    1.98.2-taaf7caef1-gc4a37aed9
  Dienst:     Running, Automatic
  Status:     "tailscale status --json" lieferte keinen nutzbaren Status

OLLAMA_API_KEY:       nicht vorhanden
LM_STUDIO_API_TOKEN:  nicht vorhanden
```

Es wurde nur das Vorhandensein der Umgebungsvariablen geprueft. Ein Inhalt
wurde zu keinem Zeitpunkt ausgegeben.

## Architektur

`InpaAi.Copilot` und `InpaAi.Bridge` bleiben getrennte Prozesse. Beide
Release-Programme sind x86 gebaut; die Bridge meldete zur Laufzeit
`processBitness: 32`. Die Kommunikation ist lokal und besteht aus genau einer
JSON-Line-Anfrage und genau einer zugeordneten Antwort. stdout und stderr
werden getrennt gelesen.

Der Bridge-Client:

- hat den Request `{"command":"health"}` als Konstante,
- besitzt keine Eingabe fuer ECU, SGBD oder Job,
- serialisiert Zugriffe mit einem `SemaphoreSlim`,
- begrenzt stdout und stderr jeweils auf 65.536 Zeichen,
- behandelt fehlende Bridge, Timeout, Abbruch, Prozessfehler und mehrere
  Antwortzeilen,
- beendet einen nicht reagierenden Kindprozess und raeumt Ressourcen auch bei
  Fehlern auf.

Der Provider-Kern definiert eine gemeinsame `IAiProvider`-Schnittstelle fuer
Verbindungstest, Modellliste und Chat. Alle Aufrufe verwenden `Task` und
`CancellationToken`; die WinForms-Oberflaeche bleibt waehrend HTTP-Anfragen
bedienbar und bietet einen expliziten Abbruch.

## Verwendete Endpunkte

### Ollama lokal oder Tailscale

```text
Standard-Basisadresse: http://127.0.0.1:11434
Modelle:               GET  {baseUrl}/api/tags
Chat:                  POST {baseUrl}/api/chat
Streaming:             false
Authentifizierung:     keine erzwungen
```

### Ollama Cloud

```text
Feste Basisadresse:    https://ollama.com
Modelle:               GET  https://ollama.com/api/tags
Chat:                  POST https://ollama.com/api/chat
Streaming:             false
Authentifizierung:     Authorization: Bearer aus OLLAMA_API_KEY
```

Die Cloud-URL ist nicht editierbar und wird auch intern durch den
Provider-Adapter fest vorgegeben.

### LM Studio lokal oder Tailscale

```text
Standard-Basisadresse: http://127.0.0.1:1234
Modelle:               GET  {baseUrl}/v1/models
Chat:                  POST {baseUrl}/v1/chat/completions
Streaming:             false
Authentifizierung:     optionaler Bearer aus LM_STUDIO_API_TOKEN
```

Nur `http` und `https` sind zulaessig. Benutzerinformationen, Query und
Fragment in Basisadressen werden abgewiesen. Bereits angehaengte API-Pfade
werden entfernt, damit keine doppelten Endpunkte entstehen.
HTTP-Weiterleitungen und Cookies sind deaktiviert. Antworten sind auf 1 MiB
begrenzt, der einstellbare Timeout auf 1 bis 300 Sekunden.

## Bedienoberflaeche

Die WinForms-Oberflaeche enthaelt:

- Auswahl fuer Ollama lokal/Tailscale, Ollama Cloud und LM Studio
  lokal/Tailscale,
- editierbare Serveradresse fuer lokale oder entfernte Provider,
- feste, gesperrte Cloud-Adresse,
- Verbindungstest und Modellaktualisierung,
- ausschliesslich dynamisch gefuelltes Modell-Dropdown,
- Kennzeichnung als `LOCAL`, `TAILSCALE/REMOTE` oder `CLOUD`,
- Timeout-Auswahl,
- Testfrage, Analyse und Abbruch,
- getrennte Anzeigen fuer validierte Diagnose und Rohantwort,
- Status `Bereit`, `Laedt`, `Verbunden` oder `Fehler`,
- Bridge-Health-Status und manuelle Health-Pruefung,
- Auswahl und Laden aller fuenf SYNTHETIC-Testfaelle.

Der UI-Smoke-Test pruefte alle drei Provideroptionen, die feste Cloud-Adresse,
die leere initiale Modellliste, die fuenf synthetischen Faelle, die
Bedienelemente, das Layout und den Start der echten Release-Anwendung. Das
gerenderte Bild liegt unter:

```text
artifacts\Release\tests\InpaAi.Copilot.ui-smoke.png
```

## Konfiguration und Geheimnisse

`copilot-settings.json` wird neben der Anwendung abgelegt. Sowohl die
Produktions- als auch die Testdatei wurden geprueft:

```text
Gespeicherte Schluessel:
BaseUrl, ModelId, Provider, TimeoutSeconds

Unsichere Feldnamen: nein
Bearer-Inhalt:        nein
```

API-Schluessel, Tokens, Authorization-Header, Prompts, Modellantworten und
Fahrzeugdaten sind nicht Teil des Einstellungsmodells. Fehlermeldungen werden
vor der Anzeige gegen die zur Laufzeit vorhandenen Geheimnisse redigiert.

## KI-Diagnosevertrag

Der zentrale Systemprompt verlangt:

- ausschliessliche Verwendung der uebergebenen Messwerte,
- fehlende Werte als `nicht vorhanden`,
- keine erfundenen Sensorwerte, Fehlercodes, Grenzwerte oder
  Fahrzeugzustaende,
- getrennte Beobachtungen, moegliche Ursachen und naechste Pruefschritte,
- gekennzeichnete Unsicherheit,
- keine Schreib-, Loesch-, Reset-, Codier- oder Aktorvorschlaege,
- einen deutlichen Hinweis, dass SYNTHETIC-Daten keine echte
  Fahrzeugdiagnose sind.

Die Antwort muss genau diese Pflichtfelder enthalten:

```json
{
  "summary": "string",
  "severity": "info | warning | critical | unknown",
  "observations": ["string"],
  "possibleCauses": ["string"],
  "nextChecks": ["string"],
  "limitations": ["string"]
}
```

Ungueltiges JSON, fehlende Felder, falsche Typen und ungueltige
Schweregrade werden als Parserfehler behandelt. Fehlende Inhalte werden nicht
erfunden; die unveraenderte Rohantwort bleibt separat sichtbar.

## SYNTHETIC-Testdaten

Folgende eindeutig kuenstliche Datensaetze wurden angelegt:

```text
synthetic-normal                 unauffaelliger Datensatz
synthetic-coolant-high           erhoehte Kuehlmitteltemperatur
synthetic-fuel-trim-idle         positive Gemischkorrektur nur im Leerlauf
synthetic-incomplete             unvollstaendiger Datensatz
synthetic-contradictory          widerspruechlicher Datensatz
```

Jede Fixture enthaelt eine explizite `SYNTHETIC`-Kennzeichnung. Der
unvollstaendige Datensatz benennt fehlende Werte; der widerspruechliche
Datensatz benennt den Widerspruch.

## Build- und Testergebnis

```text
Release-Build:                  bestanden
Bridge PE:                      I386, 32BITREQUIRED
Copilot PE:                     I386, 32BITREQUIRED
Phase-1A-Tests:                 9 bestanden, 0 fehlgeschlagen
Phase-2A-Tests:                 45 bestanden, 0 fehlgeschlagen
UI-/Produktionsstart-Smoke:     bestanden
Verbleibende InpaAi-Prozesse:   keine
```

Die 45 Phase-2A-Tests decken ab:

- Provider-Auswahl und URL-Normalisierung,
- Ollama- und LM-Studio-Modell- und Chat-Fixtures,
- fehlende und ungueltige Providerfelder,
- Diagnoseantwort-Validierung und Erhalt der Rohantwort,
- Secret-Redaction und sichere Konfiguration,
- festes Bridge-Health-Protokoll mit echter und Fake-Bridge,
- Bridge-Timeout, Abbruch, fehlende Datei und zusaetzliche Antwortzeile,
- korrekte Endpunkte und `stream: false`,
- feste Ollama-Cloud-Adresse und fehlenden Cloud-Schluessel,
- optionales LM-Studio-Token,
- HTTP 401/403, leere Modellliste und unbekanntes Modell,
- maximale Antwortgroesse, Provider-Timeout und Abbruch,
- alle fuenf synthetischen Diagnosefaelle.

Alle automatisierten HTTP-Tests verwenden lokale Fixtures und einen
In-Process-Fake. Sie senden keine Cloudanfrage.

## Bridge-Health-Ergebnis

Die abschliessende direkte Health-Anfrage lieferte exakt:

```json
{"success":true,"command":"health","ecu":null,"job":null,"durationMs":115,"results":{"processBitness":32,"ediabasBinPath":"C:\\EDIABAS\\Bin","ecuPath":"C:\\EDIABAS\\ECU","mode":"TMODE_ONLY"},"error":null}
```

`durationMs` ist ein Messwert und aendert sich zwischen Laeufen. Diese Anfrage
initialisiert kein EDIABAS-SGBD und fuehrt keinen TMODE-Job aus.

## Tatsaechliche Liveanfragen

### Ollama lokal

Durchgefuehrt:

```text
GET  http://127.0.0.1:11434
  Ergebnis: HTTP 200, "Ollama is running"

GET  http://127.0.0.1:11434/api/tags
  Ergebnis: 1 Modell, qwen3:0.6b

Provider-Verbindungstest:
  Ergebnis: verbunden

Modellaktualisierung:
  Ergebnis: Dropdown mit qwen3:0.6b gefuellt

POST http://127.0.0.1:11434/api/chat
  Anzahl:       exakt 1
  Modell:       qwen3:0.6b, bereits vorhanden
  Testfall:     synthetic-normal
  Ergebnis:     kein Chatinhalt innerhalb des rund 36-sekuendigen Testlaufs
  Runner:       Exitcode 1, "provider returned no chat content"
  Wiederholung: keine
```

Der eine Chatversuch kombinierte die kurze harmlose Anfrage mit dem
SYNTHETIC-Normalfall. Weil keine Modellantwort vorlag, konnte die
Diagnose-JSON-Validierung live nicht abgeschlossen werden. Die betreffende
Parser- und Diagnosefunktion ist durch lokale Fixtures abgedeckt. Es wurde
keine weitere Modellanfrage gestartet.

### Nicht durchgefuehrte Live-Tests

```text
LM Studio:
  Kein Live-Test, da http://127.0.0.1:1234 nicht erreichbar war.
  Der Dienst wurde nicht gestartet oder konfiguriert.

Ollama Cloud:
  Kein Live-Test, da OLLAMA_API_KEY nicht vorhanden war.
  Es wurde keine Anmeldung und keine Cloudanfrage ausgeloest.

LM-Studio-Token:
  Kein Auth-Test, da LM_STUDIO_API_TOKEN nicht vorhanden war.

Tailscale-Provider:
  Kein Remote-Endpunkt vorgegeben und kein nutzbarer Tailscale-Backendstatus.
  Es wurde keine Tailscale-Einstellung geaendert.

Live-Diagnose-JSON:
  Nicht validierbar, weil der einmalige lokale Chatversuch keinen Inhalt
  lieferte. Kein Retry gemaess der Begrenzung auf eine harmlose Anfrage.
```

## Dateien

### Geaendert

```text
build.ps1
InpaAi.Bridge.sln
README.md
```

Die vorhandenen Phase-1A-Quelldateien und ihre Allowlist wurden nicht
veraendert.

### Neu

```text
PHASE-2A-REPORT.md

src\InpaAi.Copilot\App.config
src\InpaAi.Copilot\AssemblyInfo.cs
src\InpaAi.Copilot\BaseUrlNormalizer.cs
src\InpaAi.Copilot\BridgeHealthClient.cs
src\InpaAi.Copilot\DiagnosisContract.cs
src\InpaAi.Copilot\HttpProviderBase.cs
src\InpaAi.Copilot\InpaAi.Copilot.csproj
src\InpaAi.Copilot\JsonObject.cs
src\InpaAi.Copilot\LmStudioProvider.cs
src\InpaAi.Copilot\MainForm.cs
src\InpaAi.Copilot\OllamaProvider.cs
src\InpaAi.Copilot\Program.cs
src\InpaAi.Copilot\ProviderContracts.cs
src\InpaAi.Copilot\ProviderFactory.cs
src\InpaAi.Copilot\SafeSettingsStore.cs
src\InpaAi.Copilot\SecretRedactor.cs
src\InpaAi.Copilot\SyntheticCaseRepository.cs

fixtures\provider\lmstudio-chat.json
fixtures\provider\lmstudio-models.json
fixtures\provider\ollama-chat.json
fixtures\provider\ollama-tags.json
fixtures\synthetic\01-unauffaellig.json
fixtures\synthetic\02-kuehlmitteltemperatur-erhoeht.json
fixtures\synthetic\03-gemischkorrektur-leerlauf.json
fixtures\synthetic\04-unvollstaendig.json
fixtures\synthetic\05-widerspruechlich.json

tests\Fixtures\FakeBridge.cs
tests\InpaAi.Copilot.Tests\InpaAi.Copilot.Tests.csproj
tests\InpaAi.Copilot.Tests\TestProgram.cs
tests\InpaAi.Copilot.UiSmoke\InpaAi.Copilot.UiSmoke.csproj
tests\InpaAi.Copilot.UiSmoke\UiSmokeProgram.cs
tests\InpaAi.Copilot.LiveSmoke\InpaAi.Copilot.LiveSmoke.csproj
tests\InpaAi.Copilot.LiveSmoke\LiveSmokeProgram.cs
```

### Generierte Release-Artefakte

```text
artifacts\Release\bridge\apiNET32.dll
artifacts\Release\bridge\InpaAi.Bridge.exe
artifacts\Release\bridge\InpaAi.Bridge.exe.config
artifacts\Release\bridge\InpaAi.Bridge.pdb

artifacts\Release\copilot\copilot-settings.json
artifacts\Release\copilot\InpaAi.Copilot.exe
artifacts\Release\copilot\InpaAi.Copilot.exe.config
artifacts\Release\copilot\InpaAi.Copilot.pdb
artifacts\Release\copilot\fixtures\synthetic\*.json

artifacts\Release\tests\apiNET32.dll
artifacts\Release\tests\copilot-settings.json
artifacts\Release\tests\InpaAi.Bridge.exe
artifacts\Release\tests\InpaAi.Bridge.Tests.exe
artifacts\Release\tests\InpaAi.Bridge.Tests.exe.config
artifacts\Release\tests\InpaAi.Bridge.Tests.pdb
artifacts\Release\tests\InpaAi.Copilot.exe
artifacts\Release\tests\InpaAi.Copilot.Tests.exe
artifacts\Release\tests\InpaAi.Copilot.Tests.exe.config
artifacts\Release\tests\InpaAi.Copilot.Tests.pdb
artifacts\Release\tests\InpaAi.Copilot.UiSmoke.exe
artifacts\Release\tests\InpaAi.Copilot.UiSmoke.exe.config
artifacts\Release\tests\InpaAi.Copilot.UiSmoke.pdb
artifacts\Release\tests\InpaAi.Copilot.LiveSmoke.exe
artifacts\Release\tests\InpaAi.Copilot.LiveSmoke.exe.config
artifacts\Release\tests\InpaAi.Copilot.LiveSmoke.pdb
artifacts\Release\tests\InpaAi.FakeBridge.exe
artifacts\Release\tests\InpaAi.FakeBridge-Hang.exe
artifacts\Release\tests\InpaAi.FakeBridge-Extra.exe
artifacts\Release\tests\InpaAi.FakeBridge.pdb
artifacts\Release\tests\InpaAi.Copilot.ui-smoke.png
artifacts\Release\tests\fixtures\provider\*.json
artifacts\Release\tests\fixtures\synthetic\*.json
```

## Startanleitung

Build:

```powershell
.\build.ps1 -Configuration Release
```

Copilot starten:

```powershell
.\artifacts\Release\copilot\InpaAi.Copilot.exe
```

Offline-Tests:

```powershell
.\artifacts\Release\tests\InpaAi.Bridge.Tests.exe
.\artifacts\Release\tests\InpaAi.Copilot.Tests.exe
.\artifacts\Release\tests\InpaAi.Copilot.UiSmoke.exe
```

Fuer Ollama Cloud muss `OLLAMA_API_KEY` bereits in der Prozessumgebung
vorhanden sein. Fuer LM Studio ist `LM_STUDIO_API_TOKEN` optional. Beide Werte
werden weder in der Anwendung eingegeben noch gespeichert.

Phase 2A endet hier. MS43, Liveueberwachung, Spracheingabe und automatisierte
Fahrzeugaktionen sind nicht Bestandteil dieser Umsetzung.
