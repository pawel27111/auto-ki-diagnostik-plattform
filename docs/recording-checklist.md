# Aufnahme-Checkliste für die erste Sitzung mit Fahrzeug

Diese Liste existiert, weil die erste Aufnahme die teuerste ist. Ohne Kabel und
Auto lässt sich alles andere bauen und testen — aber die Saat für jede Baseline
entsteht nur hier. Eine ungeplante Sitzung verschenkt die Gelegenheit; eine
geplante liefert die Grundlage für Monate Entwicklung.

**Vor der Fahrt einmal ganz durchlesen.** Mehrere Punkte lassen sich nachträglich
nicht mehr korrigieren.

---

## 0. Vorbereitung (vor dem Losfahren)

- [ ] Fahrzeug steht mindestens **6 Stunden** — besser über Nacht. Ohne echten
      Kaltstart fehlt der Zustand `cold_start` dauerhaft, und er ist der
      aussagekräftigste für Verschleiß an Hydraulik und Aktoren.
- [ ] Adapter angeschlossen, Verbindung getestet, **bevor** der Motor läuft
- [ ] Genug Speicherplatz und Akku für die volle Fahrt
- [ ] Kilometerstand notieren → gehört in den Trace-Header (`mileage`)
- [ ] Aktuellen Fehlerspeicher auslesen und **speichern** — aber **nicht
      löschen**. Der Ausgangszustand ist Teil der Historie.
- [ ] Öl- und Kühlmittelstand geprüft. Ein niedriger Ölstand verfälscht jede
      spätere VANOS-Aussage und macht die Baseline unbrauchbar.
- [ ] Wetter und Außentemperatur notieren

## 1. Was aufgezeichnet werden muss

Die Signale zerfallen in zwei Gruppen, und beide werden gebraucht:

**Kontextsignale** — sie bestimmen den Betriebszustand, in den jede Messung
einsortiert wird. Ohne sie landen alle Messwerte im Bucket `unknown` und
fließen in **keine** Baseline ein. Das ist der häufigste Weg, eine Aufnahme
komplett wertlos zu machen.

| Signal | Einheit | Zwingend |
|---|---|---|
| Drehzahl | min⁻¹ | ja |
| Kühlmitteltemperatur | °C | ja |
| Motorlast | % | ja |
| Drosselklappenstellung | % | ja |
| Sekunden seit Motorstart | s | ja |
| Geschwindigkeit | km/h | empfohlen |
| Öltemperatur | °C | empfohlen |

**Beobachtungssignale** — das eigentlich Interessante:

| Signal | Einheit | Warum |
|---|---|---|
| Luftmasse (MAF) | g/s | Basis für Gemischdiagnose |
| Kurzzeit-Gemischkorrektur | % | reagiert sofort |
| Langzeit-Gemischkorrektur | % | zeigt Drift |
| Lambdasonde vor Kat | V | Regelgüte |
| VANOS Soll (Ein/Aus) | ° | Sollwert der Verstellung |
| VANOS Ist (Ein/Aus) | ° | Abweichung zum Soll |
| VANOS Regelzeit (Ein/Aus) | ms | frühester Verschleißindikator |
| Zündwinkelrücknahme | ° | Klopfregelung |
| Bordspannung | V | schleichende Ladeprobleme |

> **Einlass-VANOS nicht weglassen.** Die Hypothesenmaschine trennt
> „Ölversorgung" von „einzelnes Magnetventil" fast ausschließlich daran, ob
> beide Nockenwellen betroffen sind. Fehlt das Signal, bleibt genau diese
> Unterscheidung dauerhaft offen — sie ist der stärkste Einzeldiskriminator im
> ganzen Modell.

## 2. Zeitversatz — der Punkt, den man nicht nachholen kann

Signale, die miteinander verglichen werden sollen, müssen aus **demselben
Zeitfenster** stammen. Bei 3000 min⁻¹ dreht der Motor 50-mal pro Sekunde; ein
Versatz von 200 ms beschreibt zwei verschiedene Betriebspunkte, nicht einen
Fehler.

- [ ] Wo ein Job **mehrere Werte gleichzeitig** liefert, diesen nutzen statt
      einzeln abzufragen. Das gilt besonders für VANOS Soll/Ist — die beiden
      getrennt zu lesen macht die Abweichung wertlos.
- [ ] Pro Messwert den **echten Empfangszeitpunkt** speichern, nicht den
      Sitzungsstart (`acquiredAt`)
- [ ] Zusammengehörige Messungen mit derselben **Sweep-Nummer** markieren

Der Code prüft das anschließend selbst: `isCorrelatable()` weist einen Sweep mit
mehr als 100 ms Streuung zurück, statt still zu korrelieren.

## 3. Der Fahrablauf

Die Phasen entsprechen genau den Betriebszuständen aus `classifyCondition`.
Jede Phase, die fehlt, ist ein Bucket, das leer bleibt.

### Phase 1 — Kaltstart (0:00–1:00)
- [ ] Aufzeichnung starten **vor** dem Zündschlüssel
- [ ] Motor starten, **nicht** Gas geben
- [ ] 60 Sekunden im Leerlauf stehen lassen

→ füllt `cold_start`. Nur einmal pro Tag verfügbar.

### Phase 2 — Warmlauf (1:00–4:00)
- [ ] Ruhig fahren, Drehzahl unter 2500 min⁻¹
- [ ] Starke Last vermeiden

