import AppNav from "@/components/AppNav";
import VehicleFormDialog from "@/components/VehicleFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DIAGNOSTIC_STATUS_LABELS,
  DIAGNOSTIC_TYPE_LABELS,
  formatDateTime,
  formatNumber,
  formatRelative,
  VEHICLE_STATUS_LABELS,
} from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Car, CheckCircle, Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";

export default function Dashboard() {
  const [isAddOpen, setAddOpen] = useState(false);

  const vehiclesQuery = trpc.obd.vehicles.list.useQuery();
  const diagnosticsQuery = trpc.obd.diagnostics.listRecent.useQuery({
    limit: 20,
  });

  // Memoised so the identity is stable: a fresh `?? []` each render would
  // invalidate every useMemo below on every render.
  const vehicles = useMemo(
    () => vehiclesQuery.data ?? [],
    [vehiclesQuery.data]
  );
  const diagnostics = useMemo(
    () => diagnosticsQuery.data ?? [],
    [diagnosticsQuery.data]
  );

  const vehiclesById = useMemo(
    () => new Map(vehicles.map(vehicle => [vehicle.id, vehicle])),
    [vehicles]
  );

  // Derived from the loaded records rather than hard-coded: the previous
  // dashboard showed fixed numbers that never matched the account.
  const stats = useMemo(() => {
    const openWarnings = diagnostics.reduce(
      (sum, diagnostic) => sum + (diagnostic.warningCount ?? 0),
      0
    );
    const openErrors = diagnostics.reduce(
      (sum, diagnostic) => sum + (diagnostic.errorCount ?? 0),
      0
    );
    const latest = diagnostics[0]?.startedAt ?? null;

    return [
      { label: "Fahrzeuge", value: formatNumber(vehicles.length), icon: "🚗" },
      {
        label: "Diagnosen",
        value: formatNumber(diagnostics.length),
        icon: "🔍",
      },
      {
        label: "Fehler / Warnungen",
        value: `${openErrors} / ${openWarnings}`,
        icon: "⚠️",
      },
      { label: "Zuletzt", value: formatRelative(latest), icon: "📅" },
    ];
  }, [vehicles, diagnostics]);

  const isLoading = vehiclesQuery.isLoading || diagnosticsQuery.isLoading;
  const loadError = vehiclesQuery.error ?? diagnosticsQuery.error;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      <AppNav title="AutoKI Assistent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-blue-200">
            Verwalten Sie Ihre Fahrzeuge und Diagnosen
          </p>
        </div>

        {loadError && (
          <Card className="bg-red-950/40 border-red-500/30 mb-8">
            <CardContent className="pt-6">
              <p className="text-red-300">
                Daten konnten nicht geladen werden: {loadError.message}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          {stats.map(stat => (
            <Card
              key={stat.label}
              className="bg-slate-800/50 border-blue-500/20"
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-blue-200 text-sm">{stat.label}</p>
                    <p className="text-2xl font-bold text-white mt-1 truncate">
                      {isLoading ? "…" : stat.value}
                    </p>
                  </div>
                  <div className="text-3xl shrink-0" aria-hidden="true">
                    {stat.icon}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="vehicles" className="space-y-6">
          <TabsList className="bg-slate-800/50 border border-blue-500/20">
            <TabsTrigger value="vehicles" className="text-blue-200">
              Fahrzeuge
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="text-blue-200">
              Diagnosen
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vehicles" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Meine Fahrzeuge</h2>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Fahrzeug hinzufügen
              </Button>
            </div>

            {vehiclesQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
              </div>
            ) : vehicles.length === 0 ? (
              <Card className="bg-slate-800/50 border-blue-500/20">
                <CardContent className="pt-12 pb-12 text-center">
                  <Car className="h-16 w-16 text-blue-400 mx-auto mb-4 opacity-50" />
                  <p className="text-blue-200 text-lg mb-4">
                    Noch kein Fahrzeug registriert
                  </p>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => setAddOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Erstes Fahrzeug hinzufügen
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {vehicles.map(vehicle => {
                  const isHealthy = vehicle.status === "active";
                  return (
                    <Card
                      key={vehicle.id}
                      className="bg-slate-800/50 border-blue-500/20 hover:border-blue-500/50 transition-all"
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <CardTitle className="text-white truncate">
                              {vehicle.make} {vehicle.model}
                            </CardTitle>
                            <CardDescription className="text-blue-300">
                              {vehicle.year}
                            </CardDescription>
                          </div>
                          <Badge
                            className={
                              isHealthy
                                ? "bg-green-600/20 text-green-300 shrink-0"
                                : "bg-yellow-600/20 text-yellow-300 shrink-0"
                            }
                          >
                            {isHealthy ? (
                              <CheckCircle className="h-3 w-3 mr-1" />
                            ) : (
                              <AlertTriangle className="h-3 w-3 mr-1" />
                            )}
                            {VEHICLE_STATUS_LABELS[vehicle.status] ??
                              vehicle.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div>
                          <p className="text-xs text-blue-300">VIN</p>
                          <p className="text-sm text-white font-mono break-all">
                            {vehicle.vin}
                          </p>
                        </div>
                        {vehicle.licensePlate && (
                          <div>
                            <p className="text-xs text-blue-300">Kennzeichen</p>
                            <p className="text-sm text-white">
                              {vehicle.licensePlate}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-blue-300">
                            Letzte Diagnose
                          </p>
                          <p className="text-sm text-white">
                            {formatRelative(vehicle.lastDiagnosisAt)}
                          </p>
                        </div>
                        <Link href={`/diagnostic?vehicleId=${vehicle.id}`}>
                          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                            Diagnose starten
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="diagnostics" className="space-y-6">
            <h2 className="text-2xl font-bold text-white">Letzte Diagnosen</h2>

            {diagnosticsQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 text-blue-400 animate-spin" />
              </div>
            ) : diagnostics.length === 0 ? (
              <Card className="bg-slate-800/50 border-blue-500/20">
                <CardContent className="pt-12 pb-12 text-center">
                  <p className="text-blue-200">
                    Noch keine Diagnose durchgeführt
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {diagnostics.map(diagnostic => {
                  const vehicle = vehiclesById.get(diagnostic.vehicleId);
                  return (
                    <Card
                      key={diagnostic.id}
                      className="bg-slate-800/50 border-blue-500/20"
                    >
                      <CardContent className="pt-6">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex-1 min-w-[12rem]">
                            <h3 className="text-white font-semibold">
                              {vehicle
                                ? `${vehicle.make} ${vehicle.model}`
                                : `Fahrzeug #${diagnostic.vehicleId}`}
                            </h3>
                            <p className="text-blue-300 text-sm">
                              {formatDateTime(diagnostic.startedAt)} ·{" "}
                              {DIAGNOSTIC_TYPE_LABELS[
                                diagnostic.diagnosticType
                              ] ?? diagnostic.diagnosticType}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <Badge
                              className={
                                diagnostic.status === "completed"
                                  ? "bg-green-600/20 text-green-300"
                                  : diagnostic.status === "running"
                                    ? "bg-blue-600/20 text-blue-300"
                                    : "bg-slate-600/30 text-slate-300"
                              }
                            >
                              {DIAGNOSTIC_STATUS_LABELS[diagnostic.status] ??
                                diagnostic.status}
                            </Badge>
                            {diagnostic.errorCount > 0 && (
                              <Badge className="bg-red-600/20 text-red-300">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {diagnostic.errorCount} Fehler
                              </Badge>
                            )}
                            {diagnostic.warningCount > 0 && (
                              <Badge className="bg-yellow-600/20 text-yellow-300">
                                {diagnostic.warningCount} Warnungen
                              </Badge>
                            )}
                            <Link
                              href={`/diagnostic?diagnosticId=${diagnostic.id}`}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-blue-400"
                              >
                                Details
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <VehicleFormDialog open={isAddOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
