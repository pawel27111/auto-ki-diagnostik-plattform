# Phase 2B Offline Pruefbericht

Datum: 2026-07-26

## Ergebnis

Die spaetere lesende MS43-Anbindung wurde vollstaendig offline vorbereitet,
ohne sie in der Bridge zu aktivieren.

Umgesetzt wurden:

- statische Evidence-Exporte fuer `MS430.IPO` und `ms430ds0.prg`,
- ein maschinenlesbares, technisch gesperrtes `OFFLINE_ONLY`-Profil,
- ein neutraler Diagnose-Datenvertrag mit strikter Validierung,
- zentrale Feldnormalisierung mit Erhalt unbekannter Felder,
- eine WinForms-Katalogansicht mit vollstaendiger Quellenanzeige,
- lokaler Diagnose-JSON-Import mit SYNTHETIC/LIVE-Trennung,
- sechs gueltige SYNTHETIC-Fixtures und vier negative Sicherheits-Fixtures,
- Bridge-, Copilot-, Vertrags- und UI-Regressionstests.

Der vollstaendige `Debug|x86`-Build ist erfolgreich. Es bestanden:

```text
Bridge-Tests:                 14 bestanden, 0 fehlgeschlagen
Copilot-/Vertragstests:       63 bestanden, 0 fehlgeschlagen
UI-/Produktionsstart-Smoke:   bestanden
Live-Provider-Tests:          nicht ausgefuehrt
EDIABAS-Jobs:                 0
Fahrzeugkontakte:             0
```

## Verbindliche Sicherheitsbestaetigungen

- Kein EDIABAS-Job wurde ausgefuehrt, auch kein TMODE-Job.
- `MS430DS0` wurde nicht ueber `apiNET32.dll`, `api32.dll`, Tool32, INPA oder
  eine andere Laufzeitschnittstelle geladen oder angesprochen.
- Es bestand kein Kontakt zu einem Fahrzeug oder Steuergeraet.
- Die produktive Bridge-Allowlist wurde nicht geaendert.
- Die Bridge unterstuetzt weiterhin ausschliesslich:

```text
health
tmode-info                -> TMODE / INFO
tmode-initialisierung     -> TMODE / INITIALISIERUNG
```

- Der Copilot-Bridge-Client sendet weiterhin ausschliesslich die Konstante
  `{"command":"health"}`.
- Es wurde keine MS43-, `IDENT`- oder `STATUS_*`-Bridge-Funktion implementiert.
- Es wurde kein aktivierbarer Fahrzeugzugriff in die UI aufgenommen.
- Es wurden keine KI-Provider-Liveanfragen ausgefuehrt.
- Es wurde keine Software und kein Paket installiert.
- Keine INI-, Registry-, PATH-, COM-Port-, Netzwerk- oder
  Tailscale-Konfiguration wurde geaendert.
- Keine Datei unter `C:\EDIABAS` oder `C:\EC-APPS` wurde veraendert.

## Ausgewertete Dateien und Hashes

### Primaere Quellen

```text
C:\EC-APPS\INPA\SGDAT\MS430.IPO
Groesse: 77.453 Bytes
SHA-256: 2D38A88D25AC83DA6C4D155A92A3F95565EBCBE9BE2F33F7EBC96F0B101D4585

C:\EDIABAS\ECU\ms430ds0.prg
Groesse: 935.963 Bytes
SHA-256: 8C4714D638DE8E9D765A86EEC9746495883366D21126A454AB2EF28279E3A523
```

Diese Hashes waren vor und nach der Arbeit identisch.

### Ergaenzend inventarisiert

