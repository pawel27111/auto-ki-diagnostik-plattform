import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  Plus,
  Settings,
  LogOut,
  Zap,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
} from "lucide-react";
import { APP_LOGO } from "@/const";
import { useEffect } from "react";

export default function Dashboard() {
  const { user, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      window.location.href = "/";
    }
  }, [isAuthenticated]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 to-blue-950">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <Zap className="h-12 w-12 text-blue-400 mx-auto" />
          </div>
          <p className="text-white">Lädt...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-blue-900/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={APP_LOGO} alt="AutoKI Logo" className="h-10 w-10" />
            <span className="text-xl font-bold text-white">AutoKI Assistent</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-blue-200">Willkommen</p>
              <p className="font-semibold text-white">{user.name || user.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-blue-300 hover:text-blue-100"
              onClick={() => (window.location.href = "/settings")}
            >
              <Settings className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-red-400 hover:text-red-300"
              onClick={logout}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-blue-200">Verwalten Sie Ihre Fahrzeuge und Diagnosen</p>
        </div>

        {/* Quick Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-12">
          {[
            { label: "Fahrzeuge", value: "3", icon: "🚗" },
            { label: "Diagnosen", value: "24", icon: "🔍" },
            { label: "Warnungen", value: "2", icon: "⚠️" },
            { label: "Zuletzt aktualisiert", value: "Heute", icon: "📅" },
          ].map((stat, idx) => (
            <Card key={idx} className="bg-slate-800/50 border-blue-500/20">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-200 text-sm">{stat.label}</p>
                    <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                  </div>
                  <div className="text-3xl">{stat.icon}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content */}
        <Tabs defaultValue="vehicles" className="space-y-6">
          <TabsList className="bg-slate-800/50 border border-blue-500/20">
            <TabsTrigger value="vehicles" className="text-blue-200">
              Fahrzeuge
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="text-blue-200">
              Diagnosen
            </TabsTrigger>
            <TabsTrigger value="reports" className="text-blue-200">
              Berichte
            </TabsTrigger>
          </TabsList>

          {/* Vehicles Tab */}
          <TabsContent value="vehicles" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Meine Fahrzeuge</h2>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-2" />
                Fahrzeug hinzufügen
              </Button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  name: "BMW 320i",
                  year: 2022,
                  vin: "WBA123456789",
                  status: "Gut",
                  lastDiag: "Vor 2 Tagen",
                },
                {
                  name: "Mercedes C-Klasse",
                  year: 2021,
                  vin: "WDB456789123",
                  status: "Warnung",
                  lastDiag: "Vor 1 Woche",
                },
                {
                  name: "Audi A4",
                  year: 2023,
                  vin: "WAUZZZ1234567",
                  status: "Gut",
                  lastDiag: "Heute",
                },
              ].map((vehicle, idx) => (
                <Card
                  key={idx}
                  className="bg-slate-800/50 border-blue-500/20 hover:border-blue-500/50 transition-all cursor-pointer"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-white">{vehicle.name}</CardTitle>
                        <CardDescription className="text-blue-300">
                          {vehicle.year}
                        </CardDescription>
                      </div>
                      <Badge
                        className={
                          vehicle.status === "Gut"
                            ? "bg-green-600/20 text-green-300"
                            : "bg-yellow-600/20 text-yellow-300"
                        }
                      >
                        {vehicle.status === "Gut" ? (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 mr-1" />
                        )}
                        {vehicle.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs text-blue-300">VIN</p>
                      <p className="text-sm text-white font-mono">{vehicle.vin}</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-300">Letzte Diagnose</p>
                      <p className="text-sm text-white">{vehicle.lastDiag}</p>
                    </div>
                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => (window.location.href = "/diagnostic")}
                    >
                      Diagnose starten
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Diagnostics Tab */}
          <TabsContent value="diagnostics" className="space-y-6">
            <h2 className="text-2xl font-bold text-white">Letzte Diagnosen</h2>

            <div className="space-y-4">
              {[
                {
                  vehicle: "BMW 320i",
                  date: "25.11.2025",
                  status: "Abgeschlossen",
                  issues: 0,
                },
                {
                  vehicle: "Mercedes C-Klasse",
                  date: "18.11.2025",
                  status: "Abgeschlossen",
                  issues: 2,
                },
                {
                  vehicle: "Audi A4",
                  date: "25.11.2025",
                  status: "Abgeschlossen",
                  issues: 0,
                },
              ].map((diag, idx) => (
                <Card
                  key={idx}
                  className="bg-slate-800/50 border-blue-500/20 hover:border-blue-500/50 transition-all cursor-pointer"
                >
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-white font-semibold">{diag.vehicle}</h3>
                        <p className="text-blue-300 text-sm">{diag.date}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge className="bg-green-600/20 text-green-300">
                          {diag.status}
                        </Badge>
                        {diag.issues > 0 && (
                          <Badge className="bg-red-600/20 text-red-300">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {diag.issues} Problem{diag.issues !== 1 ? "e" : ""}
                          </Badge>
                        )}
                        <Button variant="ghost" size="sm" className="text-blue-400">
                          Details
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-6">
            <h2 className="text-2xl font-bold text-white">Diagnoseberichte</h2>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  title: "Motorleistung",
                  description: "Analyse der Motorleistung über die letzten 30 Tage",
                  icon: TrendingUp,
                },
                {
                  title: "Emissionen",
                  description: "Überwachung der Emissionswerte",
                  icon: BarChart3,
                },
              ].map((report, idx) => {
                const Icon = report.icon;
                return (
                  <Card
                    key={idx}
                    className="bg-slate-800/50 border-blue-500/20 hover:border-blue-500/50 transition-all cursor-pointer"
                  >
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600/20 rounded-lg">
                          <Icon className="h-6 w-6 text-blue-400" />
                        </div>
                        <div>
                          <CardTitle className="text-white">{report.title}</CardTitle>
                          <CardDescription className="text-blue-300">
                            {report.description}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                        Bericht anzeigen
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
