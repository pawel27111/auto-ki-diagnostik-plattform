import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

/**
 * Dialog for registering a vehicle.
 *
 * The VIN rule mirrors the server's schema (17 characters, no I/O/Q) so the
 * user gets the error before a round trip; the server still validates, this is
 * convenience only.
 */
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VehicleFormDialog({ open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const [vin, setVin] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [licensePlate, setLicensePlate] = useState("");
  const [mileage, setMileage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const createVehicle = trpc.obd.vehicles.create.useMutation({
    onSuccess: async () => {
      toast.success("Fahrzeug hinzugefügt");
      await utils.obd.vehicles.list.invalidate();
      reset();
      onOpenChange(false);
    },
    onError: error => setFormError(error.message),
  });

  function reset() {
    setVin("");
    setMake("");
    setModel("");
    setYear(String(new Date().getFullYear()));
    setLicensePlate("");
    setMileage("");
    setFormError(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const normalizedVin = vin.trim().toUpperCase();
    if (!VIN_PATTERN.test(normalizedVin)) {
      setFormError("Die VIN muss aus genau 17 Zeichen bestehen (ohne I, O und Q).");
      return;
    }

    const parsedYear = Number.parseInt(year, 10);
    if (!Number.isFinite(parsedYear) || parsedYear < 1900) {
      setFormError("Bitte ein gültiges Baujahr angeben.");
      return;
    }

    const parsedMileage = mileage.trim() === "" ? undefined : Number.parseInt(mileage, 10);
    if (parsedMileage !== undefined && (!Number.isFinite(parsedMileage) || parsedMileage < 0)) {
      setFormError("Bitte einen gültigen Kilometerstand angeben.");
      return;
    }

    createVehicle.mutate({
      vin: normalizedVin,
      make: make.trim(),
      model: model.trim(),
      year: parsedYear,
      licensePlate: licensePlate.trim() || undefined,
      mileage: parsedMileage,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fahrzeug hinzufügen</DialogTitle>
          <DialogDescription>
            Die Fahrgestellnummer finden Sie im Fahrzeugschein unter Punkt E.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vehicle-vin">Fahrgestellnummer (VIN)</Label>
            <Input
              id="vehicle-vin"
              value={vin}
              onChange={event => setVin(event.target.value)}
              placeholder="WBA12345678901234"
              maxLength={17}
              autoComplete="off"
              className="font-mono uppercase"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vehicle-make">Marke</Label>
              <Input
                id="vehicle-make"
                value={make}
                onChange={event => setMake(event.target.value)}
                placeholder="BMW"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-model">Modell</Label>
              <Input
                id="vehicle-model"
                value={model}
                onChange={event => setModel(event.target.value)}
                placeholder="320i"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vehicle-year">Baujahr</Label>
              <Input
                id="vehicle-year"
                type="number"
                value={year}
                onChange={event => setYear(event.target.value)}
                min={1900}
                max={new Date().getFullYear() + 2}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-plate">Kennzeichen</Label>
              <Input
                id="vehicle-plate"
                value={licensePlate}
                onChange={event => setLicensePlate(event.target.value)}
                placeholder="M-AB 1234"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-mileage">km-Stand</Label>
              <Input
                id="vehicle-mileage"
                type="number"
                value={mileage}
                onChange={event => setMileage(event.target.value)}
                min={0}
                placeholder="85000"
              />
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-sm text-red-400">
              {formError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={createVehicle.isPending}>
              {createVehicle.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Hinzufügen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
