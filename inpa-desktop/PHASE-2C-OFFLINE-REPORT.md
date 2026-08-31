# Phase 2C Offline-Prüfbericht

Stand: 2026-08-07  
Gegenstand: Dynamische Read-only-Steuergeräte-Erkennung  
Status: Implementierung und Offline-Validierung abgeschlossen; Live-Test nicht ausgeführt

## Ergebnis

Phase 2C ist als feste, sequenzielle Discovery-Pipeline implementiert. Die
Anwendung geht nach einem später freigegebenen Fahrzeuganschluss nicht von
einer statischen Einbauliste aus, sondern erzeugt aus ausschließlich bestätigten
Antworten ein Sitzungprofil. Der aktuelle Stand führt die Erkennung nicht
automatisch aus: Beim Start wird nur der fahrzeugfreie Bridge-Healthcheck
ausgeführt. Discovery beginnt erst über `Erneut pruefen`.

Der abschließende Offline-Dry-Run listet das Manifest auf, führt aber weder die
Bridge noch EDIABAS aus. Der Arbeitsstand hält danach ausdrücklich vor einem
Live-Test an.

## Sicherheitsarchitektur

- Die einzige Laufzeitschnittstelle ist ein festes Manifest mit 68 exakt
  benannten Befehlen. Der Copilot sendet nur das Feld `command`; SGBD und Job
  können nicht frei eingegeben werden.
- Die Bridge bindet jeden Befehl exakt an SGBD, PRG, SHA-256, Job, leere
  Argumente, Timeout und Discovery-Kennzeichen. Abweichende Tupel werden vor
  `apiJob` verworfen.
- Zugelassen sind ausschließlich die statisch belegten Jobs `IDENT_AIF`
  (MS43), `IDENT` sowie `SER_NR_DOM_LESEN` für die alte CDC-Variante. Letzterer
  ist in der PRG ausdrücklich als 14-stelliges Seriennummernlesen dokumentiert.
  Eine generische Jobausführung existiert nicht.
- Jede PRG wird vor der Probe im Copilot und nochmals in der Bridge anhand des
  Manifest-Hashes verifiziert. `UnsupportedProbe` wird ohne Bridge-Probe
  erzeugt.
- Der Scanner wartet jede Antwort vollständig ab, bevor er die nächste Probe
  startet. Bridge-Health und Discovery teilen zusätzlich eine Prozesssperre;
  parallele EDIABAS-Jobs sind damit ausgeschlossen.
- Nur `NoResponse` darf einmal wiederholt werden. Alle anderen Ergebnisse
  werden nicht wiederholt.
- Es gibt keinen periodischen Hintergrundscan und kein persistentes
  Fahrzeugprofil auf Datenträger. Das Profil lebt nur in der laufenden Sitzung.
- Eine streng validierte 17-stellige VIN aus `MS430DS0/IDENT_AIF/AIF_FG_NR`
  bindet das Sitzungsprofil. Eine andere VIN ersetzt das bisherige Profil.
- INPA-, EDIABAS-, PRG-, IPO-, INI- und DLL-Originaldateien blieben unverändert.

## Zustandsmodell

Jede Manifestzeile besitzt genau einen der Zustände `NotChecked`, `Reachable`,
`NoResponse`, `UnsupportedProbe`, `SgbdError`, `TransportError` oder
`Cancelled`.

Der Gesamtscan unterscheidet `NotChecked`, `Running`, `Recognized`,
`ConnectionUnconfirmed` und `Cancelled`. Nur `Recognized` mit mindestens einer
`Reachable`-Zeile bestätigt die Fahrzeugverbindung. Bei null bestätigten
Steuergeräten wird sichtbar ausgegeben:

```text
Fahrzeugverbindung konnte nicht bestaetigt werden
```

## UI und nachgelagerte Freigaben

Die WinForms-Oberfläche enthält einen Discovery-Reiter mit Gesamtstatus,
Anzahl erreichbarer Steuergeräte, Abbruch, `Erneut pruefen` und einer Tabelle
für Steuergerät, SGBD, Status, Identifikation, Antwortzeit und Fehler.

