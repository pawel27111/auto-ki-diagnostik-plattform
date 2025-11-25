import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  Activity,
  Gauge,
  Thermometer,
  Zap,
  RotateCcw,
  Play,
  StopCircle,
  Download,
} from "lucide-react";
import { useState, useEffect } from "react";
import { APP_LOGO } from "@/const";

interface OBDParameter {
  id: number;
  parameterId: string;
  parameterName: string;
  value: string;
  unit: string;
  minValue?: string;
  maxValue?: string;
  isNormal: boolean;
}

interface ErrorCode {
  id: number;
  code: string;
  description: string;
  severity: "info" | "warning" | "error" | "critical";
  system: string;
}

interface DiagnosticSession {
  id: number;
  vehicleId: number;
  status: "running" | "completed" | "failed";
  errorCount: number;
  warningCount: number;
  engineTemperature?: string;
  rpm?: string;
  speed?: string;
  fuelPressure?: string;
  oxygenSensor?: string;
  parameters: OBDParameter[];
  errorCodes: ErrorCode[];
}

export default function DiagnosticInterface() {
  const { user, isAuthenticated } = useAuth();
  const [diagnosticSession, setDiagnosticSession] = useState<DiagnosticSession | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      window.location.href = "/";
    }
  }, [isAuthenticated]);

  // Simulate diagnostic scan
  const startDiagnostic = async () => {
    if (!selectedVehicleId) {
      alert("Bitte wählen Sie ein Fahrzeug aus");
      return;
    }

    setIsScanning(true);
    setScanProgress(0);

    // Simulate scanning progress
    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 30;
      });
    }, 500);

    // Simulate diagnostic data
    setTimeout(() => {
      setDiagnosticSession({
        id: 1,
        vehicleId: selectedVehicleId,
        status: "completed",
        errorCount: 1,
        warningCount: 2,
        engineTemperature: "92°C",
        rpm: "1250 rpm",
        speed: "45 km/h",
        fuelPressure: "55 psi",
        oxygenSensor: "0.45 V",
        parameters: [
          {
            id: 1,
            parameterId: "010C",
            parameterName: "Engine RPM",
            value: "1250",
            unit: "rpm",
            minValue: "0",
            maxValue: "8000",
            isNormal: true,
          },
          {
            id: 2,
            parameterId: "010D",
            parameterName: "Vehicle Speed",
            value: "45",
            unit: "km/h",
            minValue: "0",
            maxValue: "300",
            isNormal: true,
          },
          {
            id: 3,
            parameterId: "0105",
            parameterName: "Engine Coolant Temperature",
            value: "92",
            unit: "°C",
            minValue: "-40",
            maxValue: "215",
            isNormal: true,
          },
          {
            id: 4,
            parameterId: "010A",
            parameterName: "Fuel Pressure",
            value: "55",
            unit: "psi",
            minValue: "30",
            maxValue: "70",
            isNormal: true,
          },
          {
            id: 5,
            parameterId: "0114",
            parameterName: "O2 Sensor (Bank 1, Sensor 1)",
            value: "0.45",
            unit: "V",
            minValue: "0",
            maxValue: "1",
            isNormal: true,
          },
        ],
        errorCodes: [
          {
            id: 1,
            code: "P0101",
            description: "Mass or Volume Air Flow Circuit Range/Performance",
            severity: "warning",
            system: "Engine",
          },
          {
            id: 2,
            code: "P0300",
            description: "Random/Multiple Cylinder Misfire Detected",
            severity: "error",
            system: "Engine",
          },
          {
            id: 3,
            code: "P0171",
            description: "System Too Lean (Bank 1)",
            severity: "warning",
            system: "Fuel System",
          },
        ],
      });

      setIsScanning(false);
      clearInterval(interval);
    }, 5000);
  };

  const stopDiagnostic = () => {
    setIsScanning(false);
    setScanProgress(0);
  };

  const resetDiagnostic = () => {
    setDiagnosticSession(null);
    setScanProgress(0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-blue-900/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={APP_LOGO} alt="AutoKI Logo" className="h-10 w-10" />
            <span className="text-xl font-bold text-white">OBD Diagnose</span>
          </div>
          <Button
            variant="ghost"
            className="text-blue-300 hover:text-blue-100"
            onClick={() => (window.location.href = "/dashboard")}
          >
            ← Zurück zum Dashboard
          </Button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">OBD-II Diagnose Interface</h1>
          <p className="text-blue-200">
            Verbinden Sie Ihr OBD-Kabel und führen Sie eine vollständige Fahrzeugdiagnose durch
          </p>
        </div>

        {/* Control Panel */}
        <Card className="bg-slate-800/50 border-blue-500/20 mb-8">
          <CardHeader>
            <CardTitle className="text-white">Diagnose-Steuerung</CardTitle>
            <CardDescription className="text-blue-300">
              Starten Sie eine Diagnose-Sitzung mit Ihrem OBD-Gerät
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Vehicle Selection */}
            <div>
              <label className="block text-sm font-medium text-blue-200 mb-2">
                Fahrzeug auswählen
              </label>
              <select
                value={selectedVehicleId || ""}
                onChange={(e) => setSelectedVehicleId(Number(e.target.value))}
                className="w-full px-4 py-2 bg-slate-700 border border-blue-500/30 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">-- Fahrzeug wählen --</option>
                <option value="1">BMW 320i (2022)</option>
                <option value="2">Mercedes C-Klasse (2021)</option>
                <option value="3">Audi A4 (2023)</option>
              </select>
            </div>

            {/* OBD Device Connection */}
            <div className="p-4 bg-slate-700/50 rounded-lg border border-blue-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-200">OBD-Gerät Status</span>
                <Badge className="bg-green-600/20 text-green-300">
                  <Activity className="h-3 w-3 mr-1" />
                  Verbunden
                </Badge>
              </div>
              <p className="text-xs text-blue-300">ELM327 Bluetooth Adapter (COM3)</p>
            </div>

            {/* Control Buttons */}
            <div className="flex gap-4">
              <Button
                onClick={startDiagnostic}
                disabled={isScanning || !selectedVehicleId}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                <Play className="h-4 w-4 mr-2" />
                Diagnose starten
              </Button>
              <Button
                onClick={stopDiagnostic}
                disabled={!isScanning}
                variant="outline"
                className="flex-1 border-red-500/30 text-red-300 hover:bg-red-950"
              >
                <StopCircle className="h-4 w-4 mr-2" />
                Stoppen
              </Button>
              <Button
                onClick={resetDiagnostic}
                variant="outline"
                className="flex-1 border-blue-500/30 text-blue-300 hover:bg-blue-950"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Zurücksetzen
              </Button>
            </div>

            {/* Progress Bar */}
            {isScanning && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-blue-200">Scan läuft...</span>
                  <span className="text-sm font-semibold text-blue-300">{Math.round(scanProgress)}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full transition-all duration-300"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {diagnosticSession && (
          <div className="space-y-8">
            {/* Summary */}
            <div className="grid md:grid-cols-4 gap-6">
              <Card className="bg-slate-800/50 border-blue-500/20">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-400 mb-1">
                      {diagnosticSession.status === "completed" ? "✓" : "●"}
                    </div>
                    <p className="text-blue-200 text-sm">Status</p>
                    <p className="text-white font-semibold capitalize">
                      {diagnosticSession.status === "completed" ? "Abgeschlossen" : "Läuft"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-red-500/20">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-1" />
                    <p className="text-blue-200 text-sm">Fehler</p>
                    <p className="text-white font-semibold">{diagnosticSession.errorCount}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-yellow-500/20">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <AlertTriangle className="h-8 w-8 text-yellow-400 mx-auto mb-1" />
                    <p className="text-blue-200 text-sm">Warnungen</p>
                    <p className="text-white font-semibold">{diagnosticSession.warningCount}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-blue-500/20">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <Zap className="h-8 w-8 text-blue-400 mx-auto mb-1" />
                    <p className="text-blue-200 text-sm">Parameter</p>
                    <p className="text-white font-semibold">{diagnosticSession.parameters.length}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Results */}
            <Tabs defaultValue="parameters" className="space-y-6">
              <TabsList className="bg-slate-800/50 border border-blue-500/20">
                <TabsTrigger value="parameters" className="text-blue-200">
                  OBD-Parameter
                </TabsTrigger>
                <TabsTrigger value="errors" className="text-blue-200">
                  Fehlercodes ({diagnosticSession.errorCodes.length})
                </TabsTrigger>
                <TabsTrigger value="summary" className="text-blue-200">
                  Zusammenfassung
                </TabsTrigger>
              </TabsList>

              {/* Parameters Tab */}
              <TabsContent value="parameters" className="space-y-4">
                <div className="grid md:grid-cols-2 gap-6">
                  {diagnosticSession.parameters.map((param) => (
                    <Card
                      key={param.id}
                      className={`bg-slate-800/50 border-2 ${
                        param.isNormal ? "border-green-500/30" : "border-red-500/30"
                      }`}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-white text-lg">
                              {param.parameterName}
                            </CardTitle>
                            <CardDescription className="text-blue-300">
                              {param.parameterId}
                            </CardDescription>
                          </div>
                          <Badge
                            className={
                              param.isNormal
                                ? "bg-green-600/20 text-green-300"
                                : "bg-red-600/20 text-red-300"
                            }
                          >
                            {param.isNormal ? "OK" : "FEHLER"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-blue-300">Aktueller Wert:</span>
                            <span className="text-2xl font-bold text-white">
                              {param.value} {param.unit}
                            </span>
                          </div>
                          {param.minValue && param.maxValue && (
                            <div className="text-sm text-blue-300">
                              Bereich: {param.minValue} - {param.maxValue} {param.unit}
                            </div>
                          )}
                          <div className="w-full bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full"
                              style={{
                                width: `${
                                  ((parseFloat(param.value) - parseFloat(param.minValue || "0")) /
                                    (parseFloat(param.maxValue || "100") -
                                      parseFloat(param.minValue || "0"))) *
                                  100
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* Error Codes Tab */}
              <TabsContent value="errors" className="space-y-4">
                {diagnosticSession.errorCodes.length > 0 ? (
                  diagnosticSession.errorCodes.map((error) => (
                    <Card
                      key={error.id}
                      className={`bg-slate-800/50 border-l-4 ${
                        error.severity === "critical"
                          ? "border-l-red-600"
                          : error.severity === "error"
                            ? "border-l-red-500"
                            : "border-l-yellow-500"
                      }`}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <code className="text-lg font-bold text-blue-300">{error.code}</code>
                              <Badge
                                className={
                                  error.severity === "critical"
                                    ? "bg-red-600/20 text-red-300"
                                    : error.severity === "error"
                                      ? "bg-red-600/20 text-red-300"
                                      : "bg-yellow-600/20 text-yellow-300"
                                }
                              >
                                {error.severity.toUpperCase()}
                              </Badge>
                              <Badge className="bg-blue-600/20 text-blue-300">{error.system}</Badge>
                            </div>
                            <p className="text-white">{error.description}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card className="bg-slate-800/50 border-green-500/20">
                    <CardContent className="pt-6 text-center">
                      <p className="text-green-300">✓ Keine Fehlercodes gefunden</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Summary Tab */}
              <TabsContent value="summary" className="space-y-4">
                <Card className="bg-slate-800/50 border-blue-500/20">
                  <CardHeader>
                    <CardTitle className="text-white">Diagnose-Zusammenfassung</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-700/50 rounded-lg">
                        <p className="text-blue-300 text-sm mb-1">Motortemperatur</p>
                        <p className="text-2xl font-bold text-white flex items-center gap-2">
                          <Thermometer className="h-5 w-5 text-red-400" />
                          {diagnosticSession.engineTemperature}
                        </p>
                      </div>
                      <div className="p-4 bg-slate-700/50 rounded-lg">
                        <p className="text-blue-300 text-sm mb-1">Drehzahl</p>
                        <p className="text-2xl font-bold text-white flex items-center gap-2">
                          <Gauge className="h-5 w-5 text-blue-400" />
                          {diagnosticSession.rpm}
                        </p>
                      </div>
                      <div className="p-4 bg-slate-700/50 rounded-lg">
                        <p className="text-blue-300 text-sm mb-1">Geschwindigkeit</p>
                        <p className="text-2xl font-bold text-white">{diagnosticSession.speed}</p>
                      </div>
                      <div className="p-4 bg-slate-700/50 rounded-lg">
                        <p className="text-blue-300 text-sm mb-1">Kraftstoffdruck</p>
                        <p className="text-2xl font-bold text-white">
                          {diagnosticSession.fuelPressure}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 p-4 bg-blue-600/10 border border-blue-500/30 rounded-lg">
                      <p className="text-blue-200 text-sm mb-2">Empfehlungen:</p>
                      <ul className="text-blue-300 text-sm space-y-1">
                        <li>• Überprüfen Sie die Luftmassenmesser-Sensoren</li>
                        <li>• Zündkerzen und Zündspulen inspizieren</li>
                        <li>• Kraftstoffdruck und Einspritzer überprüfen</li>
                        <li>• Katalysator auf Verschleiß prüfen</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-4">
                  <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                    <Download className="h-4 w-4 mr-2" />
                    Bericht herunterladen
                  </Button>
                  <Button variant="outline" className="flex-1 border-blue-500/30 text-blue-300">
                    Bericht per E-Mail
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* No Session */}
        {!diagnosticSession && !isScanning && (
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
