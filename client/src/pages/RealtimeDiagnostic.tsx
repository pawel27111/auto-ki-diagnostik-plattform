import AppNav from "@/components/AppNav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOBDStreaming } from "@/hooks/useOBDStreaming";
import { formatMeasurement, SEVERITY_CLASSES, SEVERITY_LABELS } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Activity, AlertCircle, Gauge, Loader2, Thermometer, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/** Live readings shown at once; the hook keeps a larger ring buffer. */
const VISIBLE_PARAMETERS = 12;

function parameterIcon(name: string) {
  if (name.includes("RPM")) return <Gauge className="w-5 h-5" />;
  if (name.includes("Temperature")) return <Thermometer className="w-5 h-5" />;
  if (name.includes("Pressure")) return <Zap className="w-5 h-5" />;
  return <Activity className="w-5 h-5" />;
}

export default function RealtimeDiagnostic() {
  const {
    isConnected,
    isBusy,
    activeSession,
    parameters,
    errorCodes,
    error,
    clearError,
    startDiagnostic,
    stopDiagnostic,
    readErrorCodes,
    clearErrorCodes,
  } = useOBDStreaming();

  const vehiclesQuery = trpc.obd.vehicles.list.useQuery();
  const portsQuery = trpc.obd.devices.availablePorts.useQuery();

  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);
  const ports = useMemo(() => portsQuery.data ?? [], [portsQuery.data]);

  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [selectedPort, setSelectedPort] = useState<string>("");
  const [isClearDialogOpen, setClearDialogOpen] = useState(false);

  // Default to the only sensible choice when there is exactly one.
  useEffect(() => {
    setSelectedVehicleId(current => current ?? (vehicles.length === 1 ? vehicles[0].id : null));
  }, [vehicles]);

  useEffect(() => {
    setSelectedPort(current => {
      if (current) return current;
      const present = ports.find(port => port.isPresent);
      return present?.path ?? "";
    });
  }, [ports]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const visibleParameters = parameters.slice(-VISIBLE_PARAMETERS).reverse();
  const canStart = isConnected && !isBusy && selectedVehicleId !== null && selectedPort !== "";

  async function handleStart() {
    if (selectedVehicleId === null || !selectedPort) return;
    clearError();
    await startDiagnostic(selectedVehicleId, selectedPort);
  }

  async function handleClearConfirmed() {
    setClearDialogOpen(false);
    const ok = await clearErrorCodes();
    if (ok) toast.success("Fehlerspeicher gelöscht");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <AppNav title="Echtzeit-Diagnose" />

      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Echtzeit-Fahrzeugdiagnose</h1>
          <p className="text-slate-300">Live OBD-Datenerfassung von angeschlossener Hardware</p>
        </div>

        <Card className="bg-slate-800 border-slate-700 mb-6">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <span
                className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
                aria-hidden="true"
              />
              Verbindungsstatus
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-300">
              {isConnected ? "Mit Server verbunden" : "Keine Verbindung zum Server"}
            </p>
            {error && <p className="text-red-400 mt-2">{error}</p>}
          </CardContent>
        </Card>

        {ports.length === 0 && !portsQuery.isLoading && (
          <Card className="bg-amber-950/40 border-amber-500/40 mb-6">
            <CardContent className="pt-6">
              <p className="text-amber-200 text-sm">
                Auf diesem Server ist kein OBD-Port freigegeben. Setzen Sie{" "}
                <code className="font-mono">OBD_ALLOWED_PORTS</code> in der Serverkonfiguration, um
                Hardware-Diagnosen zu erlauben.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-sm">OBD-Gerät</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="port-select" className="sr-only">
                OBD-Port
              </Label>
              <Select
                value={selectedPort}
                onValueChange={setSelectedPort}
                disabled={ports.length === 0 || activeSession !== null}
              >
                <SelectTrigger id="port-select" className="bg-slate-700 text-white border-slate-600">
                  <SelectValue placeholder="Port wählen" />
                </SelectTrigger>
                <SelectContent>
                  {ports.map(port => (
                    <SelectItem key={port.path} value={port.path} disabled={!port.isPresent}>
                      {port.path}
                      {port.manufacturer ? ` — ${port.manufacturer}` : ""}
                      {port.isPresent ? "" : " (nicht verbunden)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-sm">Fahrzeug</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="vehicle-select" className="sr-only">
                Fahrzeug
              </Label>
              <Select
                value={selectedVehicleId ? String(selectedVehicleId) : ""}
                onValueChange={value => setSelectedVehicleId(Number(value))}
                disabled={vehicles.length === 0 || activeSession !== null}
              >
                <SelectTrigger id="vehicle-select" className="bg-slate-700 text-white border-slate-600">
                  <SelectValue placeholder="Fahrzeug wählen" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map(vehicle => (
                    <SelectItem key={vehicle.id} value={String(vehicle.id)}>
                      {vehicle.make} {vehicle.model} ({vehicle.year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-sm">Aktionen</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2">
              {!activeSession ? (
                <Button
                  onClick={() => void handleStart()}
                  disabled={!canStart}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {isBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Starten
                </Button>
              ) : (
                <Button
                  onClick={() => void stopDiagnostic()}
                  disabled={isBusy}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  {isBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Stoppen
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {activeSession && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Live-Parameter ({parameters.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {visibleParameters.length === 0 ? (
                      <p className="text-slate-400">Keine Daten empfangen…</p>
                    ) : (
                      visibleParameters.map(parameter => (
                        <div
                          key={`${parameter.pid}-${parameter.timestamp}`}
                          className="bg-slate-700 p-3 rounded border border-slate-600"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              {parameterIcon(parameter.name)}
                              <span className="text-white font-medium truncate">{parameter.name}</span>
                            </div>
                            <span
                              className={`font-bold shrink-0 ${
                                parameter.isNormal ? "text-green-400" : "text-red-400"
                              }`}
                            >
                              {formatMeasurement(parameter.value, parameter.unit)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            {new Date(parameter.timestamp).toLocaleTimeString("de-DE")}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Fehlercodes ({errorCodes.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {errorCodes.length === 0 ? (
                      <p className="text-green-400">Keine Fehler erkannt</p>
                    ) : (
                      errorCodes.map(code => (
                        <div
                          key={code.code}
                          className={`p-3 rounded border ${SEVERITY_CLASSES[code.severity]}`}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold">{code.code}</span>
                            <Badge className="bg-slate-900/40">
                              {SEVERITY_LABELS[code.severity] ?? code.severity}
                            </Badge>
                          </div>
                          {code.description && <div className="text-sm mt-1">{code.description}</div>}
                          <div className="text-xs opacity-80 mt-1">{code.system}</div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      onClick={() => void readErrorCodes()}
                      disabled={isBusy}
                      variant="outline"
                      className="flex-1"
                    >
                      Fehlercodes lesen
                    </Button>
                    <Button
                      onClick={() => setClearDialogOpen(true)}
                      disabled={isBusy || errorCodes.length === 0}
                      variant="destructive"
                      className="flex-1"
                    >
                      Löschen
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Diagnose-Sitzung</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-slate-400 text-sm">Port</p>
                    <p className="text-white font-semibold break-all">{activeSession.port}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Status</p>
                    <p className="text-green-400 font-semibold">
                      {activeSession.isActive ? "Aktiv" : "Beendet"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Parameter</p>
                    <p className="text-white font-semibold">{parameters.length}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Fehler</p>
                    <p className="text-white font-semibold">{errorCodes.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Clearing DTCs is irreversible and also wipes freeze frames and
          readiness monitors, which an emissions test needs. */}
      <AlertDialog open={isClearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fehlerspeicher wirklich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dieser Vorgang löscht alle {errorCodes.length} gespeicherten Fehlercodes dauerhaft aus
              dem Steuergerät. Dabei gehen auch Freeze-Frame-Daten und die Readiness-Monitore
              verloren, die für die Abgasuntersuchung benötigt werden. Der Vorgang kann nicht
              rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleClearConfirmed()}
              className="bg-red-600 hover:bg-red-700"
            >
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
