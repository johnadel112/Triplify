"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { airlineApi, referenceApi, AirportItem, CabinClass } from "@/lib/moderators";
import { ApiError } from "@/lib/api";
import { FormField } from "@/components/form-field";
import { Checkbox, Notice } from "@/components/ui";

interface CabinInput {
  enabled: boolean;
  seatCount: number;
  price: number;
  freeBags: number;
  maxBagWeightKg: number;
}

const DEFAULT_CABINS: Record<CabinClass, CabinInput> = {
  economy: { enabled: true, seatCount: 150, price: 350, freeBags: 1, maxBagWeightKg: 23 },
  premiumEconomy: { enabled: false, seatCount: 30, price: 650, freeBags: 2, maxBagWeightKg: 23 },
  business: { enabled: false, seatCount: 20, price: 1200, freeBags: 2, maxBagWeightKg: 32 },
  first: { enabled: false, seatCount: 8, price: 2500, freeBags: 3, maxBagWeightKg: 32 },
};

export default function CreateFlightPage() {
  const router = useRouter();

  const [flightNumber, setFlightNumber] = useState("");
  const [departureAirportCode, setDepartureAirportCode] = useState("");
  const [arrivalAirportCode, setArrivalAirportCode] = useState("");
  const [departureTimeLocal, setDepartureTimeLocal] = useState("");
  const [arrivalTimeLocal, setArrivalTimeLocal] = useState("");
  const [extraBaggagePricePerKg, setExtraBaggagePricePerKg] = useState<number | "">("");

  const [cabins, setCabins] = useState<Record<CabinClass, CabinInput>>(DEFAULT_CABINS);
  const [airports, setAirports] = useState<AirportItem[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    referenceApi.listAirports("", 1).then((res) => {
      if (res.items) setAirports(res.items);
    }).catch(() => {});
  }, []);

  function handleCabinChange(name: CabinClass, field: keyof CabinInput, value: unknown) {
    setCabins((prev) => ({
      ...prev,
      [name]: {
        ...prev[name],
        [field]: value,
      },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    // Validate active cabins
    const activeCabinEntries = (Object.entries(cabins) as [CabinClass, CabinInput][]).filter(
      ([, val]) => val.enabled,
    );

    if (activeCabinEntries.length === 0) {
      setError("At least one cabin class must be enabled for the flight.");
      setBusy(false);
      return;
    }

    const cabinsPayload: Record<string, { seatCount: number; price: number; freeBags: number; maxBagWeightKg: number }> = {};
    for (const [cabinName, val] of activeCabinEntries) {
      if (val.seatCount <= 0) {
        setError(`${cabinName} seat count must be greater than zero.`);
        setBusy(false);
        return;
      }
      if (val.price <= 0) {
        setError(`${cabinName} price must be greater than zero.`);
        setBusy(false);
        return;
      }
      cabinsPayload[cabinName] = {
        seatCount: Number(val.seatCount),
        price: Number(val.price),
        freeBags: Number(val.freeBags),
        maxBagWeightKg: Number(val.maxBagWeightKg),
      };
    }

    if (departureAirportCode === arrivalAirportCode) {
      setError("Departure and arrival airports cannot be identical.");
      setBusy(false);
      return;
    }

    try {
      const created = await airlineApi.createFlight({
        flightNumber: flightNumber.trim().toUpperCase(),
        departureAirportCode: departureAirportCode.trim().toUpperCase(),
        arrivalAirportCode: arrivalAirportCode.trim().toUpperCase(),
        departureTimeLocal,
        arrivalTimeLocal,
        cabins: cabinsPayload,
        extraBaggagePricePerKg: extraBaggagePricePerKg === "" ? undefined : Number(extraBaggagePricePerKg),
      });

      setSuccess(`Flight ${created.flightNumber} scheduled successfully!`);
      setTimeout(() => {
        router.push(`/dashboard/airline/flights/${created._id || created.id}`);
      }, 1500);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create flight schedule.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span className="section-kicker">NEW SCHEDULE</span>
      <h1>Schedule New Flight</h1>
      <p className="lede">
        Define flight route, local departure/arrival schedules, cabin inventory, and baggage rules.
      </p>

      <form className="settings-form" onSubmit={handleSubmit} style={{ maxWidth: "800px", marginTop: "24px" }}>
        <Notice>{success}</Notice>
        <Notice error>{error}</Notice>

        <h2>Flight Route & Identification</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          <FormField
            label="Flight Number"
            name="flightNumber"
            value={flightNumber}
            onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
            required
            pattern="[A-Za-z0-9]{2,8}"
            hint="2-8 alphanumeric characters (e.g. MS777, BA102)"
          />

          <div className="field">
            <label htmlFor="depAirport">Departure Airport (IATA)</label>
            <input
              id="depAirport"
              name="depAirport"
              value={departureAirportCode}
              onChange={(e) => setDepartureAirportCode(e.target.value.toUpperCase())}
              required
              maxLength={3}
              pattern="[A-Za-z]{3}"
              placeholder="e.g. CAI"
              list="airports-list"
            />
          </div>

          <div className="field">
            <label htmlFor="arrAirport">Arrival Airport (IATA)</label>
            <input
              id="arrAirport"
              name="arrAirport"
              value={arrivalAirportCode}
              onChange={(e) => setArrivalAirportCode(e.target.value.toUpperCase())}
              required
              maxLength={3}
              pattern="[A-Za-z]{3}"
              placeholder="e.g. JFK"
              list="airports-list"
            />
          </div>

          <datalist id="airports-list">
            {airports.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} - {a.name} ({a.city}, {a.country})
              </option>
            ))}
          </datalist>
        </div>

        <h2>Schedule (Airport Local Times)</h2>
        <p style={{ margin: "0 0 16px", fontSize: "0.85rem", color: "var(--muted)" }}>
          Times must be specified in the local time of each respective airport (format: YYYY-MM-DDTHH:mm).
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px" }}>
          <FormField
            label="Departure Time (Local)"
            name="departureTimeLocal"
            type="datetime-local"
            value={departureTimeLocal}
            onChange={(e) => setDepartureTimeLocal(e.target.value)}
            required
          />

          <FormField
            label="Arrival Time (Local)"
            name="arrivalTimeLocal"
            type="datetime-local"
            value={arrivalTimeLocal}
            onChange={(e) => setArrivalTimeLocal(e.target.value)}
            required
          />
        </div>

        <h2>Cabin Classes & Seat Capacity</h2>
        <p style={{ margin: "0 0 16px", fontSize: "0.85rem", color: "var(--muted)" }}>
          Enable at least one cabin class and configure seat inventory, base fare, and included baggage allowances.
        </p>

        {(["economy", "premiumEconomy", "business", "first"] as CabinClass[]).map((cName) => {
          const cData = cabins[cName];
          const displayName = cName === "premiumEconomy" ? "Premium Economy" : cName.charAt(0).toUpperCase() + cName.slice(1);

          return (
            <div
              key={cName}
              style={{
                border: "1px solid var(--line)",
                borderRadius: "8px",
                padding: "16px",
                background: cData.enabled ? "white" : "var(--bg-subtle)",
                marginBottom: "16px",
              }}
            >
              <Checkbox
                label={`Enable ${displayName}`}
                checked={cData.enabled}
                onChange={(e) => handleCabinChange(cName, "enabled", e.target.checked)}
              />

              {cData.enabled && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginTop: "12px" }}>
                  <FormField
                    label="Seat Count"
                    name={`${cName}-seats`}
                    type="number"
                    min="1"
                    value={String(cData.seatCount)}
                    onChange={(e) => handleCabinChange(cName, "seatCount", Number(e.target.value))}
                    required
                  />

                  <FormField
                    label="Fare Price"
                    name={`${cName}-price`}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={String(cData.price)}
                    onChange={(e) => handleCabinChange(cName, "price", Number(e.target.value))}
                    required
                  />

                  <FormField
                    label="Free Bags"
                    name={`${cName}-bags`}
                    type="number"
                    min="0"
                    max="10"
                    value={String(cData.freeBags)}
                    onChange={(e) => handleCabinChange(cName, "freeBags", Number(e.target.value))}
                  />

                  <FormField
                    label="Max Bag Wt (kg)"
                    name={`${cName}-weight`}
                    type="number"
                    min="1"
                    max="50"
                    value={String(cData.maxBagWeightKg)}
                    onChange={(e) => handleCabinChange(cName, "maxBagWeightKg", Number(e.target.value))}
                  />
                </div>
              )}
            </div>
          );
        })}

        <h2>Additional Baggage</h2>
        <FormField
          label="Extra Baggage Rate per Kg (Optional)"
          name="extraBaggagePricePerKg"
          type="number"
          step="0.01"
          min="0"
          value={String(extraBaggagePricePerKg)}
          onChange={(e) => setExtraBaggagePricePerKg(e.target.value === "" ? "" : Number(e.target.value))}
          hint="Price charged per kilogram exceeding allowance"
        />

        <div style={{ display: "flex", gap: "16px", marginTop: "24px" }}>
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Scheduling flight…" : "Create & Schedule Flight"}
          </button>
          <Link className="button" href="/dashboard/airline/flights" style={{ background: "transparent", color: "inherit", border: "1px solid var(--line)" }}>
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