```text
C:\EC-APPS\INPA\SGDAT\MS430.ini
42847B61E1B4CDE31CFAB818C3E9B4B4672146BA4D55644DC1F6A4BF56F71680

C:\EC-APPS\INPA\SGDAT\MS430_N.ini
7712CB8DF7BCC1CE1DD7A3C27307D2D50A4C895C29B7715DFCE0429726E4C9D3

C:\EC-APPS\INPA\SGDAT\Ms430_N.ipo
81E2AE948B1C8C6FD047E6C5942BC964DC0F459E853177726DA9517FAB624C10

C:\EC-APPS\INPA\SGDAT\ms430ds0.prg
8C4714D638DE8E9D765A86EEC9746495883366D21126A454AB2EF28279E3A523

C:\EDIABAS\EnglishEcu\ms430ds0.prg
8C4714D638DE8E9D765A86EEC9746495883366D21126A454AB2EF28279E3A523
```

Die drei vorhandenen `ms430ds0.prg`-Kopien sind bytegleich. `MS430.ini`
enthaelt nur den lokalen INPA-Bildschirmzustand mit 41 Screen-Namen und wurde
nicht als Job-/Felddatenquelle verwendet. Die aeltere `_N`-Variante wurde
inventarisiert, aber nicht mit dem angeforderten `MS430.IPO` vermischt.

### Geschuetzte Phase-1A-Dateien

Auch diese Hashes blieben unveraendert:

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

## Statische Analysewerkzeuge

Verwendet wurden ausschliesslich:

```text
C:\EDIABAS\Bin\bestinfo.exe
BESTINFO-Version: 7.3.0
Aufruf: bestinfo.exe -Q C:\EDIABAS\ECU\ms430ds0.prg

PowerShell Get-FileHash
PowerShell Format-Hex
Eigener CP1252-Stringexport mit Dateioffsets
rg und read-only Dateizugriffe fuer Quellcodeabgleich
```

Das reproduzierbare Skript liegt unter:

```text
tools\Export-Ms43StaticEvidence.ps1
```

Es schreibt nur in `docs` innerhalb des Projekts. `bestinfo` wurde
ausschliesslich zur statischen PRG-Jobauflistung verwendet. Ein Versuch,
`bestinfo` auf die IPO anzuwenden, lieferte keine Ausgabe und wurde nach dem
Timeout beendet; danach lief kein `bestinfo`-Prozess mehr. Die IPO wurde
daraufhin direkt als Datei ausgewertet.

Generierte Evidence:

```text
docs\ms43-prg-jobs.txt
docs\ms43-ipo-strings.txt
docs\ms43-static-catalog.md
```

## Verknuepfung zwischen IPO und PRG

Die IPO enthaelt bei Offset `0x9D14` die SGBD-Zeichenkette `MS430DS0`.
Die Anzeigeabschnitte enthalten danach wiederholt direkt aufeinanderfolgend:

```text
Anzeigebezeichnung
Einheit
STATUS_*-Job
OKAY
STAT_*-Ergebnisfeld
Darstellungsparameter
```

Beispiel Motordrehzahl:

```text
0xCC46  Motordrehzahl
0xCC5B  [1/min]
0xCC64  STATUS_MOTORDREHZAHL
0xCC84  STAT_MOTORDREHZAHL_WERT
```

Jeder der 36 Kandidatenjobs ist zusaetzlich im `bestinfo`-Inventar der
gehashten `ms430ds0.prg` enthalten. Damit ist die IPO-zu-PRG-Verknuepfung
statisch belegt. Eine Laufzeitbestaetigung fand nicht statt.

`bestinfo` meldet fuer die PRG:

```text
BIP-Version:      05.07.00
Revision:         2.0
Jobs gesamt:      230
STATUS_*-Jobs:    119
STEUERN_*-Jobs:   52
```

Das vollstaendige Inventar mit allen Schreib-, Loesch-, Adaptions- und
Aktorjobs steht in `docs\ms43-prg-jobs.txt`. Diese Namen sind nur Evidence und
keine Freigabe.

## Statisch bestaetigte Kandidatenjobs