Diagnose und Monitoring bleiben während der Erkennung gesperrt. Nur
`Reachable`-Module werden in den KI-Fahrzeugkontext, die Sprachsteuerungsmenge
und die verfügbaren Diagnosegruppen übernommen. Ein importierter
`LIVE`-Datensatz für ein nicht bestätigtes Steuergerät wird abgewiesen;
synthetische Offline-Daten bleiben davon unberührt.

## Offline-Testmatrix

| Szenario | Abgedecktes Verhalten |
|---|---|
| Fahrzeug nicht angeschlossen | keine falsche Null-Einbauliste, Verbindung unbestätigt, höchstens eine Wiederholung |
| Nur MS43 erreichbar | genau ein bestätigtes Modul, VIN aus sicherem Feld |
| Mehrere Steuergeräte erreichbar | dynamisches Profil und gefilterte Diagnosegruppen |
| Einzelner Timeout | `NoResponse`, Scan läuft sequenziell weiter |
| Kompletter Transportfehler | `TransportError`, verbleibende Proben ebenfalls sicher beendet |
| Abbruch während des Scans | aktuelle/übrige Proben `Cancelled` |
| VIN-Wechsel | altes Sitzungsprofil wird ersetzt |
| Nicht freigegebener Job | Policy-Ablehnung vor Ausführung |
| Abweichende/fehlende PRG | `UnsupportedProbe`, keine Bridge-Anfrage |
| Parallelitätsprüfung | maximale gleichzeitige Probe = 1 |
| Dry-Run | Manifestausgabe ohne Bridge-/EDIABAS-Aufruf |

Zusätzlich bleiben die bisherigen Bridge-, Provider-, Datenvertrag-,
Offline-Katalog- und UI-Smoke-Tests Bestandteil der Suites.

## Reproduzierbare Befehle

```powershell
.\build.ps1 -Configuration Release
.\artifacts\Release\tests\InpaAi.Bridge.Tests.exe
.\artifacts\Release\tests\InpaAi.Copilot.Tests.exe
.\artifacts\Release\tests\InpaAi.Copilot.UiSmoke.exe
.\artifacts\Release\tests\InpaAi.Copilot.Tests.exe --discovery-dry-run
```

Der Dry-Run beginnt mit
`DISCOVERY DRY RUN - OFFLINE - NO BRIDGE OR EDIABAS JOB EXECUTED` und endet
mit `STOP: live discovery requires explicit user confirmation.`

## Abschließender Release-Lauf

Der Release-Lauf vom 2026-08-07 ergab:

- Build: erfolgreich, x86/.NET Framework 4.8
- Bridge-Suite: 17 bestanden, 0 fehlgeschlagen
- Copilot-Suite: 76 bestanden, 0 fehlgeschlagen
- WinForms-UI-Smoke: bestanden
- lokale Manifest-Integrität: 68 von 68 PRG-Hashes stimmen überein
- statischer XTRACT-Abgleich: 68 von 68 Jobs und alle erwarteten Felder belegt
- Live-Smoke und Fahrzeug-Discovery: bewusst nicht ausgeführt

Beim Reparaturlauf wurde zusätzlich der echte UI-Lifecycle für einen VIN-Wechsel
korrigiert: Die vorherige VIN bleibt nur als Vergleichswert erhalten, während
das alte Fahrzeugprofil vor dem neuen Scan weiterhin sofort invalidiert wird.
Neue Regressionstests decken diesen Ablauf, die produktive PRG-Hashprüfung und
den Pfad von der Bridge-JSON-Antwort bis zum dynamischen Sitzungsprofil ab.

Die vollständige erzeugte Ausgabe liegt unter
`artifacts/Release/discovery-dry-run.txt`.

## Statischer PRG-Nachweis

Die vollständige Herleitung, das 68-zeilige Manifest und die bewusst nicht
geratenen Diagnoseadressen stehen in
`docs/e46-discovery-static-evidence.md`.

## Haltepunkt

Es wurde kein echter Fahrzeugjob ausgeführt. Ein späterer Live-Test ist nicht
Teil dieses Prüfberichts und setzt eine neue ausdrückliche Bestätigung voraus.
