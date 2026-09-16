# Lokales Setup — Server auf dem Laptop, App auf dem Tablet

Diese Anleitung bringt den AutoKI-Server auf deinem eigenen Laptop zum Laufen,
sodass die Android-App auf dem Tablet sich damit verbinden kann. Beide Geräte
müssen dafür im **gleichen WLAN** sein.

Die Schritte unten sind auf einem frischen System durchgespielt worden — inklusive
Datenbank, Anmeldung und einem echten Schreibzugriff aus der App-Perspektive.

---

## 0. Was du brauchst

|                       |                                                           |
| --------------------- | --------------------------------------------------------- |
| **Node.js**           | Version 18 oder neuer — <https://nodejs.org> (LTS nehmen) |
| **pnpm**              | Version 10+, installieren mit `npm install -g pnpm`       |
| **MySQL**             | 8.0 oder neuer. MariaDB ab 10.11 funktioniert ebenfalls   |
| **Laptop und Tablet** | im selben WLAN                                            |

Prüfen, ob alles da ist:

```bash
node -v      # v18.x oder höher
pnpm -v      # 10.x oder höher
mysql --version
```

---

## 1. Projekt holen

```bash
git clone https://github.com/pawel27111/auto-ki-diagnostik-plattform.git
cd auto-ki-diagnostik-plattform
git checkout claude/android-studio-app-4fpw5n
```

> **Wichtig:** Der Entwickler-Login aus Schritt 4 liegt aktuell nur auf dem Branch
> `claude/android-studio-app-4fpw5n`. Auf `main` gibt es ihn noch nicht — dort
> käme man ohne OAuth-Zugangsdaten nicht am Anmeldebildschirm vorbei.

---

## 2. Abhängigkeiten installieren

```bash
pnpm install
```

Das dauert beim ersten Mal ein paar Minuten.

> `pnpm approve-builds` brauchst du **nur**, wenn du später einen OBD-Adapter per
> **USB direkt am Laptop** betreiben willst. Für das Tablet (Bluetooth) ist es
> nicht nötig — dort spricht die App den Adapter selbst an, der Server ist gar
> nicht beteiligt.

---

## 3. Datenbank anlegen

Melde dich als MySQL-Administrator an (`mysql -u root -p`) und führe aus:

```sql
CREATE DATABASE autoki CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'autoki'@'localhost' IDENTIFIED BY 'DEIN_PASSWORT';
GRANT ALL PRIVILEGES ON autoki.* TO 'autoki'@'localhost';
FLUSH PRIVILEGES;
```

Ersetze `DEIN_PASSWORT` durch ein Passwort deiner Wahl — du trägst es gleich in
die Konfiguration ein.

---

## 4. Konfiguration anlegen

```bash
cp .env.example .env
```

Öffne die neue Datei `.env` in einem Editor und trage vier Werte ein:

```ini
# Ein zufälliger Schlüssel für die Anmeldung. Erzeugen mit dem Befehl unten.
JWT_SECRET=

# Zugangsdaten aus Schritt 3
DATABASE_URL=mysql://autoki:DEIN_PASSWORT@localhost:3306/autoki

# Lokale Anmeldung ohne OAuth-Server
DEV_AUTH_ENABLED=true

PORT=3000
```

Den Schlüssel erzeugst du so — die Ausgabe kommt hinter `JWT_SECRET=`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

`VITE_APP_ID` und `OAUTH_SERVER_URL` lässt du leer. Sie werden nur für die
Anmeldung über die Manus-Plattform gebraucht, die du lokal nicht hast.

> ### Was `DEV_AUTH_ENABLED=true` bedeutet
>
> Normalerweise läuft die Anmeldung über einen externen OAuth-Server, für den ein
> lokaler Rechner keine Zugangsdaten hat. Mit dieser Einstellung meldet dich der
> Server stattdessen direkt als fester lokaler Benutzer an.
>
> Das heißt aber auch: **jeder, der deinen Laptop im Netzwerk erreicht, kommt ohne
> Passwort hinein.** Im Heim- oder Werkstatt-WLAN ist das in Ordnung, im offenen
> Netz nicht. Der Server verweigert den Start, wenn diese Einstellung mit
> `NODE_ENV=production` kombiniert wird — als Absicherung gegen ein Versehen.

---

## 5. Datenbanktabellen anlegen

```bash
pnpm db:push
```

Erwartete Ausgabe am Ende:

```
[✓] migrations applied successfully!
```

---

## 6. Server starten

```bash
pnpm dev
```

So sieht ein erfolgreicher Start aus:

```
[Env] Development login is ENABLED — /api/oauth/login signs in as "dev-user" without any credentials. For local testing only.
[LLM] Initialised (active provider: openrouter, configured: false)
[Server] OBD streaming enabled, but no ports are allowed (set OBD_ALLOWED_PORTS)
Server running on http://localhost:3000/
```

Die drei Zeilen sind alle **normal**, keine Fehler:

- Die erste ist die beabsichtigte Warnung zur lokalen Anmeldung.
- `configured: false` heißt nur, dass keine KI-Analyse eingerichtet ist. Die App
  läuft trotzdem und nutzt einen eingebauten Katalog gängiger Fehlercodes.
- `no ports are allowed` betrifft ausschließlich USB-Adapter am Laptop. Für das
  Tablet spielt es keine Rolle.

Zwei Hinweise wie `%VITE_APP_TITLE% is not defined` sind ebenfalls harmlos.

