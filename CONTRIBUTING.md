# Contributing to AutoKI Assistent

Vielen Dank für Ihr Interesse an der Mitarbeit am AutoKI Assistent Projekt! Dieses Dokument enthält Richtlinien und Anweisungen für Beiträge.

## Code of Conduct

Wir verpflichten uns zu einem offenen und einladenden Umfeld. Alle Teilnehmer sollten sich respektvoll und professionell verhalten.

## Wie kann ich beitragen?

### 1. Bugs melden

Wenn Sie einen Bug finden, erstellen Sie bitte ein Issue mit:
- Klarer Beschreibung des Problems
- Schritte zur Reproduktion
- Erwartetes Verhalten
- Aktuelles Verhalten
- Screenshots (falls relevant)
- System-Informationen (OS, Browser, Node-Version)

### 2. Feature-Anfragen

Feature-Anfragen sind willkommen! Bitte:
- Beschreiben Sie die gewünschte Funktionalität
- Erklären Sie den Use-Case
- Geben Sie Beispiele an

### 3. Code-Beiträge

#### Vorbereitung
1. **Fork** das Repository
2. **Clone** Ihren Fork: `git clone https://github.com/YOUR_USERNAME/auto-ki-assistent.git`
3. **Branch** erstellen: `git checkout -b feature/your-feature-name`

#### Entwicklung
1. Installieren Sie Abhängigkeiten: `pnpm install`
2. Starten Sie den Dev-Server: `pnpm dev`
3. Machen Sie Ihre Änderungen
4. Schreiben Sie Tests für neue Features
5. Führen Sie Tests aus: `pnpm test`
6. Linting durchführen: `pnpm lint`

#### Commit-Nachrichten
Verwenden Sie aussagekräftige Commit-Nachrichten:
```
feat: Add OBD parameter streaming
fix: Resolve database connection timeout
docs: Update API documentation
test: Add diagnostic interface tests
refactor: Simplify error handling
```

#### Push & Pull Request
1. **Push** zu Ihrem Fork: `git push origin feature/your-feature-name`
2. Erstellen Sie einen **Pull Request** auf GitHub
3. Beschreiben Sie Ihre Änderungen im PR
4. Verlinken Sie relevante Issues

### Pull Request Richtlinien

- **Titel**: Kurz und aussagekräftig
- **Beschreibung**: 
  - Was wurde geändert?
  - Warum wurde es geändert?
  - Wie wurde es getestet?
- **Tests**: Alle neuen Features sollten Tests haben
- **Dokumentation**: Aktualisieren Sie die Dokumentation
- **Keine Breaking Changes**: Oder dokumentieren Sie sie klar

## Development Setup

### Anforderungen
- Node.js 18+
- MySQL 8.0+
- Git

### Installation
```bash
git clone https://github.com/pawel27111/auto-ki-assistent.git
cd auto-ki-assistent
pnpm install
pnpm dev
```

## Projekt-Struktur

```
client/              # Frontend
├── src/
│   ├── pages/      # Seiten
│   ├── components/ # UI-Komponenten
│   └── lib/        # Utilities
server/             # Backend
├── _core/          # Kern-Module
├── obdRouter.ts    # OBD API
└── db.ts           # Datenbankfunktionen
drizzle/            # Datenbank-Schema
```

## Code-Stil

### TypeScript
- Nutzen Sie strikte Typisierung
- Vermeiden Sie `any` wo möglich
- Schreiben Sie aussagekräftige Variablennamen

### React
- Nutzen Sie Functional Components
- Verwenden Sie Hooks
- Schreiben Sie aussagekräftige Komponenten-Namen

### Formatierung
- Verwenden Sie Prettier für Formatierung
- Verwenden Sie ESLint für Linting
- 2 Spaces für Indentation

## Testing

### Frontend Tests
```bash
pnpm test
```

### Backend Tests
```bash
pnpm test:server
```

### Coverage
```bash
pnpm test:coverage
```

## Dokumentation

- Aktualisieren Sie README.md für größere Änderungen
- Schreiben Sie JSDoc-Kommentare für komplexe Funktionen
- Dokumentieren Sie neue API-Endpoints

## Performance

- Vermeiden Sie unnötige Re-Renders
- Optimieren Sie Datenbankabfragen
- Nutzen Sie Caching wo sinnvoll
- Testen Sie auf Performance-Regressions

## Security

- Validieren Sie alle Benutzereingaben
- Verwenden Sie parameterisierte Queries
- Speichern Sie Secrets NICHT in Git
- Führen Sie regelmäßige Security-Audits durch

## Lizenz

Durch Beiträge erklären Sie sich damit einverstanden, dass Ihre Arbeit unter der MIT-Lizenz lizenziert wird.

## Fragen?

- Erstellen Sie ein Issue
- Kontaktieren Sie das Team
- Lesen Sie die Dokumentation

---

**Vielen Dank für Ihre Beiträge! 🚀**