```text
IDENT
STATUS_UBATT
STATUS_GESCHWINDIGKEIT
STATUS_MOTORDREHZAHL
STATUS_ZUENDWINKEL
STATUS_MOTORTEMPERATUR
STATUS_KUEHLW_AUSL_TEMPERATUR
STATUS_AN_LUFTTEMPERATUR
STATUS_OEL_TEMPERATUR
STATUS_LMM_MASSE
STATUS_EINSPRITZZEIT
STATUS_LL_INTEGRATOR
STATUS_LL_STELLER_TV
STATUS_KLOPF_ADC1
STATUS_KLOPF_ADC2
STATUS_PWG1_WINKEL
STATUS_PWG_POTI_SPANNUNG
STATUS_DKP_WINKEL
STATUS_MDK_POTI_SPANNUNG
STATUS_VANOS_NW_LAGE_IST_SOLL_REF_EINLASS
STATUS_VANOS_NW_LAGE_IST_SOLL_REF_AUSLASS
STATUS_VANOS_NW_FLANKENADAPTION
STATUS_L_SONDE
STATUS_L_SONDE_H
STATUS_L_SONDE_2
STATUS_L_SONDE_2_H
STATUS_LS_VKAT_HEIZUNG_TV_1
STATUS_LS_VKAT_HEIZUNG_TV_2
STATUS_LS_NKAT_HEIZUNG_TV_1
STATUS_LS_NKAT_HEIZUNG_TV_2
STATUS_INT
STATUS_INT_2
STATUS_LAMBDA_ADD_1
STATUS_LAMBDA_ADD_2
STATUS_LAMBDA_MUL_1
STATUS_LAMBDA_MUL_2
```

`readOnlyCandidate: true` bedeutet nur, dass Name und passive Anzeigelogik
statisch belegt sind. Es bedeutet nicht, dass der Job bereits fuer eine
Fahrzeugausfuehrung freigegeben ist.

## Bestaetigte Ergebnisfelder

Der Katalog enthaelt 53 eindeutige Zuordnungen in 14 belegten Gruppen.
Der vollstaendige Eintrag je Feld mit SGBD, Job, normalisiertem Namen,
Datentypstatus, Einheit, IPO-Offets, Quelle, Verifikationsstatus und Notizen
steht in `docs\ms43-static-catalog.md`.

Kompakte Uebersicht:

```text
Bordspannung
  STATUS_UBATT -> STAT_UBATT_WERT [Volt]

Fahrgeschwindigkeit
  STATUS_GESCHWINDIGKEIT -> STAT_GESCHWINDIGKEIT_WERT [km/h]

Motordrehzahl
  STATUS_MOTORDREHZAHL -> STAT_MOTORDREHZAHL_WERT [1/min]

Kuehlmitteltemperatur
  STATUS_MOTORTEMPERATUR -> STAT_MOTORTEMPERATUR_WERT [degree C]
  STATUS_KUEHLW_AUSL_TEMPERATUR
    -> STAT_KUEHLW_AUSL_TEMPERATUR_WERT [degree C]

Temperaturen
  STATUS_AN_LUFTTEMPERATUR -> STAT_AN_LUFTTEMPERATUR_WERT [degree C]
  STATUS_OEL_TEMPERATUR -> STAT_OEL_TEMPERATUR_WERT [degree C]

Luftmasse
  STATUS_LMM_MASSE -> STAT_LMM_MASSE_WERT [kg/h]

Zuendung
  STATUS_ZUENDWINKEL -> STAT_ZUENDWINKEL_WERT [degree KW]

Einspritzung
  STATUS_EINSPRITZZEIT -> STAT_EINSPRITZZEIT_WERT [ms]

Leerlauf
  STATUS_LL_INTEGRATOR -> STAT_LL_INTEGRATOR_WERT [%]
  STATUS_LL_STELLER_TV -> STAT_LL_STELLER_TV_WERT [%]

Klopfsensoren
  STATUS_KLOPF_ADC1 -> STAT_KLOPF_ADC1_WERT [V]
  STATUS_KLOPF_ADC2 -> STAT_KLOPF_ADC2_WERT [V]

Drosselklappe
  STATUS_PWG1_WINKEL -> STAT_PWG1_WINKEL_WERT [degree PWG]
  STATUS_PWG_POTI_SPANNUNG -> STAT_PWG_POTI_SPANNUNG_1_WERT [V]
  STATUS_PWG_POTI_SPANNUNG -> STAT_PWG_POTI_SPANNUNG_2_WERT [V]
  STATUS_DKP_WINKEL -> STAT_DKP_WINKEL_WERT [degree DK]
  STATUS_MDK_POTI_SPANNUNG -> STAT_MDK_POTI_SPANNUNG_1_WERT [V]
  STATUS_MDK_POTI_SPANNUNG -> STAT_MDK_POTI_SPANNUNG_2_WERT [V]

VANOS
  3 Einlassfelder: IST, SOLL, REF [Grad KW]
  3 Auslassfelder: IST, SOLL, REF [Grad KW]
  2 Flankenadaptionsfelder: Einlass, Auslass [Grad KW]

Lambda/Gemischadaption
  4 Sondenspannungen vor/nach Kat., Bank 1/2 [V]
  4 Heiztastverhaeltnisse vor/nach Kat., Bank 1/2 [%]
  2 Lambdaintegratoren [%]
  2 additive Adaptionswerte [ms]
  2 multiplikative Adaptionswerte [%]

Identifikation
  ID_BMW_NR, ID_COD_INDEX, ID_HW_NR, ID_DIAG_INDEX, ID_BUS_INDEX,
  ID_DATUM_KW, ID_DATUM_JAHR, ID_LIEF_NR, ID_SW_NR, ID_AI_NR,
  ID_PROD_NR
```