→ füllt `warmup`. Übergangszustand, wird nicht getrendet, aber als Kontext
gebraucht.

### Phase 3 — Warmer Leerlauf (nach Erreichen von ~90 °C)
- [ ] Stehen bleiben, Motor im Leerlauf
- [ ] **Volle 3 Minuten** — das ist der wichtigste stationäre Zustand
- [ ] Verbraucher aus (Klima, Licht, Gebläse)

→ füllt `idle_warm`. Der am besten reproduzierbare Zustand und deshalb die
tragfähigste Baseline. Nicht abkürzen.

### Phase 4 — Teillast (3 Minuten)
- [ ] Konstant ~2000 min⁻¹ halten, ebene Strecke
- [ ] Dann ~2500 min⁻¹, jeweils mindestens 45 Sekunden konstant

→ füllt `part_load`.

### Phase 5 — Hohe Last (1 Minute)
- [ ] Zwei bis drei kräftige Beschleunigungen, jeweils bis ~4000 min⁻¹
- [ ] **Nur wo es zulässig und sicher ist**

→ füllt `high_load`. Kurz, aber notwendig: Unterdrucklecks zeigen sich gerade
darin, dass sie unter Last *verschwinden*.

### Phase 6 — Schubbetrieb (30 Sekunden)
- [ ] Im Gang vom Gas gehen, rollen lassen, Drehzahl über 1500 min⁻¹

→ füllt `deceleration`. Kraftstoff ist abgeschaltet, Gemischsignale bedeuten
hier etwas anderes — ein eigener Zustand, keine Störung.

### Phase 7 — Abschluss
- [ ] Zurück in den Leerlauf, 45 Sekunden
- [ ] Aufzeichnung **vor** dem Abstellen beenden
- [ ] Datei sofort sichern und Kilometerstand ergänzen

## 4. Nach der Fahrt prüfen

Bevor die Datei als brauchbar gilt:

- [ ] Alle sechs Zustände kommen vor (`cold_start`, `warmup`, `idle_warm`,
      `part_load`, `high_load`, `deceleration`)
- [ ] Anteil `unknown` unter 5 % — sonst fehlen Kontextsignale
- [ ] Sweep-Streuung unter 100 ms für Signale, die verglichen werden sollen
- [ ] Nur **eine** `signalSchemaVersion` pro Signal
- [ ] `source` ist überall `live`
- [ ] Datei lässt sich mit `parseTrace()` fehlerfrei laden

## 5. Wie viele Sitzungen es braucht

Eine einzelne Aufnahme ist **keine** Baseline. Die Statistik braucht Wiederholung:

| Ziel | Sitzungen | grob |
|---|---|---|
| Erste nutzbare Baseline (`idle_warm`) | 3–5 | 2 Wochen |
| Alle Zustände ausreichend belegt | 8–12 | 1–2 Monate |
| Trenderkennung über Sitzungen | ab 5 | — |
| Belastbare Trendaussage | 12+ | 3 Monate |

Eine Zelle braucht mindestens **30 Messwerte** (`MIN_SAMPLES_FOR_BASELINE`),
bevor sie überhaupt verglichen wird. Darunter meldet das System ehrlich
`insufficient_data` statt einer Zahl, die nach Sicherheit aussieht.

Trendaussagen brauchen zusätzlich mindestens **5 Sitzungen**
(`MIN_SESSIONS_FOR_TREND`). Eine Gerade durch drei Punkte ist eine Gerade durch
Rauschen.

## 6. Häufige Fehler

| Fehler | Folge |
|---|---|
| Motor war schon warm | `cold_start` fehlt dauerhaft für diesen Tag |
| Kontextsignale nicht aufgezeichnet | alles landet in `unknown`, Baseline bleibt leer |
| VANOS Soll und Ist getrennt gelesen | Abweichung nicht korrelierbar, Kernaussage verloren |
| Warmen Leerlauf abgekürzt | wichtigste Zelle bleibt zu dünn |
| Klimaanlage lief mit | Leerlaufwerte verschoben, Baseline verrauscht |
| Fehlerspeicher vor der Aufnahme gelöscht | Adaptionen zurückgesetzt, erste Sitzungen unbrauchbar |
| Nur eine Sitzung aufgenommen | keine Baseline, nur eine Momentaufnahme |

## 7. Wenn ein konkreter Verdacht besteht

Bei einem vermuteten Fehler zusätzlich gezielt aufnehmen, was ihn von seinen
Alternativen trennt:

**VANOS** — Regelzeit bei kaltem **und** warmem Öl, beide Nockenwellen. Die
Temperaturabhängigkeit trennt Verschleiß und Ölversorgung vom Magnetventil.

**Gemisch** — Korrekturen bei Leerlauf, 2000 min⁻¹ und hoher Last. Ein
Unterdruckleck ist im Leerlauf stark und unter Last kaum sichtbar; eine
MAF-Drift wirkt über den ganzen Bereich.

**Kühlung** — Kühlmitteltemperatur über die gesamte Fahrt, plus Außentemperatur
und Lüfterzustand.

---

Grundregel: **lieber zu viel aufzeichnen als zu wenig.** Speicherplatz ist
billig, eine zweite Anfahrt zum Fahrzeug nicht — und ein fehlender Zustand
lässt sich nicht nachträglich rekonstruieren.
