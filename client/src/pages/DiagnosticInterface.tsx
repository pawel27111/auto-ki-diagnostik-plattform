import AppNav from "@/components/AppNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DIAGNOSTIC_STATUS_LABELS,
  formatDateTime,
  formatMeasurement,
  SEVERITY_CLASSES,
  SEVERITY_LABELS,
  toPercent,
} from "@/lib/format";
import { downloadReportCsv } from "@/lib/report";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  Download,
  Gauge,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";

/** Read a positive integer query parameter, or null. */
function numericParam(search: string, key: string): number | null {
  const raw = new URLSearchParams(search).get(key);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function DiagnosticInterface() {
  const search = useSearch();
  const utils = trpc.useUtils();

  const vehiclesQuery = trpc.obd.vehicles.list.useQuery();
  const vehicles = useMemo(
    () => vehiclesQuery.data ?? [],
    [vehiclesQuery.data]
  );

  // The user's explicit pick. Null means "not chosen yet", which lets the
  // default below apply without an effect that copies data into state — that
  // pattern costs an extra render and can cascade.
  const [pickedVehicleId, setPickedVehicleId] = useState<number | null>(null);
  const [diagnosticId, setDiagnosticId] = useState<number | null>(() =>
    numericParam(search, "diagnosticId")
  );

  const defaultVehicleId = useMemo(() => {
    const fromQuery = numericParam(search, "vehicleId");
    if (fromQuery && vehicles.some(vehicle => vehicle.id === fromQuery))
      return fromQuery;
    return vehicles.length === 1 ? vehicles[0].id : null;
  }, [search, vehicles]);

  const selectedVehicleId = pickedVehicleId ?? defaultVehicleId;

  const diagnosticQuery = trpc.obd.diagnostics.getById.useQuery(
    { diagnosticId: diagnosticId ?? 0 },
    { enabled: diagnosticId !== null }
  );
  const parametersQuery = trpc.obd.diagnostics.getParameters.useQuery(
    { diagnosticId: diagnosticId ?? 0 },
    { enabled: diagnosticId !== null }
  );
  const errorCodesQuery = trpc.obd.diagnostics.getErrorCodes.useQuery(
    { diagnosticId: diagnosticId ?? 0 },
    { enabled: diagnosticId !== null }
  );
  const llmStatusQuery = trpc.llm.status.useQuery();

  const diagnostic = diagnosticQuery.data ?? null;
  const parameters = parametersQuery.data ?? [];
  const errorCodes = errorCodesQuery.data ?? [];
  const vehicle =
    vehicles.find(candidate => candidate.id === diagnostic?.vehicleId) ?? null;

  const simulate = trpc.obd.mock.simulateDiagnostic.useMutation();
  const analyze = trpc.llm.analyzeDiagnostic.useMutation();

  const startDiagnostic = trpc.obd.diagnostics.start.useMutation({
    onError: error => toast.error(error.message),
  });

  const isScanning = startDiagnostic.isPending || simulate.isPending;

  async function handleStart() {
    if (!selectedVehicleId) {
      toast.error("Bitte wählen Sie ein Fahrzeug aus");
      return;
    }

    try {
      const started = await startDiagnostic.mutateAsync({
        vehicleId: selectedVehicleId,
        diagnosticType: "full_scan",
      });

      // Without connected hardware the simulator fills the session. Every row
      // it writes is flagged isSimulated and labelled in the UI below.
      await simulate.mutateAsync({ diagnosticId: started.diagnosticId });

      setDiagnosticId(started.diagnosticId);
      await Promise.all([
        utils.obd.diagnostics.invalidate(),
        utils.obd.vehicles.list.invalidate(),
      ]);
      toast.success("Diagnose abgeschlossen");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Diagnose fehlgeschlagen"
      );
    }
  }

  function handleReset() {
    setDiagnosticId(null);
    analyze.reset();
  }

  function handleDownload() {
    if (!diagnostic) return;
    downloadReportCsv({
      vehicle,
      diagnostic,
      parameters,
      errorCodes,
    });
  }

  const analysisByCode = useMemo(
    () =>
      new Map(
        (analyze.data?.analyses ?? []).map(analysis => [
          analysis.code,
          analysis,
        ])
      ),
    [analyze.data]
  );

  const hasSimulatedData = parameters.some(parameter => parameter.isSimulated);
  const isLoadingDiagnostic =
    diagnosticId !== null &&
    (diagnosticQuery.isLoading ||
      parametersQuery.isLoading ||
      errorCodesQuery.isLoading);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      <AppNav title="OBD Diagnose" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">
            OBD-II Diagnose Interface
          </h1>
          <p className="text-blue-200">
            Wählen Sie ein Fahrzeug und führen Sie eine vollständige Diagnose
            durch. Für Live-Daten von echter Hardware nutzen Sie die
            Echtzeit-Diagnose.
          </p>
        </div>

        <Card className="bg-slate-800/50 border-blue-500/20 mb-8">
          <CardHeader>
            <CardTitle className="text-white">Diagnose-Steuerung</CardTitle>
            <CardDescription className="text-blue-300">
              Starten Sie eine Diagnose-Sitzung für eines Ihrer Fahrzeuge
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-blue-200" htmlFor="vehicle-select">
                Fahrzeug auswählen
              </Label>
              {vehiclesQuery.isLoading ? (
                <p className="text-blue-300 text-sm">
                  Fahrzeuge werden geladen…
                </p>
              ) : vehicles.length === 0 ? (
                <p className="text-blue-300 text-sm">
                  Sie haben noch kein Fahrzeug registriert. Legen Sie zuerst im
                  Dashboard eines an.
                </p>
              ) : (
                <Select
                  value={selectedVehicleId ? String(selectedVehicleId) : ""}
                  onValueChange={value => setPickedVehicleId(Number(value))}
                >
                  <SelectTrigger
                    id="vehicle-select"
                    className="bg-slate-700 border-blue-500/30 text-white"
                  >
                    <SelectValue placeholder="— Fahrzeug wählen —" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map(candidate => (
                      <SelectItem
                        key={candidate.id}
                        value={String(candidate.id)}
                      >
                        {candidate.make} {candidate.model} ({candidate.year})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex flex-wrap gap-4">
              <Button
                onClick={() => void handleStart()}
                disabled={isScanning || !selectedVehicleId}
                className="flex-1 min-w-[12rem] bg-green-600 hover:bg-green-700 text-white"
              >
                {isScanning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {isScanning ? "Scan läuft…" : "Diagnose starten"}
              </Button>
              <Button
                onClick={handleReset}
                disabled={diagnosticId === null || isScanning}
                variant="outline"
                className="flex-1 min-w-[12rem] border-blue-500/30 text-blue-300 hover:bg-blue-950"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Zurücksetzen
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoadingDiagnostic && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
          </div>
        )}

        {diagnostic && !isLoadingDiagnostic && (
          <div className="space-y-8">
            {hasSimulatedData && (
              <Card className="bg-amber-950/40 border-amber-500/40">
                <CardContent className="pt-6 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-300 shrink-0 mt-0.5" />
                  <p className="text-amber-200 text-sm">
                    Diese Diagnose enthält <strong>simulierte Werte</strong>.
                    Sie stammen nicht von einem angeschlossenen Fahrzeug und
                    eignen sich nicht als Grundlage für eine
                    Reparaturentscheidung.
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6">
              <Card className="bg-slate-800/50 border-blue-500/20">
                <CardContent className="pt-6 text-center">
                  <Activity className="h-8 w-8 text-blue-400 mx-auto mb-1" />
                  <p className="text-blue-200 text-sm">Status</p>
                  <p className="text-white font-semibold">
                    {DIAGNOSTIC_STATUS_LABELS[diagnostic.status] ??
                      diagnostic.status}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-slate-800/50 border-red-500/20">
                <CardContent className="pt-6 text-center">
                  <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-1" />
                  <p className="text-blue-200 text-sm">Fehler</p>
                  <p className="text-white font-semibold">
                    {diagnostic.errorCount}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-slate-800/50 border-yellow-500/20">
                <CardContent className="pt-6 text-center">
                  <AlertTriangle className="h-8 w-8 text-yellow-400 mx-auto mb-1" />
                  <p className="text-blue-200 text-sm">Warnungen</p>
                  <p className="text-white font-semibold">
                    {diagnostic.warningCount}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-slate-800/50 border-blue-500/20">
                <CardContent className="pt-6 text-center">
                  <Zap className="h-8 w-8 text-blue-400 mx-auto mb-1" />
                  <p className="text-blue-200 text-sm">Parameter</p>
                  <p className="text-white font-semibold">
                    {parameters.length}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="parameters" className="space-y-6">
              <TabsList className="bg-slate-800/50 border border-blue-500/20">
                <TabsTrigger value="parameters" className="text-blue-200">
                  OBD-Parameter
                </TabsTrigger>
                <TabsTrigger value="errors" className="text-blue-200">
                  Fehlercodes ({errorCodes.length})
                </TabsTrigger>
                <TabsTrigger value="summary" className="text-blue-200">
                  Zusammenfassung
                </TabsTrigger>
              </TabsList>

              <TabsContent value="parameters" className="space-y-4">
                {parameters.length === 0 ? (
                  <Card className="bg-slate-800/50 border-blue-500/20">
                    <CardContent className="pt-6 text-center text-blue-200">
                      Keine Parameter erfasst
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid md:grid-cols-2 gap-6">
                    {parameters.map(parameter => (
                      <Card
                        key={parameter.id}
                        className={`bg-slate-800/50 border-2 ${
                          parameter.isNormal
                            ? "border-green-500/30"
                            : "border-red-500/30"
                        }`}
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <CardTitle className="text-white text-lg">
                                {parameter.parameterName}
                              </CardTitle>
                              <CardDescription className="text-blue-300">
                                PID {parameter.parameterId}
                              </CardDescription>
                            </div>
                            <Badge
                              className={
                                parameter.isNormal
                                  ? "bg-green-600/20 text-green-300 shrink-0"
                                  : "bg-red-600/20 text-red-300 shrink-0"
                              }
                            >
                              {parameter.isNormal ? "OK" : "AUFFÄLLIG"}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-blue-300">
                              Aktueller Wert:
                            </span>
                            <span className="text-2xl font-bold text-white">
                              {formatMeasurement(
                                parameter.value,
                                parameter.unit
                              )}
                            </span>
                          </div>
                          {parameter.minValue !== null &&
                            parameter.maxValue !== null && (
                              <>
                                <div className="text-sm text-blue-300">
                                  Bereich:{" "}
                                  {formatMeasurement(
                                    parameter.minValue,
                                    parameter.unit
                                  )}{" "}
                                  –{" "}
                                  {formatMeasurement(
                                    parameter.maxValue,
                                    parameter.unit
                                  )}
                                </div>
                                <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                                  <div
                                    className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full"
                                    style={{
                                      width: `${toPercent(
                                        parameter.value,
                                        parameter.minValue,
                                        parameter.maxValue
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </>
                            )}
                          {parameter.isSimulated && (
                            <p className="text-xs text-amber-300">
                              Simulierter Wert
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="errors" className="space-y-4">
                {errorCodes.length > 0 && (
                  <div className="flex justify-end">
                    <Button
                      onClick={() =>
                        analyze.mutate({ diagnosticId: diagnostic.id })
                      }
                      disabled={
                        analyze.isPending || !llmStatusQuery.data?.available
                      }
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {analyze.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      KI-Analyse
                    </Button>
                  </div>
                )}

                {llmStatusQuery.data &&
                  !llmStatusQuery.data.available &&
                  errorCodes.length > 0 && (
                    <p className="text-sm text-blue-300">
                      Kein KI-Anbieter konfiguriert — es werden hinterlegte
                      Standardhinweise verwendet.
                    </p>
                  )}

                {analyze.error && (
                  <p className="text-sm text-red-400">
                    {analyze.error.message}
                  </p>
                )}

                {errorCodes.length === 0 ? (
                  <Card className="bg-slate-800/50 border-green-500/20">
                    <CardContent className="pt-6 text-center">
                      <p className="text-green-300">
                        ✓ Keine Fehlercodes gefunden
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  errorCodes.map(errorCode => {
                    const analysis = analysisByCode.get(errorCode.code);
                    return (
                      <Card
                        key={errorCode.id}
                        className={`bg-slate-800/50 border-l-4 ${
                          errorCode.severity === "critical"
                            ? "border-l-red-600"
                            : errorCode.severity === "error"
                              ? "border-l-orange-500"
                              : "border-l-yellow-500"
                        }`}
                      >
                        <CardContent className="pt-6 space-y-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <code className="text-lg font-bold text-blue-300">
                              {errorCode.code}
                            </code>
                            <Badge
                              className={SEVERITY_CLASSES[errorCode.severity]}
                            >
                              {SEVERITY_LABELS[errorCode.severity] ??
                                errorCode.severity}
                            </Badge>
                            {errorCode.system && (
                              <Badge className="bg-blue-600/20 text-blue-300">
                                {errorCode.system}
                              </Badge>
                            )}
                          </div>
                          {errorCode.description && (
                            <p className="text-white">
                              {errorCode.description}
                            </p>
                          )}

                          {analysis && (
                            <div className="mt-4 p-4 bg-blue-600/10 border border-blue-500/30 rounded-lg space-y-2">
                              <p className="text-blue-200 text-sm font-semibold">
                                Analyse
                                <span className="ml-2 font-normal text-blue-400">
                                  (
                                  {analysis.source === "fallback"
                                    ? "Standardhinweis"
                                    : analysis.source}
                                  )
                                </span>
                              </p>
                              <p className="text-blue-100 text-sm">
                                {analysis.rootCause}
                              </p>
                              <ul className="text-blue-300 text-sm space-y-1 list-disc list-inside">
                                {analysis.recommendations.map(
                                  recommendation => (
                                    <li key={recommendation}>
                                      {recommendation}
                                    </li>
                                  )
                                )}
                              </ul>
                              <p className="text-blue-300 text-sm">
                                Geschätzte Kosten:{" "}
                                {analysis.estimatedRepairCost}
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </TabsContent>

              <TabsContent value="summary" className="space-y-4">
                <Card className="bg-slate-800/50 border-blue-500/20">
                  <CardHeader>
                    <CardTitle className="text-white">
                      Diagnose-Zusammenfassung
                    </CardTitle>
                    <CardDescription className="text-blue-300">
                      {vehicle
                        ? `${vehicle.make} ${vehicle.model} (${vehicle.year})`
                        : "Fahrzeug"}{" "}
                      · {formatDateTime(diagnostic.startedAt)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      {[
                        {
                          label: "Motortemperatur",
                          value: diagnostic.engineTemperature,
                          unit: "°C",
                        },
                        {
                          label: "Drehzahl",
                          value: diagnostic.rpm,
                          unit: "rpm",
                        },
                        {
                          label: "Geschwindigkeit",
                          value: diagnostic.speed,
                          unit: "km/h",
                        },
                        {
                          label: "Kraftstoffdruck",
                          value: diagnostic.fuelPressure,
                          unit: "kPa",
                        },
                        {
                          label: "Lambdasonde",
                          value: diagnostic.oxygenSensor,
                          unit: "V",
                        },
                      ].map(entry => (
                        <div
                          key={entry.label}
                          className="p-4 bg-slate-700/50 rounded-lg"
                        >
                          <p className="text-blue-300 text-sm mb-1">
                            {entry.label}
                          </p>
                          <p className="text-2xl font-bold text-white flex items-center gap-2">
                            <Gauge className="h-5 w-5 text-blue-400 shrink-0" />
                            {formatMeasurement(entry.value, entry.unit)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Button
                  onClick={handleDownload}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Bericht als CSV herunterladen
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {diagnosticId === null && !isScanning && (
          <Card className="bg-slate-800/50 border-blue-500/20">
            <CardContent className="pt-12 pb-12 text-center">
              <Activity className="h-16 w-16 text-blue-400 mx-auto mb-4 opacity-50" />
              <p className="text-blue-200 text-lg">
                Starten Sie eine Diagnose-Sitzung, um OBD-Daten anzuzeigen
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
