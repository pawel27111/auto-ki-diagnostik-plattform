# AutoKI Assistent — Android App

Natives Android-Client für die AutoKI-Diagnoseplattform (siehe Haupt-[README](../README.md)).
Verbindet sich über Bluetooth (ELM327/D-CAN, klassisches SPP) direkt mit dem
OBD-II-Adapter — das umgeht die eingeschränkte Bluetooth-Unterstützung von
mobilen Browsern — und spricht mit demselben tRPC-Backend wie die Web-Oberfläche.

## Architektur

```
android/
├── core/     Reines Kotlin/JVM-Modul, keine Android-Abhängigkeiten.
│             1:1-Portierung von server/obd/protocol.ts (PID- und
│             DTC-Dekodierung), inkl. der gespiegelten Testsuite.
│             Mit `./gradlew :core:test` unabhängig vom Android-SDK lauffähig.
└── app/      Android-Anwendung (Kotlin, Jetpack Compose, Material 3).
    ├── data/network   tRPC-HTTP-Client (OkHttp + kotlinx.serialization),
    │                  spiegelt server/routers.ts und server/obdRouter.ts.
    ├── data/obd       Bluetooth-SPP-Transport + ELM327-Kommandofolge,
    │                  Portierung von server/obd/obdManager.ts.
    ├── data/prefs     DataStore: Server-Adresse, Session-Cookie.
    ├── data/report    CSV-Export, identisch zu client/src/lib/report.ts.
    └── ui/            Compose-Screens, ViewModels, Navigation.
```

Das Backend bleibt die einzige Quelle für Fahrzeug-/Diagnose-Daten und
KI-Analyse; die App übernimmt nur das, was ein Server nicht kann — direkten
Bluetooth-Zugriff auf die Adapter-Hardware.

## Voraussetzungen

- Android Studio (Ladybug oder neuer) **oder** nur das Kommandozeilen-Tooling
- JDK 17+ (JDK 21 wurde zum Entwickeln dieses Projekts verwendet)
- Android SDK: `platform-34`, `build-tools;34.0.0` (Android Studio installiert
  das automatisch beim ersten Öffnen)

## Bauen

```bash
cd android
./gradlew :core:test          # reine Kotlin-Logik, kein SDK nötig
./gradlew :app:assembleDebug  # Debug-APK
./gradlew :app:assembleRelease
```

Ohne `ANDROID_HOME`/`local.properties` scheitert nur `:app:*`; `:core:test`
läuft immer. Android Studio legt `local.properties` beim ersten Öffnen des
Projekts selbst an.

## Server konfigurieren

Wie der Server dafür auf einem eigenen Laptop eingerichtet wird — Datenbank,
lokale Anmeldung ohne OAuth-Server, Adresse im WLAN — steht in
[SETUP-LOKAL.md](../SETUP-LOKAL.md).

Es gibt keine Build-Time-Konfiguration — die Server-Adresse wird beim
ersten Start in der App eingegeben (Einstellungen-Screen) und in
`DataStore` gespeichert. Anmeldung läuft über eine `WebView`, die exakt den
bestehenden `/api/oauth/login`-Redirect-Flow des Servers durchläuft
(server/_core/oauth.ts); das Session-Cookie wird danach aus
`CookieManager` ausgelesen und für alle weiteren tRPC-Aufrufe mitgeschickt.

Für einen Server ohne TLS (z. B. im Werkstatt-LAN) ist Cleartext-Traffic in
`network_security_config.xml` erlaubt — für öffentlich erreichbare
Deployments sollte HTTPS verwendet werden.

## OBD-Adapter anschließen

Anschluss und Adaptertyp werden getrennt gewählt, weil sie unabhängig
voneinander sind — ein ELM327 verhält sich über Bluetooth und über USB
gleich.

| | Bluetooth | USB |
|---|---|---|
| ELM327 (Protokoll automatisch) | ✓ | ✓ |
| ELM327, fest auf CAN 500 kBit/s | ✓ | ✓ |
| K+DCAN-Kabel (K-Line) | — | ✓ |

**Bluetooth:** Adapter zuerst in den Bluetooth-Einstellungen des Geräts
koppeln (PIN meist `1234` oder `0000`), dann in der App auswählen. Die App
fragt nur `BLUETOOTH_CONNECT` an (auf Android ≤ 11 die Legacy-
`BLUETOOTH`-Berechtigung) — es wird ausschließlich mit bereits gekoppelten
Geräten verbunden, eine eigene Geräte-Suche (und damit die
Standortberechtigung, die diese unter Android ≤ 11 erfordert) entfällt.

**USB:** Kabel über einen OTG-Adapter anschließen und in der App „Neu
suchen“ antippen. Android fragt einmal pro Gerät nach Erlaubnis. Erkannt
werden FTDI, CH34x, CP21xx, Prolific und CDC-ACM.

### Warum das K+DCAN-Kabel eine Sonderrolle hat

Ein ELM327 ist ein Mikrocontroller: Er bekommt `ATSP0` und kümmert sich
selbst um Protokollwahl, Nachrichtenrahmen und Timing. Ein BMW-K+DCAN-Kabel
ist ein FTDI-Chip an einer Leitung, sonst nichts — alles, was der ELM327
in Firmware erledigt, macht bei diesem Kabel die App:

- Der Bus wird geweckt, indem die Sendeleitung mit **fünf Bit pro Sekunde**
  angesteuert wird (`KLineAdapter.sendSlowInitAddress`). Kein gängiger
  USB-Seriell-Chip lässt sich auf 5 Baud stellen — ein FT232R kommt nicht
  unter 183 — also werden die Bits über den Break-Zustand erzeugt, je
  200 ms. Der ganze Anschlag dauert zwei Sekunden.
- Danach folgt der Schlüsselbyte-Handschlag, aus dem sich ergibt, ob das
  Fahrzeug ISO 9141-2 oder KWP2000 spricht.
- Nachrichtenrahmen und Prüfsummen entstehen in `:core` (`KLine.kt`) und
  sind dort mit Testfällen abgedeckt, die von Hand aus der Norm gerechnet
  sind — die zeitkritische Hälfte lässt sich ohne Fahrzeug nicht prüfen.

Jeder Schritt protokolliert unter dem Tag `AutoKI-KLine` mit den rohen
Bytes. Wenn der Anschlag am Auto scheitert, steht in `adb logcat` genau,
wie weit er gekommen ist:

```bash
adb logcat -s AutoKI-KLine
```

## Bekannte Einschränkungen

- Der K-Line-Pfad ist **nicht am Fahrzeug erprobt**. Die Rahmen- und
  Prüfsummenlogik ist getestet, das Timing des 5-Baud-Anschlags
  grundsätzlich nicht — Android ist kein Echtzeitsystem und der
  USB-Chip puffert. Ob es trägt, zeigt sich erst an einem Auto.
- Der K-Line-Pfad spricht OBD-II (Modus 01/03/04). BMW-eigene Protokolle
  wie DS2, mit denen INPA auch ABS oder Airbag ausliest, sind nicht
  implementiert.
- Das App-Icon ist ein einfaches Platzhalter-Vektordesign.
- Es gibt noch keine automatisierten Instrumentation-/Compose-UI-Tests —
  die fachliche Logik (Protokoll-Dekodierung) ist über `:core:test`
  vollständig abgedeckt.
- Strings sind größtenteils direkt in den Composables (nicht in
  `strings.xml`) — für eine mehrsprachige App wäre eine Extraktion sinnvoll.
