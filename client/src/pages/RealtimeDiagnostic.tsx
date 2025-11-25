import { useState } from "react";
import { useOBDStreaming } from "@/hooks/useOBDStreaming";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Activity, Gauge, Thermometer, Zap } from "lucide-react";

export default function RealtimeDiagnostic() {
  const {
    isConnected,
    activeSession,
    parameters,
    errorCodes,
    error,
    startDiagnostic,
    stopDiagnostic,
    readErrorCodes,
    clearErrorCodes,
  } = useOBDStreaming();

  const [selectedPort, setSelectedPort] = useState("/dev/ttyUSB0");
  const [selectedVehicle, setSelectedVehicle] = useState(1);

  const getParameterIcon = (name: string) => {
    if (name.includes("RPM")) return <Gauge className="w-5 h-5" />;
    if (name.includes("Temperature")) return <Thermometer className="w-5 h-5" />;
    if (name.includes("Pressure")) return <Zap className="w-5 h-5" />;
    return <Activity className="w-5 h-5" />;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-300";
      case "error":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "warning":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      default:
        return "bg-blue-100 text-blue-800 border-blue-300";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Echtzeit-Fahrzeugdiagnose
          </h1>
          <p className="text-slate-300">
            Live OBD-Datenerfassung und intelligente Fehleranalyse
          </p>
        </div>

        {/* Connection Status */}
        <div className="mb-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    isConnected ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                Verbindungsstatus
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300">
                {isConnected
                  ? "✓ Mit Server verbunden"
                  : "✗ Verbindung unterbrochen"}
              </p>
              {error && (
                <p className="text-red-400 mt-2">Fehler: {error}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Control Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-sm">OBD-Gerät</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
              >
                <option value="/dev/ttyUSB0">ELM327 (/dev/ttyUSB0)</option>
                <option value="/dev/ttyUSB1">D-CAN (/dev/ttyUSB1)</option>
                <option value="COM3">Bluetooth (COM3)</option>
              </select>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-sm">Fahrzeug</CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded border border-slate-600"
              >
                <option value={1}>BMW 320i (2019)</option>
                <option value={2}>Mercedes C-Klasse (2020)</option>
                <option value={3}>Audi A4 (2021)</option>
              </select>
            </CardContent>
          </Card>

          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-sm">Aktionen</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2">
              {!activeSession ? (
                <Button
                  onClick={() =>
                    startDiagnostic(selectedVehicle, selectedPort)
                  }
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  Starten
                </Button>
              ) : (
                <Button
                  onClick={stopDiagnostic}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  Stoppen
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Real-time Parameters */}
        {activeSession && (
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
                  {parameters.length === 0 ? (
                    <p className="text-slate-400">Keine Daten empfangen...</p>
                  ) : (
                    parameters.slice(-10).map((param, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-700 p-3 rounded border border-slate-600"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {getParameterIcon(param.name)}
                            <span className="text-white font-medium">
                              {param.name}
                            </span>
                          </div>
                          <span className="text-green-400 font-bold">
                            {param.value} {param.unit}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          {new Date(param.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Error Codes */}
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
                    <p className="text-green-400">✓ Keine Fehler erkannt</p>
                  ) : (
                    errorCodes.map((code, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded border ${getSeverityColor(
                          code.severity
                        )}`}
                      >
                        <div className="font-bold">{code.code}</div>
                        <div className="text-sm">{code.description}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={readErrorCodes}
                    variant="outline"
                    className="flex-1"
                  >
                    Fehlercodes lesen
                  </Button>
                  <Button
                    onClick={clearErrorCodes}
                    variant="destructive"
                    className="flex-1"
                  >
                    Löschen
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Session Info */}
        {activeSession && (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white">
                Diagnose-Sitzung: {activeSession.id}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-slate-400 text-sm">Port</p>
                  <p className="text-white font-semibold">
                    {activeSession.port}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Status</p>
                  <p className="text-green-400 font-semibold">
                    {activeSession.isActive ? "Aktiv" : "Beendet"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Parameter</p>
                  <p className="text-white font-semibold">
                    {parameters.length}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Fehler</p>
                  <p className="text-white font-semibold">
                    {errorCodes.length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
