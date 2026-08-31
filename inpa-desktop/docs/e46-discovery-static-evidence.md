# Phase 2C: statischer Nachweis der Discovery-Proben

Stand: 2026-08-07  
Fahrzeugprofil: BMW E46 320Ci, M54B22, Siemens MS43  
Manifest: `2C.2`

## Sicherheitsgrenze der Untersuchung

Diese Bestandsaufnahme war vollständig offline. Gelesen wurden ausschließlich
vorhandener Projektquellcode, INPA-Menüdefinitionen und PRG-Dateien. Die
installierten Werkzeuge `bestinfo.exe` und `xtract.exe` wurden nur zur statischen
Metadatenextraktion aus PRG-Dateien verwendet. Es gab keinen Aufruf von
`apiJob`, keinen Bridge-Discovery-Befehl und keine Kommunikation mit einem
Fahrzeug.

Keine INPA-, EDIABAS-, PRG-, IPO-, INI- oder DLL-Datei wurde verändert. Die
XTRACT-Ausgaben lagen außerhalb der Installationspfade und sind nicht Teil der
Laufzeit.

## Verwendete lokale Primärquellen

- `C:\EC-APPS\INPA\CFGDAT\E46.ENG` und `E46.GER`: Zuordnung der E46-Menüeinträge,
  unter anderem MS43, DSC MK60, LWS5, LSZ, SM46, ZKE5 und Radio.
- `C:\EDIABAS\ECU\<name>.prg`: jeweilige kompilierte SGBD-Quelle der Probe.
- `bestinfo.exe 7.3.0`: statische Jobliste einer PRG.
- `xtract.exe 7.3.0`: statische Jobkommentare, Ergebnisnamen und Ergebnistypen.
- E46-INPA-Skripte in `C:\EC-APPS\INPA\SGDAT`: Variantenbezug für
  Antrieb, Fahrwerk, Karosserie, Komfort und Kommunikationssysteme. Dazu
  gehören unter anderem KOMBI, MRS, IHKA, ASC/DSC, RLS/AIC, MFL, SHD,
  Sitz-/Spiegelmemory, Xenon, Bordmonitor, CDC, Navigation, Telefon und Video.

Aus der E46-Menümenge wurden die zum bekannten Fahrzeug unpassenden
Antriebsvarianten, Dieselmodule, SSG/SMG, Cabrioverdeck-/Überrollmodule und
Japan-Navigation nicht in das Manifest übernommen. Diese Filterung beruht auf
dem fest bekannten Profil 320Ci/M54B22/Coupé und ist keine Aussage über die
tatsächlich verbaute Sonderausstattung. Alle verbleibenden Ausstattungsoptionen
werden erst durch eine spätere Antwort zu bestätigten Modulen.

## Nachweis der Leseeigenschaft

- `MS430DS0 / IDENT_AIF`: XTRACT-Kommentar `Ident und AIF zusammen lesen`;
  belegt sind insbesondere `JOB_STATUS`, `ID_BMW_NR`, `ID_HW_NR`,
  `ID_DIAG_INDEX`, `ID_SW_NR` und `AIF_FG_NR`.
- `DSC_MK60 / IDENT`: XTRACT-Kommentare
  `KWP2000: $1A $80 ReadECUIdentification` und
  `Auslesen der Ident-Daten des Steuergeraetes`; belegt sind `JOB_STATUS`,
  `ID_BMW_NR`, `ID_HW_NR`, `ID_DIAG_INDEX` und `ID_SW_NR_FSV`.
- Alle übrigen unten freigegebenen PRGs enthalten einen Job `IDENT` mit
  Identifikationskommentar und den im Manifest aufgeführten Ergebnisfeldern.
  Für `RADIO` ist zusätzlich `ID_GERAETE_NAME` belegt.
- Die ältere SGBD `CDC` besitzt keinen `IDENT`-Job. Für sie ist ausschließlich
  `SER_NR_DOM_LESEN` freigegeben; XTRACT beschreibt ihn als
  `Seriennummer 14-stellig lesen` und belegt `JOB_STATUS` sowie `SER_NR_DOM`.

Es wurden keine ähnlich klingenden Jobs angenommen und keine Jobs probeweise
ausgeführt. Schreib-, Lösch-, Stellglied-, Codier- und generische Jobaufrufe
sind nicht Bestandteil des Discovery-Manifests.

## Festes Discovery-Manifest

`Adresse` ist durchgehend `nicht statisch verifiziert`. Damit wird keine
Diagnoseadresse geraten; EDIABAS löst die Verbindung ausschließlich über die
fest gebundene SGBD auf. `Wdh.` bezeichnet die maximal erlaubte Zahl von
Wiederholungen nach einer `NoResponse`-Antwort.

