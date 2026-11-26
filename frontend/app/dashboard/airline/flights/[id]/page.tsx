"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  airlineApi,
  Flight,
  FlightBookingsResult,
  CabinClass,
  FlightCabin,
} from "@/lib/moderators";
import { ApiError } from "@/lib/api";
import { FormField } from "@/components/form-field";
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Notice,
  Pagination,
  Skeleton,
  Table,
} from "@/components/ui";

function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function FlightDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [flight, setFlight] = useState<Flight | null>(null);
  const [loadingFlight, setLoadingFlight] = useState(true);
  const [flightError, setFlightError] = useState("");
  const [revision, setRevision] = useState(0);

  // Edit schedule state
  const [departureTimeLocal, setDepartureTimeLocal] = useState("");
  const [arrivalTimeLocal, setArrivalTimeLocal] = useState("");
  const [extraBaggagePricePerKg, setExtraBaggagePricePerKg] = useState<number | "">("");
  const [cabins, setCabins] = useState<Record<string, FlightCabin>>({});
  const [updatingSchedule, setUpdatingSchedule] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState("");
  const [scheduleError, setScheduleError] = useState("");

  // Cancel dialog
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  // Bookings state
  const [bookingPage, setBookingPage] = useState(1);
  const [bookingsData, setBookingsData] = useState<FlightBookingsResult | null>(null);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [bookingsError, setBookingsError] = useState("");

  useEffect(() => {
    let active = true;

    airlineApi
      .getFlight(id)
      .then((data) => {
        if (!active) return;
        setFlight(data);
        setDepartureTimeLocal(data.departureTimeLocal || "");
        setArrivalTimeLocal(data.arrivalTimeLocal || "");
        setExtraBaggagePricePerKg(data.extraBaggagePricePerKg ?? "");
        setCabins(data.cabins || {});
        setLoadingFlight(false);
      })
      .catch((err) => {
        if (!active) return;
        setFlightError(
          err instanceof ApiError ? err.message : "Failed to load flight details.",
        );
        setLoadingFlight(false);
      });

    return () => {
      active = false;
    };
  }, [id, revision]);

  useEffect(() => {
    let active = true;

    airlineApi
      .getBookings(id, bookingPage)
      .then((res) => {
        if (!active) return;
        setBookingsData(res);
        setLoadingBookings(false);
      })
      .catch((err) => {
        if (!active) return;
        setBookingsError(
          err instanceof ApiError ? err.message : "Failed to load flight bookings.",
        );
        setLoadingBookings(false);
      });

    return () => {
      active = false;
    };
  }, [id, bookingPage, revision]);

  async function handleUpdateSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (updatingSchedule) return;
    setUpdatingSchedule(true);
    setScheduleError("");
    setScheduleNotice("");

    try {
      const updated = await airlineApi.updateFlight(id, {
        departureTimeLocal: departureTimeLocal || undefined,
        arrivalTimeLocal: arrivalTimeLocal || undefined,
        cabins,
        extraBaggagePricePerKg: extraBaggagePricePerKg === "" ? undefined : Number(extraBaggagePricePerKg),
      });
      setFlight(updated);
      setScheduleNotice("Flight schedule and cabin capacity updated successfully.");
      setRevision((r) => r + 1);
    } catch (err) {
      setScheduleError(
        err instanceof ApiError ? err.message : "Failed to update flight schedule.",
      );
    } finally {
      setUpdatingSchedule(false);
    }
  }

  async function handleConfirmCancel() {
    setCancelling(true);
    setCancelError("");
    try {
      await airlineApi.cancelFlight(id);
      setCancelOpen(false);
      setScheduleNotice("Flight has been cancelled. Confirmed bookings have been refunded.");
      setRevision((r) => r + 1);
    } catch (err) {
      setCancelError(
        err instanceof ApiError ? err.message : "Failed to cancel flight.",
      );
    } finally {
      setCancelling(false);
    }
  }

  if (loadingFlight) return <Skeleton />;
  if (flightError) return <Notice error>{flightError}</Notice>;
  if (!flight) return <Notice error>Flight not found.</Notice>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <span className="section-kicker">FLIGHT MANAGEMENT</span>
          <h1>Flight {flight.flightNumber}</h1>
          <p className="lede">
            <code>{flight.departureAirport}</code> &rarr; <code>{flight.arrivalAirport}</code> &bull; Status:{" "}
            <Badge>
              {flight.status === "SCHEDULED" ? (
                <span style={{ color: "green" }}>SCHEDULED</span>
              ) : (
                <span style={{ color: "#c00" }}>CANCELLED</span>
              )}
            </Badge>
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {flight.status === "SCHEDULED" && (
            <button
              className="button button-danger"
              type="button"
              onClick={() => setCancelOpen(true)}
            >
              Cancel flight
            </button>
          )}
          <Link
            className="button"
            href={airlineApi.getPassengerExportUrl(id)}
            download="passengers.csv"
            target="_blank"
          >
            Export Manifest (CSV)
          </Link>
        </div>
      </div>

      <Notice>{scheduleNotice}</Notice>
      <Notice error>{scheduleError}</Notice>

      <div style={{ display: "grid", gap: "32px", marginTop: "24px" }}>
        {/* Schedule & Cabin Update Section */}
        <div style={{ padding: "24px", background: "white", borderRadius: "8px", border: "1px solid var(--line)" }}>
          <h2>Update Schedule & Cabins</h2>
          <p style={{ margin: "0 0 16px", fontSize: "0.9rem", color: "var(--muted)" }}>
            Updating local times notifies all affected travelers with active bookings.
          </p>

          <form onSubmit={handleUpdateSchedule} className="settings-form" style={{ margin: 0, maxWidth: "100%" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
              <FormField
                label="Departure Time (Local YYYY-MM-DDTHH:mm)"
                name="departureTimeLocal"
                value={departureTimeLocal}
                onChange={(e) => setDepartureTimeLocal(e.target.value)}
                hint={"Current UTC: " + formatDateTime(flight.departureTimeUtc)}
              />

              <FormField
                label="Arrival Time (Local YYYY-MM-DDTHH:mm)"
                name="arrivalTimeLocal"
                value={arrivalTimeLocal}
                onChange={(e) => setArrivalTimeLocal(e.target.value)}
                hint={"Current UTC: " + formatDateTime(flight.arrivalTimeUtc)}
              />

              <FormField
                label="Extra Baggage Rate / kg"
                name="extraBaggagePricePerKg"
                type="number"
                step="0.01"
                min="0"
                value={String(extraBaggagePricePerKg)}
                onChange={(e) => setExtraBaggagePricePerKg(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>

            <h3 style={{ marginTop: "20px" }}>Cabin Inventories & Prices</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
              {(["economy", "premiumEconomy", "business", "first"] as CabinClass[]).map((cKey) => {
                const c = cabins[cKey];
                if (!c) return null;
                const label = cKey === "premiumEconomy" ? "Premium Economy" : cKey.charAt(0).toUpperCase() + cKey.slice(1);

                return (
                  <div key={cKey} style={{ border: "1px solid var(--line)", padding: "12px", borderRadius: "6px" }}>
                    <strong>{label}</strong>
                    <FormField
                      label="Available Seats"
                      name={`${cKey}-seats`}
                      type="number"
                      min="0"
                      value={String(c.seatCount)}
                      onChange={(e) =>
                        setCabins({
                          ...cabins,
                          [cKey]: { ...c, seatCount: Number(e.target.value) },
                        })
                      }
                    />
                    <FormField
                      label="Price"
                      name={`${cKey}-price`}
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={String(c.price)}
                      onChange={(e) =>
                        setCabins({
                          ...cabins,
                          [cKey]: { ...c, price: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: "20px" }}>
              <button className="button" type="submit" disabled={updatingSchedule || flight.status === "CANCELLED"}>
                {updatingSchedule ? "Saving updates…" : "Save schedule changes"}
              </button>
            </div>
          </form>
        </div>

        {/* Flight Bookings & Passenger Manifest */}
        <div>
          <h2>Passenger Bookings</h2>
          <Notice error>{bookingsError}</Notice>

          {loadingBookings ? (
            <Skeleton />
          ) : !bookingsData || bookingsData.bookings.length === 0 ? (
            <EmptyState>No bookings have been made for this flight yet.</EmptyState>
          ) : (
            <>
              <Table caption={`Confirmed and active flight bookings (${bookingsData.total} total)`}>
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Cabin</th>
                    <th scope="col">Seats</th>
                    <th scope="col">Passengers</th>
                    <th scope="col">Total</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bookingsData.bookings.map((b) => (
                    <tr key={b.id || b.reference}>
                      <td>
                        <code>{b.reference}</code>
                      </td>
                      <td>{b.cabinClass}</td>
                      <td>{b.seats}</td>
                      <td>
                        {b.passengers.map((p, idx) => (
                          <div key={idx}>
                            {p.name} ({p.type})
                          </div>
                        ))}
                      </td>
                      <td>
                        {b.total} {b.currency}
                      </td>
                      <td>
                        <Badge>
                          {b.status === "CONFIRMED" ? (
                            <span style={{ color: "green" }}>CONFIRMED</span>
                          ) : (
                            <span style={{ color: "#c00" }}>CANCELLED</span>
                          )}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              {bookingsData.pageCount > 1 && (
                <Pagination
                  page={bookingPage}
                  pageCount={bookingsData.pageCount}
                  onChange={(p) => {
                    setLoadingBookings(true);
                    setBookingPage(p);
                  }}
                  disabled={loadingBookings}
                />
              )}
            </>
          )}
        </div>
      </div>

      {cancelOpen && (
        <ConfirmDialog
          title={`Cancel flight ${flight.flightNumber}?`}
          busy={cancelling}
          error={cancelError}
          onCancel={() => setCancelOpen(false)}
          onConfirm={handleConfirmCancel}
        >
          <p>
            Are you sure you want to cancel flight <strong>{flight.flightNumber}</strong> (
            <code>{flight.departureAirport}</code> &rarr; <code>{flight.arrivalAirport}</code>)?
          </p>
          <p style={{ color: "#c00", fontWeight: "bold" }}>
            This action cannot be undone. All confirmed bookings will be cancelled immediately, travelers will be notified, and full 100% refunds will be issued.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