Bei numerischen IPO-Anzeigen steht `dataType: numeric-display`. Das belegt nur
die numerische Darstellungslogik der IPO, nicht den tatsaechlichen
EDIABAS-Transporttyp wie REAL, LONG oder TEXT. Fuer Identifikationsfelder sind
Datentyp und Einheit daher `null`.

## Offene oder nicht sicher zuordenbare Felder

Bewusst nicht in das Kandidatenprofil aufgenommen wurden:

- Digitalstatusfelder aus `STATUS_DIGITAL`, weil zusammengesetzte Listen und
  Einzelanzeigen teilweise abweichende Namen enthalten, zum Beispiel
  `STAT_SCHUB_AB_EIN` gegen `STAT_SCHUBAB_EIN`.
- Lastwerte, weil in der ausgewerteten IPO keine sichere Job/Feld-Sequenz fuer
  `STATUS_LAST` sichtbar war.
- Laufunruhe-, DMTL-, Sondenheizungs-Systemcheck-, VANOS-Verstellzeit- und
  Dichtheitsergebnisse, weil sie in Systemtestbildschirmen stehen und ohne
  Laufzeitbeleg nicht als passive Momentanwerte eingestuft werden.
- Felder aus Ansteuer- und Schreibbildschirmen, auch wenn dort einzelne
  `STATUS_*`-Abfragen zur Anzeige auftauchen.
- AIF- und Abgasvariantenfelder, weil sie nicht fuer den geplanten
  Messwertvertrag erforderlich sind und ihr Laufzeittyp offen ist.

Das PRG-Ergebnisformat wurde nicht ueber die EDIABAS-API abgefragt. Deshalb
bleiben fuer alle Kandidaten offen:

- tatsaechlicher EDIABAS-Datentyp,
- Laufzeitvorhandensein des Ergebnisfelds,
- exakte Skalierung und Rundung,
- Verhalten bei Motor aus, Zuendung aus oder nicht unterstuetzter Variante,
- Ergebnisstatus und Fehlerverhalten.

Es wurden keine fehlenden Informationen ergaenzt oder geraten.

## OFFLINE_ONLY-Profil

Datei:

```text
config\ms43-profile.offline.json
```

Zentrale Flags:

```json
{
  "profileState": "OFFLINE_ONLY",
  "runtimeVerified": false,
  "executionEnabled": false,
  "sgbd": "MS430DS0"
}
```

Sicherheitsmechanismen:

- Der Loader verlangt alle drei Sperrwerte exakt.
- `executionEnabled: true` wird mit
  `OFFLINE_PROFILE_EXECUTION_FLAG` abgewiesen.