**Das Terminalfenster bleibt offen**, solange du den Server nutzt. Beenden mit
`Strg + C`.

Teste im Browser auf dem Laptop: <http://localhost:3000> — du solltest die
Anwendung sehen.

---

## 7. Die IP-Adresse des Laptops herausfinden

Das Tablet erreicht den Laptop nicht über `localhost`, sondern über dessen
Adresse im WLAN.

**Windows** (Eingabeaufforderung):

```
ipconfig
```

Suche unter dem WLAN-Adapter nach `IPv4-Adresse`, z. B. `192.168.1.42`.

**macOS:**

```bash
ipconfig getifaddr en0
```

**Linux:**

```bash
hostname -I | awk '{print $1}'
```

Die Adresse beginnt fast immer mit `192.168.` oder `10.`.

### Firewall

Beim ersten Start fragt Windows eventuell, ob Node.js im Netzwerk kommunizieren
darf — **erlauben** (privates Netzwerk genügt). Ohne das kommt das Tablet nicht
durch. Falls du die Frage weggeklickt hast: Windows-Firewall → Eingehende Regel
für Port `3000` (TCP) freigeben.

Schneller Test **vom Tablet aus**: öffne im Tablet-Browser
`http://192.168.1.42:3000` (mit deiner Adresse). Erscheint die Anwendung, ist der
Weg frei.

---

## 8. Die App auf dem Tablet verbinden

1. **AutoKI Diagnostik** auf dem Tablet öffnen.
2. Beim ersten Start fragt sie nach der Server-Adresse. Trage ein:

   ```
   http://192.168.1.42:3000
   ```

   Mit deiner Adresse aus Schritt 7. Achte auf `http://` (nicht `https`) und auf
   den Port `:3000`. Kein Schrägstrich und kein Leerzeichen am Ende.

3. **Speichern** → die App zeigt den Anmeldebildschirm.
4. **Anmelden** antippen. Weil der Entwickler-Login aktiv ist, landest du sofort
   im Dashboard — es wird kein Passwort abgefragt.

Die Adresse lässt sich später jederzeit unter **Einstellungen** ändern.

---

## 9. OBD-Adapter mit dem Tablet koppeln

Der Adapter wird mit dem **Tablet** gekoppelt, nicht mit dem Laptop.

1. Adapter in die OBD-Buchse des Autos stecken (meist im Fußraum links unterhalb
   des Lenkrads).
2. Zündung einschalten (Motor muss nicht laufen).
3. Tablet: **Einstellungen → Bluetooth**, Adapter suchen und koppeln. Übliche PINs
   sind `1234` oder `0000`.
4. In der AutoKI-App den gekoppelten Adapter auswählen und die Diagnose starten.

Die App listet nur **bereits gekoppelte** Geräte auf — das Koppeln passiert immer
zuerst in den Android-Einstellungen.

---

## Wenn etwas nicht funktioniert

| Symptom                                            | Ursache und Lösung                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL is required` beim Start              | `.env` fehlt oder liegt nicht im Projektordner. `cp .env.example .env` wiederholen und ausfüllen.                                  |
| `ECONNREFUSED ... 3306`                            | MySQL läuft nicht. Windows: Dienst „MySQL“ starten. macOS: `brew services start mysql`. Linux: `sudo systemctl start mysql`.       |
| `Access denied for user 'autoki'`                  | Passwort in `DATABASE_URL` stimmt nicht mit Schritt 3 überein.                                                                     |
| Server startet nicht: `JWT_SECRET` zu kurz         | Mindestens 32 Zeichen. Den Befehl aus Schritt 4 nutzen.                                                                            |
| Tablet-Browser erreicht den Laptop nicht           | Andere WLANs; oder Firewall blockt Port 3000; oder Gast-WLAN mit Client-Isolation. Beide Geräte ins selbe reguläre WLAN.           |
| App meldet „Server-Adresse ist nicht konfiguriert“ | Adresse wurde nicht gespeichert — Einstellungen öffnen und erneut eintragen.                                                       |
| App zeigt Netzwerkfehler, Browser geht             | Meist ein Tippfehler: `https` statt `http`, fehlender Port `:3000`, oder falsche IP.                                               |
| Adapter erscheint nicht in der App                 | Er ist noch nicht in den Android-Bluetooth-Einstellungen gekoppelt.                                                                |
| Nach einem Laptop-Neustart geht nichts mehr        | `pnpm dev` läuft nicht mehr. Terminal öffnen, in den Projektordner wechseln, erneut starten. Auch die IP kann sich geändert haben. |

Die IP-Adresse kann der Router nach einem Neustart neu vergeben. Wenn die App
plötzlich nichts mehr findet, ist das der erste Punkt zum Prüfen — oder du
vergibst dem Laptop im Router eine feste Adresse.

---

## Für den Dauerbetrieb

`pnpm dev` ist der Entwicklungsmodus: er startet neu, sobald sich Code ändert,
und ist etwas langsamer. Wenn der Server dauerhaft laufen soll:

```bash
pnpm build
pnpm start
```

Achtung: `pnpm start` setzt `NODE_ENV=production`, und in Produktion ist der
Entwickler-Login gesperrt — der Server startet dann bewusst gar nicht erst.
Für den Dauerbetrieb brauchst du also entweder echte OAuth-Zugangsdaten oder du
bleibst bei `pnpm dev`.