| Modulschlüssel | Steuergerät | SGBD / PRG | Adresse | Job | erwartete Identifikationsfelder | Timeout | Wdh. |
|---|---|---|---|---|---|---:|---:|
| `engine.ms43` | Motorsteuerung Siemens MS43 | `MS430DS0 / ms430ds0.prg` | nicht verifiziert | `IDENT_AIF` | `JOB_STATUS`, `ID_BMW_NR`, `ID_HW_NR`, `ID_DIAG_INDEX`, `ID_SW_NR`, `AIF_FG_NR` | 5000 ms | 1 |
| `chassis.dsc-mk60` | DSC MK60 | `DSC_MK60 / dsc_mk60.prg` | nicht verifiziert | `IDENT` | `JOB_STATUS`, `ID_BMW_NR`, `ID_HW_NR`, `ID_DIAG_INDEX`, `ID_SW_NR_FSV` | 4000 ms | 1 |
| `security.ews3` | EWS3 | `EWS3 / ews3.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.cluster-kombi46r` | Kombiinstrument E46 Redesign | `KOMBI46R / KOMBI46R.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.cluster-kombi46` | Kombiinstrument E46 | `KOMBI46 / KOMBI46.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `safety.airbag-mrs4` | Airbag MRS4 | `MRS4 / mrs4.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `safety.airbag-mrs3` | Airbag MRS3 | `MRS3 / MRS3.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `safety.airbag-mrs2` | Airbag MRS2 | `MRS2 / MRS2.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `climate.ihka46-2` | Klimaautomatik IHKA E46 PU | `IHKA46_2 / ihka46_2.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `climate.ihka46` | Klimaautomatik IHKA E46 | `IHKA46 / ihka46.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.lsz` | Lichtschaltzentrum LSZ | `LSZ / LSZ.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `chassis.lws5` | Lenkwinkelsensor LWS5 | `LWS5 / lws5.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.zke5` | Zentrale Karosserie-Elektronik ZKE5 | `ZKE5 / zke5.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `parking.pdcact` | PDC aktuell | `PDCACT / pdcact.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `parking.pdce38` | PDC DS2 | `PDCE38 / PDCE38.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.radio` | Radio | `RADIO / radio.prg` | nicht verifiziert | `IDENT` | `JOB_STATUS`, `ID_BMW_NR`, `ID_HW_NR`, `ID_SW_NR`, `ID_GERAETE_NAME` | 4000 ms | 1 |
| `comfort.sm46` | Sitzmemory Fahrer SM46 | `SM46 / sm46.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `transmission.gs8604` | Getriebesteuerung GS8.60.4 | `GS8604 / gs8604.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `transmission.gs8600` | Getriebesteuerung GS8.60.0 | `GS8600 / GS8600.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `transmission.gs834` | Getriebesteuerung GS8.34 | `GS834 / GS834.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `transmission.gs20` | Getriebesteuerung GS20 | `GS20 / gs20.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `chassis.dsc-e46` | DSC E46 | `DSC_E46 / DSC_E46.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `chassis.asc-mk20` | ASC MK20 | `ASCMK20 / ASCMK20.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `chassis.dsc57` | DSC 5.7 | `DSC57 / DSC57.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `chassis.rdc` | Reifendruckkontrolle RDC | `RDC / RDC.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `chassis.dws` | Reifendruckwarnsystem DWS | `DWS / DWS.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.mfl2` | Multifunktionslenkrad MFL2 | `MFL2 / MFL2.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.mfl` | Multifunktionslenkrad MFL | `MFL / MFL.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.rls-ds2` | Regen- und Lichtsensor RLS | `RLS_DS2 / RLS_DS2.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.aic` | Regensensor AIC | `AIC / AIC.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.szm46` | Schaltzentrum Mittelkonsole E46 | `SZM46 / SZM46.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.szm38` | Schaltzentrum Mittelkonsole SZM38 | `SZM38 / SZM38.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.shd46-2` | Schiebehebedachmodul E46 PU | `SHD46_2 / SHD46_2.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.shd46` | Schiebehebedachmodul E46 | `SHD46 / SHD46.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.xenon-left` | Xenonlicht links | `XENON_L / XENON_L.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.xenon-right` | Xenonlicht rechts | `XENON_R / XENON_R.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `body.alc-ds2` | Adaptive Light Control | `ALC_DS2 / ALC_DS2.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.monitor-topnav` | Bordmonitor Topnavigation | `BMBT46TN / BMBT46TN.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.monitor-radionav` | Bordmonitor Radionavigation | `BMBT46RN / BMBT46RN.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.monitor-mir` | Bordmonitor MIR | `BMBT_MIR / BMBT_MIR.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.monitor-wide46` | Widescreen Bordmonitor E46 | `BM46WIDE / BM46WIDE.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.monitor-wide` | Widescreen Bordmonitor | `BM_WIDE / BM_WIDE.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.cdc46` | CD-Wechsler E46 | `CDC_46 / CDC_46.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.cdc` | CD-Wechsler DS2 | `CDC / CDC.prg` | nicht verifiziert | `SER_NR_DOM_LESEN` | `JOB_STATUS`, `SER_NR_DOM` | 4000 ms | 1 |
| `infotainment.navigation-mk4-2` | Navigation MK4.2 | `NAVMK4_2 / NAVMK4_2.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.navigation-mk4` | Navigation MK4 | `NAVMK4 / NAVMK4.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.navigation-mk3` | Navigation MK3 | `NAVMK3 / NAVMK3.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.navigation-mk2` | Navigation MK2 | `NAVMK2 / NAVMK2.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.ses` | Spracheingabesystem SES | `SES / SES.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.phone-telephone` | BMW Telefon | `TELEFON / TELEFON.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.phone-jbit` | Telefon JBIT | `JBIT / JBIT.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.phone-bit` | Telefon BIT | `BIT / BIT.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.phone-bit2` | Telefon BIT2 | `BIT2 / BIT2.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.phone-ulf` | ULF | `ULF / ULF.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.phone-telibus` | Telefon I-Bus | `TELIBUS / TELIBUS.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.phone-telibus2` | Telefon I-Bus 2 | `TELIBUS2 / TELIBUS2.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.phone-telibus3` | Telefon I-Bus 3 | `TELIBUS3 / TELIBUS3.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.video-ibus` | Videomodul I-Bus | `VM5IBUS / VM5IBUS.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `infotainment.video` | Videomodul | `VIDEOMOD / VIDEOMOD.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `comfort.passenger-seat-b-sm46-4` | Sitzmemory Beifahrer B_SM46_4 | `B_SM46_4 / B_SM46_4.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `comfort.passenger-seat-b-sm46-3` | Sitzmemory Beifahrer B_SM46_3 | `B_SM46_3 / B_SM46_3.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `comfort.passenger-seat-easy-e-b` | Sitzmemory Beifahrer EASY_E_B | `EASY_E_B / EASY_E_B.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `comfort.mirror-driver` | Spiegelmemory Fahrer | `SPM46FT / SPM46FT.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `comfort.mirror-passenger` | Spiegelmemory Beifahrer | `SPM46BT / SPM46BT.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `comfort.cruise-gr2` | Tempomat GR2 | `GR2 / GR2.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `comfort.cruise-fgr2` | Tempomat FGR2 | `FGR2 / FGR2.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `comfort.cruise-fgr2-5` | Tempomat FGR2.5 | `FGR2_5 / FGR2_5.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |
| `comfort.cruise-fgr-kw` | Tempomat FGR_KW | `FGR_KW / FGR_KW.prg` | nicht verifiziert | `IDENT` | gemeinsame Identfelder | 4000 ms | 1 |