- Nur `IDENT` und `STATUS_*` koennen statische Kandidaten im Profil sein.
- Jeder Katalogeintrag muss `static-confirmed`,
  `runtime-unverified` und `readOnlyCandidate: true` tragen.
- Doppelte Ergebnisfelder und nicht inventarisierte Kandidatenjobs werden
  abgewiesen.
- `OfflineExecutionPolicy.CanCreateBridgeRequest` liefert fuer ein gueltiges
  OFFLINE_ONLY-Profil immer `false`.
- Das Profil wird nur durch UI, Datenvertrag und Normalisierung gelesen. Es
  besitzt keine Referenz auf `EdiabasClient`.
- `BridgeHealthClient` hat keinen Parameter fuer SGBD oder Job.

Das manipulierte Fixture
`fixtures\security\ms43-profile.execution-enabled.json` bestaetigt die
Ausfuehrungssperre.

## Neutraler Datenvertrag

Schema:

```text
schemas\diagnostic-data-contract.schema.json
```

Pflichtfelder:

```text
schemaVersion
source
dataMode: SYNTHETIC oder LIVE
vehicleProfile
ecu
job
capturedAtUtc
durationMs
values
missingFields
errors
runtimeVerified
```

Jeder Messwert:

```text
rawFieldName
normalizedName
value
unit
validity
sourceJob
mappingStatus
```

Validierung:

- Schema-Version exakt `1.0`,
- nur bekannte JSON-Felder,
- UTC-Zeitpunkt und nichtnegative Ganzzahl fuer `durationMs`,
- SYNTHETIC immer `runtimeVerified: false`,
- LIVE nur mit `runtimeVerified: true`,
- `job` und jedes `sourceJob` muessen im statischen Profil stehen,
- bekannte Felder muessen exakt zu normalisiertem Namen, Job und Einheit
  passen,
- `numeric-display` akzeptiert nur JSON-Zahlen,
- unbekannte Felder behalten Namen, Wert, Einheit und Job und werden
  `unmapped`,
- fehlende Felder werden nicht ergaenzt,
- `null` ist nur mit `validity: not-present` erlaubt.

## Fixtures

Gueltige SYNTHETIC-Vertraege:

```text
01-unauffaellig.json
02-kuehlmitteltemperatur-erhoeht.json
03-gemischkorrektur-leerlauf.json
04-unvollstaendig.json
05-widerspruechlich.json
06-unbekanntes-ergebnisfeld.json
```

Negative Fixtures:

```text
data-contract-invalid\wrong-unit.json
data-contract-invalid\wrong-value-type.json
data-contract-invalid\live-runtime-unverified.json
security\ms43-profile.execution-enabled.json
```

Alle gueltigen SYNTHETIC-Fixtures enthalten den Hinweis, dass sie keine
Messwerte eines realen Fahrzeugs sind. Der unvollstaendige Datensatz fuehrt
fehlende Rohfelder nur in `missingFields`; es werden keine Ersatzwerte
eingesetzt.

## Copilot-Oberflaeche

Neu sichtbar:

- `MS43-Profil: OFFLINE / nicht laufzeitverifiziert`,
- Tab `MS43-Datenkatalog` mit 53 Feldern,
- vollstaendige Quelle des ausgewaehlten Feldes mit IPO-Pfad, Offsets,
  IPO-Hash, PRG-Pfad und Verifikationsstatus,
- lokaler Button `Diagnose-JSON importieren`,
- Datenmodus `SYNTHETIC` oder laufzeitverifiziertes `LIVE`,
- dauerhaft deaktivierter Button
  `Fahrzeugtest noch nicht freigegeben`.

Der Import liest maximal 1 MiB und speichert die Datei nicht. Unbestätigte
LIVE-Daten werden vor einer Provideranalyse abgewiesen. Auch manuell in das
Textfeld eingefuegtes Vertrags-JSON wird erneut validiert.

UI-Evidence:

