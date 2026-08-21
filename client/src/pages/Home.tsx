import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, TrendingUp, Shield, BarChart3, Cpu } from "lucide-react";
import { APP_LOGO, getLoginUrl } from "@/const";
import { useEffect } from "react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    // Wait for the session query to settle: isAuthenticated is false while it
    // is still loading, so acting on it early bounces signed-in users back here.
    if (loading) return;
    if (isAuthenticated && user) {
      window.location.href = "/dashboard";
    }
  }, [loading, isAuthenticated, user]);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-blue-900/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={APP_LOGO} alt="AutoKI Logo" className="h-10 w-10" />
            <span className="text-xl font-bold text-white">
              AutoKI Assistent
            </span>
          </div>
          <div className="flex items-center gap-4">
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            ) : (
              <Button
                onClick={() => (window.location.href = getLoginUrl())}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Login
              </Button>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 sm:py-32">
        <div className="absolute inset-0 opacity-30">
          <picture>
            <source srcSet="/autoki-hero-banner.webp" type="image/webp" />
            <img
              src="/autoki-hero-banner.jpg"
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover"
            />
          </picture>
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-transparent to-slate-950" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <Badge className="w-fit bg-blue-600/20 text-blue-300 border-blue-500/30">
                  🚗 Automotive AI Diagnostics
                </Badge>
                <h1 className="text-5xl sm:text-6xl font-bold text-white leading-tight">
                  Intelligente Fahrzeugdiagnose mit KI
                </h1>
                <p className="text-xl text-blue-100 leading-relaxed">
                  Verbinden Sie sich mit der Motorsteuerung Ihres Fahrzeugs über
                  OBD und erhalten Sie sofortige, präzise Diagnosen. Die
                  perfekte Plattform für Automechaniker und Fahrzeugbegeisterte.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  size="lg"
                  onClick={() => (window.location.href = getLoginUrl())}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-lg px-8"
                >
                  Jetzt Starten
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="border-blue-400 text-blue-300 hover:bg-blue-950"
                >
                  <a href="#funktionen">Mehr Erfahren</a>
                </Button>
              </div>

              <div className="flex items-center gap-6 text-sm text-blue-200">
                <div>✓ Echtzeit-Diagnose</div>
                <div>✓ KI-Analyse</div>
                <div>✓ Sichere Daten</div>
              </div>
            </div>

            <div className="hidden md:block">
              <picture>
                <source srcSet="/autoki-hero-banner.webp" type="image/webp" />
                <img
                  src="/autoki-hero-banner.jpg"
                  alt="Diagnose-Oberfläche mit Live-Motordaten"
                  loading="lazy"
                  decoding="async"
                  className="rounded-lg shadow-2xl border border-blue-500/30"
                />
              </picture>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="funktionen" className="py-20 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              Kernfunktionen
            </h2>
            <p className="text-xl text-blue-200">
              Alles, was Sie für professionelle Fahrzeugdiagnosen benötigen
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Zap,
                title: "Echtzeit OBD-Diagnose",
                description:
                  "Verbinden Sie sich direkt mit der Motorsteuerung über OBD-II und lesen Sie Echtzeitdaten aus.",
              },
              {
                icon: Cpu,
                title: "KI-gestützte Analyse",
                description:
                  "Intelligente Fehleranalyse mit KI-Empfehlungen für Reparaturen und Wartung.",
              },
              {
                icon: TrendingUp,
                title: "Datenvisualisierung",
                description:
                  "Umfassende Grafiken und Berichte für detaillierte Fahrzeuganalysen.",
              },
              {
                icon: BarChart3,
                title: "Historische Daten",
                description:
                  "Verfolgen Sie Fahrzeugmetriken über die Zeit und identifizieren Sie Trends.",
              },
              {
                icon: Shield,
                title: "Sichere Verwaltung",
                description:
                  "Verschlüsselte Speicherung aller Diagnosedaten mit Benutzerauthentifizierung.",
              },
              {
                icon: Cpu,
                title: "Multi-Fahrzeug Support",
                description:
                  "Verwalten Sie mehrere Fahrzeuge und deren Diagnoseverlauf in einer Plattform.",
              },
            ].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={idx}
                  className="bg-slate-800/50 border-blue-500/20 hover:border-blue-500/50 transition-all hover:shadow-lg hover:shadow-blue-500/20"
                >
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-blue-600/20 rounded-lg">
                        <Icon className="h-6 w-6 text-blue-400" />
                      </div>
                    </div>
                    <CardTitle className="text-white">
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-blue-200">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="ablauf" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">
              So funktioniert es
            </h2>
            <p className="text-xl text-blue-200">
              Drei einfache Schritte zur Fahrzeugdiagnose
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Verbinden",
                description:
                  "Verbinden Sie Ihr OBD-Gerät mit dem Fahrzeug und der Plattform.",
              },
              {
                step: "2",
                title: "Diagnostizieren",
                description:
                  "Starten Sie eine Diagnose und erhalten Sie Echtzeitdaten von der Motorsteuerung.",
              },
              {
                step: "3",
                title: "Analysieren",
                description:
                  "Nutzen Sie KI-gestützte Analysen für Reparaturempfehlungen und Wartungsplanung.",
              },
            ].map((item, idx) => (
              <div key={idx} className="relative">
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-2xl font-bold text-white mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2 text-center">
                    {item.title}
                  </h3>
                  <p className="text-blue-200 text-center">
                    {item.description}
                  </p>
                </div>
                {idx < 2 && (
                  <div className="hidden md:block absolute top-8 -right-4 w-8 h-1 bg-gradient-to-r from-blue-600 to-transparent" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-blue-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Bereit für intelligente Fahrzeugdiagnose?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Treten Sie Tausenden von Mechanikern bei, die AutoKI Assistent
            vertrauen.
          </p>
          <Button
            size="lg"
            onClick={() => (window.location.href = getLoginUrl())}
            className="bg-white text-blue-600 hover:bg-blue-50 text-lg px-8"
          >
            Kostenlos Starten
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-blue-900/20 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <h4 className="text-white font-bold mb-4">AutoKI Assistent</h4>
              <p className="text-blue-200 text-sm">
                Professionelle Fahrzeugdiagnose mit KI-Unterstützung.
              </p>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">Produkt</h4>
              <ul className="space-y-2 text-blue-200 text-sm">
                <li>
                  <a href="#funktionen" className="hover:text-blue-400">
                    Funktionen
                  </a>
                </li>
                <li>
                  <a href="#ablauf" className="hover:text-blue-400">
                    So funktioniert es
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">
                Unterstützte Hardware
              </h4>
              <ul className="space-y-2 text-blue-200 text-sm">
                <li>ELM327 (USB / Bluetooth)</li>
                <li>D-CAN Adapter</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-blue-900/20 pt-8 text-center text-blue-300 text-sm">
            <p>
              &copy; {new Date().getFullYear()} AutoKI Assistent. Alle Rechte
              vorbehalten.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