Die gemeinsamen Identfelder sind `JOB_STATUS`, `ID_BMW_NR`, `ID_HW_NR`,
`ID_DIAG_INDEX` und `ID_SW_NR`. Dateiname, vollständiger SHA-256-Hash,
Bridge-Befehl, Familienreihenfolge, Diagnosegruppen und VIN-Felder stehen im
kompilierten Manifest `src/InpaAi.Shared/DiscoveryManifest.cs`.

Varianten derselben Familie werden in der Tabellenreihenfolge geprüft. Sobald
eine Variante erreichbar ist, werden die nachfolgenden Alternativen dieser
Familie nicht mehr gesendet und bleiben als `NotChecked` mit
`ALTERNATIVE_NOT_REQUIRED` sichtbar.

## Laufzeitvalidierung vor einer Probe

Vor jeder einzelnen Bridge-Anfrage muss die installierte PRG vorhanden sein und
exakt den im Manifest gespeicherten SHA-256-Wert besitzen. Eine fehlende oder
abweichende Datei ergibt `UnsupportedProbe`; in diesem Fall wird keine Probe an
die Bridge gesendet. Die Bridge prüft dieselbe feste Zuordnung erneut.

Ein erfolgreicher Job gilt nur dann als `Reachable`, wenn `JOB_STATUS=OKAY` und
mindestens ein statisch erwartetes Identifikationsfeld geliefert wurde. Eine
VIN wird ausschließlich aus dem verifizierten Feld `AIF_FG_NR` übernommen,
wenn sie das strenge 17-Zeichen-Format erfüllt.

## Nicht als Befund behandelte Informationen

Die statische Untersuchung bestätigt keine tatsächlich im konkreten Fahrzeug
verbauten Steuergeräte und keine Diagnoseadressen. Erst ein ausdrücklich
freigegebener späterer Live-Discovery-Lauf kann Erreichbarkeit feststellen.
Antwortet keine einzige verifizierte Probe, lautet das Ergebnis deshalb
`Fahrzeugverbindung konnte nicht bestaetigt werden` und niemals
`0 Steuergeraete eingebaut`.