```text
artifacts\Debug\tests\InpaAi.Copilot.ui-smoke.png
artifacts\Debug\tests\InpaAi.Copilot.catalog-smoke.png
```

## Bridge-Schutz und Regressionen

Die Phase-1A-Bridge-Quelldateien wurden nicht geaendert. Neue Tests bestaetigen:

```text
MS430DS0                 -> COMMAND_NOT_ALLOWED
IDENT                    -> COMMAND_NOT_ALLOWED
STATUS_MOTORDREHZAHL     -> COMMAND_NOT_ALLOWED
beliebige SGBDs          -> COMMAND_NOT_ALLOWED
JSON sgbd/job overrides  -> ohne Wirkung auf health
```

Der direkte `health`-Test lieferte:

```json
{"success":true,"command":"health","ecu":null,"job":null,"durationMs":117,"results":{"processBitness":32,"ediabasBinPath":"C:\\EDIABAS\\Bin","ecuPath":"C:\\EDIABAS\\ECU","mode":"TMODE_ONLY"},"error":null}
```

`health` kehrt in `BridgeApplication` vor der Erzeugung von
`EdiabasClient` zurueck und oeffnet daher keine EDIABAS-Sitzung.
`durationMs` ist laufabhaengig.

## Build und Tests

Verwendet wurden nur die bereits installierten Phase-1A-Werkzeuge:

```text
C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe
C#-Compiler: 4.8.9232.0
.NET Framework: 4.8.1, Release 533320
Ziel: .NET Framework 4.8, x86
```

Erfolgreicher kompletter Build:

```powershell
.\build.ps1 -Configuration Debug
```

Ergebnis:

```text
artifacts\Debug\bridge\InpaAi.Bridge.exe
artifacts\Debug\copilot\InpaAi.Copilot.exe
artifacts\Debug\tests\InpaAi.Bridge.Tests.exe
artifacts\Debug\tests\InpaAi.Copilot.Tests.exe
artifacts\Debug\tests\InpaAi.Copilot.UiSmoke.exe
```

Testergebnis:

```text
InpaAi.Bridge.Tests:         14/14
InpaAi.Copilot.Tests:        63/63
InpaAi.Copilot.UiSmoke:      bestanden
Copilot-Produktionsstart:    bestanden und sauber beendet
SYNTHETIC-Vertragsimport:    bestanden
Offline-Kataloganzeige:      53/53 Zeilen, bestanden
```

Der Live-Smoke-Test wurde nicht gestartet. Provider-Endpunkte wurden nicht
aufgerufen; Provider-Regressionen verwendeten ausschliesslich lokale Fixtures
und einen In-Process-HTTP-Handler.

### Release-Artefakt-Sperre

Vor Phase 2B lief bereits eine `InpaAi.Copilot`-Instanz mit PID 2800 und
Startzeit `2026-07-26 19:52:43`. Sie hielt
`artifacts\Release\copilot\InpaAi.Copilot.exe` gesperrt. Diese Benutzerinstanz
wurde nicht beendet.

Darum konnte der Standard-Release-Pfad in diesem Lauf nicht mit dem neuen
Copilot ueberschrieben werden. Der vollstaendige Debug-Build und ein separater
Compile-Check waren erfolgreich; der temporaere Compile-Check wurde danach
entfernt. Bis die alte Instanz geschlossen und Release neu gebaut wurde, ist
fuer Phase 2B ausschliesslich `artifacts\Debug` zu verwenden.

## Neue und geaenderte Projektdateien

### Neu

```text
PHASE-2B-OFFLINE-REPORT.md
config\ms43-profile.offline.json
schemas\diagnostic-data-contract.schema.json
tools\Export-Ms43StaticEvidence.ps1

docs\ms43-ipo-strings.txt
docs\ms43-prg-jobs.txt
docs\ms43-static-catalog.md

src\InpaAi.Copilot\DiagnosticDataContract.cs
src\InpaAi.Copilot\Ms43OfflineProfile.cs

fixtures\synthetic\06-unbekanntes-ergebnisfeld.json
fixtures\data-contract-invalid\live-runtime-unverified.json
fixtures\data-contract-invalid\wrong-unit.json
fixtures\data-contract-invalid\wrong-value-type.json
fixtures\security\ms43-profile.execution-enabled.json
```

