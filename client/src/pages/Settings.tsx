import { useAuth } from "@/_core/hooks/useAuth";
import AppNav from "@/components/AppNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Cpu, LogOut, Usb } from "lucide-react";

/**
 * Account and server configuration overview.
 *
 * The settings icon in the navigation used to link here while the route did not
 * exist, so every click produced a 404.
 */
export default function Settings() {
  const { user, logout } = useAuth();
  const llmStatus = trpc.llm.status.useQuery();
  const ports = trpc.obd.devices.availablePorts.useQuery();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      <AppNav title="Einstellungen" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Einstellungen</h1>
          <p className="text-blue-200">Konto und Serverkonfiguration</p>
        </div>

        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardHeader>
            <CardTitle className="text-white">Konto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between gap-4">
              <span className="text-blue-300">Name</span>
              <span className="text-white">{user?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-blue-300">E-Mail</span>
              <span className="text-white break-all">{user?.email ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-blue-300">Rolle</span>
              <Badge className="bg-blue-600/20 text-blue-300">{user?.role ?? "—"}</Badge>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-blue-300">Anmeldeverfahren</span>
              <span className="text-white">{user?.loginMethod ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-blue-300">Zuletzt angemeldet</span>
              <span className="text-white">{formatDateTime(user?.lastSignedIn)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Cpu className="h-5 w-5 text-blue-400" />
              KI-Analyse
            </CardTitle>
            <CardDescription className="text-blue-300">
              Interpretation von Fehlercodes durch ein Sprachmodell
            </CardDescription>
          </CardHeader>
          <CardContent>
            {llmStatus.isLoading ? (
              <p className="text-blue-300">Wird geladen…</p>
            ) : llmStatus.data?.available ? (
              <p className="text-green-300">
                Aktiv — Anbieter: <span className="font-mono">{llmStatus.data.provider}</span>
              </p>
            ) : (
              <p className="text-blue-200">
                Kein Anbieter konfiguriert. Setzen Sie <code className="font-mono">OPENROUTER_API_KEY</code>{" "}
                oder <code className="font-mono">LMSTUDIO_BASE_URL</code>. Ohne Anbieter werden
                hinterlegte Standardhinweise verwendet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Usb className="h-5 w-5 text-blue-400" />
              OBD-Schnittstellen
            </CardTitle>
            <CardDescription className="text-blue-300">
              Freigegebene serielle Ports auf diesem Server
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ports.isLoading ? (
              <p className="text-blue-300">Wird geladen…</p>
            ) : (ports.data?.length ?? 0) === 0 ? (
              <p className="text-blue-200">
                Keine Ports freigegeben. Setzen Sie <code className="font-mono">OBD_ALLOWED_PORTS</code>{" "}
                in der Serverkonfiguration.
              </p>
            ) : (
              <ul className="space-y-2">
                {ports.data?.map(port => (
                  <li key={port.path} className="flex items-center justify-between gap-3">
                    <span className="text-white font-mono break-all">{port.path}</span>
                    <Badge
                      className={
                        port.isPresent
                          ? "bg-green-600/20 text-green-300 shrink-0"
                          : "bg-slate-600/30 text-slate-300 shrink-0"
                      }
                    >
                      {port.isPresent ? "verbunden" : "nicht verbunden"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Button variant="destructive" onClick={() => void logout()}>
          <LogOut className="h-4 w-4 mr-2" />
          Abmelden
        </Button>
      </div>
    </div>
  );
}