### Geaendert

```text
README.md
build.ps1

src\InpaAi.Copilot\AssemblyInfo.cs
src\InpaAi.Copilot\InpaAi.Copilot.csproj
src\InpaAi.Copilot\MainForm.cs
src\InpaAi.Copilot\SyntheticCaseRepository.cs

fixtures\synthetic\01-unauffaellig.json
fixtures\synthetic\02-kuehlmitteltemperatur-erhoeht.json
fixtures\synthetic\03-gemischkorrektur-leerlauf.json
fixtures\synthetic\04-unvollstaendig.json
fixtures\synthetic\05-widerspruechlich.json

tests\InpaAi.Bridge.Tests\TestProgram.cs
tests\InpaAi.Copilot.Tests\TestProgram.cs
tests\InpaAi.Copilot.UiSmoke\UiSmokeProgram.cs
```

### Generierte Debug-Artefakte

`artifacts\Debug` enthaelt:

- x86-Bridge und Copilot samt Konfigurationsdateien,
- kopiertes Offline-Profil und Vertragsschema,
- sechs SYNTHETIC-Fixtures,
- alle Testprogramme und Fake-Bridge-Dateien,
- Provider-, Vertrags- und Sicherheits-Fixtures,
- UI- und Katalog-Screenshots.

## Spaeter am Fahrzeug laufzeitzuverifizieren

Vor jeder moeglichen Freigabe ist fuer jeden einzelnen Kandidatenjob separat
zu pruefen:

1. Das Fahrzeugprofil und die tatsaechlich antwortende SGBD/Variante.
2. Ob der Job ohne Parameter rein lesend und bei allen relevanten
   Betriebszustaenden sicher ist.
3. Welche Ergebnisfelder tatsaechlich geliefert werden.
4. Der echte EDIABAS-Datentyp jedes Feldes.
5. Einheit, Vorzeichen, Skalierung, Aufloesung und Rundung.
6. Verhalten bei fehlendem Wert, nicht unterstuetzter Variante und
   Kommunikationsfehler.
7. Ergebnisstatus, Satzstruktur und Mehrfachsatzverhalten.
8. Plausible Wertebereiche erst anhand dokumentierter oder kontrolliert
   gemessener Daten; keine Grenzwerte aus den SYNTHETIC-Fixtures ableiten.
9. VANOS-, Lambda- und Adaptionsfelder insbesondere auf Bank-, Einlass-/
   Auslass- und IST/SOLL/REF-Zuordnung.
10. Erst nach einzeln dokumentierter Freigabe darf eine neue, weiterhin feste
    produktive Read-only-Allowlist entworfen werden.

Nicht laufzeitverifiziert und daher nicht freigegeben sind insbesondere:

- alle 36 Kandidatenjobs,
- alle 53 Katalogfelder,
- alle Datentypen und Skalierungen,
- alle bislang offenen Digital-, Last- und Systemtestfelder.

## Startanleitung fuer den geprueften Build

```powershell
.\artifacts\Debug\copilot\InpaAi.Copilot.exe
```

Offline-Tests:

```powershell
.\artifacts\Debug\tests\InpaAi.Bridge.Tests.exe
.\artifacts\Debug\tests\InpaAi.Copilot.Tests.exe
.\artifacts\Debug\tests\InpaAi.Copilot.UiSmoke.exe
```

Nach dem Schliessen der alten Release-Instanz kann der Standardpfad neu gebaut
werden:

```powershell
.\build.ps1 -Configuration Release
```

Phase 2B Offline endet hier. Es wurde nicht zu Fahrzeugtests, MS43-Livewerten,
Dauerueberwachung, Aktorsteuerung, Fehlerloeschen, Codierung, Spracheingabe
oder automatisierten Aktionen uebergegangen.
