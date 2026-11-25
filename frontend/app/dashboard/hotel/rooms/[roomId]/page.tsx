"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { hotelApi, HotelRoom, DateRange } from "@/lib/moderators";
import { ApiError } from "@/lib/api";
import { FormField } from "@/components/form-field";
import { Notice, Skeleton } from "@/components/ui";

export default function RoomCalendarPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  const { user } = useAuth();
  const providerId = user?.providerId;

  const [room, setRoom] = useState<HotelRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);

  // Available ranges
  const [availRanges, setAvailRanges] = useState<DateRange[]>([]);
  const [savingAvail, setSavingAvail] = useState(false);
  const [availNotice, setAvailNotice] = useState("");
  const [availError, setAvailError] = useState("");

  // Blocked ranges
  const [blockedRanges, setBlockedRanges] = useState<DateRange[]>([]);
  const [savingBlocked, setSavingBlocked] = useState(false);
  const [blockedNotice, setBlockedNotice] = useState("");
  const [blockedError, setBlockedError] = useState("");

  useEffect(() => {
    if (!providerId) return;
    let active = true;

    hotelApi
      .listRooms(providerId, 1)
      .then((res) => {
        if (!active) return;
        const found = res.items.find((r) => r._id === roomId);
        if (found) {
          setRoom(found);
          setAvailRanges(found.availableRanges || []);
          setBlockedRanges(found.blockedRanges || []);
        } else {
          setLoadError("Room not found in this hotel.");
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError ? err.message : "Failed to load room details.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [providerId, roomId, revision]);

  // Available ranges handlers
  function handleAddAvail() {
    setAvailRanges([...availRanges, { from: "", to: "" }]);
  }

  function handleRemoveAvail(index: number) {
    setAvailRanges(availRanges.filter((_, i) => i !== index));
  }

  function handleAvailChange(index: number, field: keyof DateRange, val: string) {
    const next = [...availRanges];
    next[index] = { ...next[index], [field]: val };
    setAvailRanges(next);
  }

  async function handleSaveAvail(e: React.FormEvent) {
    e.preventDefault();
    if (!providerId || savingAvail) return;

    for (const r of availRanges) {
      if (!r.from || !r.to || r.from >= r.to) {
        setAvailError("All available ranges must have a valid check-in date before check-out date (YYYY-MM-DD).");
        return;
      }
    }

    setSavingAvail(true);
    setAvailError("");
    setAvailNotice("");

    try {
      const res = await hotelApi.replaceAvailability(providerId, roomId, availRanges);
      setAvailRanges(res.availableRanges || availRanges);
      setAvailNotice("Room available date ranges updated successfully.");
      setRevision((r) => r + 1);
    } catch (err) {
      setAvailError(
        err instanceof ApiError ? err.message : "Failed to update available date ranges.",
      );
    } finally {
      setSavingAvail(false);
    }
  }

  // Blocked ranges handlers
  function handleAddBlocked() {
    setBlockedRanges([...blockedRanges, { from: "", to: "" }]);
  }

  function handleRemoveBlocked(index: number) {
    setBlockedRanges(blockedRanges.filter((_, i) => i !== index));
  }

  function handleBlockedChange(index: number, field: keyof DateRange, val: string) {
    const next = [...blockedRanges];
    next[index] = { ...next[index], [field]: val };
    setBlockedRanges(next);
  }

  async function handleSaveBlocked(e: React.FormEvent) {
    e.preventDefault();
    if (!providerId || savingBlocked) return;

    for (const r of blockedRanges) {
      if (!r.from || !r.to || r.from >= r.to) {
        setBlockedError("All blocked ranges must have a valid from date before to date (YYYY-MM-DD).");
        return;
      }
    }

    setSavingBlocked(true);
    setBlockedError("");
    setBlockedNotice("");

    try {
      const res = await hotelApi.replaceBlocked(providerId, roomId, blockedRanges);
      setBlockedRanges(res.blockedRanges || blockedRanges);
      setBlockedNotice("Room blocked date ranges updated successfully.");
      setRevision((r) => r + 1);
    } catch (err) {
      setBlockedError(
        err instanceof ApiError ? err.message : "Failed to update blocked date ranges.",
      );
    } finally {
      setSavingBlocked(false);
    }
  }

  if (loading) return <Skeleton />;
  if (loadError) return <Notice error>{loadError}</Notice>;
  if (!room) return <Notice error>Room not found.</Notice>;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <span className="section-kicker">ROOM CALENDAR</span>
          <h1>Room {room.number} Availability</h1>
          <p className="lede">
            <strong>{room.name}</strong> &bull; {room.type} &bull; ${room.pricePerNight.toFixed(2)} / night
          </p>
        </div>
        <div>
          <Link className="button" href="/dashboard/hotel/rooms" style={{ background: "transparent", color: "inherit", border: "1px solid var(--line)" }}>
            &larr; Back to rooms
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gap: "32px", maxWidth: "800px", marginTop: "24px" }}>
        {/* Bookable Availability Ranges */}
        <form className="settings-form" onSubmit={handleSaveAvail}>
          <h2>Bookable Date Ranges</h2>
          <p style={{ margin: "0 0 16px", fontSize: "0.9rem", color: "var(--muted)" }}>
            Dates within these ranges are open for guest bookings. Check-in date is inclusive; check-out date is exclusive.
          </p>
          <Notice>{availNotice}</Notice>
          <Notice error>{availError}</Notice>

          {availRanges.length === 0 ? (
            <p style={{ fontStyle: "italic", color: "var(--muted)", margin: "0 0 16px" }}>
              No custom availability ranges defined (room availability defaults to always bookable unless blocked).
            </p>
          ) : (
            <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
              {availRanges.map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr auto",
                    gap: "12px",
                    alignItems: "end",
                    border: "1px solid var(--line)",
                    padding: "12px",
                    borderRadius: "6px",
                  }}
                >
                  <FormField
                    label="From Date (Check-in)"
                    name={`avail-from-${idx}`}
                    type="date"
                    value={r.from}
                    onChange={(e) => handleAvailChange(idx, "from", e.target.value)}
                    required
                  />
                  <FormField
                    label="To Date (Check-out)"
                    name={`avail-to-${idx}`}
                    type="date"
                    value={r.to}
                    onChange={(e) => handleAvailChange(idx, "to", e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="button button-danger button-small"
                    onClick={() => handleRemoveAvail(idx)}
                    style={{ height: "42px", marginBottom: "16px" }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <button
              type="button"
              className="button button-small"
              onClick={handleAddAvail}
              style={{ background: "transparent", color: "inherit", border: "1px solid var(--line)" }}
            >
              + Add Available Range
            </button>
            <button className="button" type="submit" disabled={savingAvail}>
              {savingAvail ? "Saving dates…" : "Save Bookable Dates"}
            </button>
          </div>
        </form>

        {/* Blocked Date Ranges */}
        <form className="settings-form" onSubmit={handleSaveBlocked}>
          <h2>Blocked Dates (Maintenance / Closures)</h2>
          <p style={{ margin: "0 0 16px", fontSize: "0.9rem", color: "var(--muted)" }}>
            Blocked date ranges prevent guest bookings during renovations, private events, or seasonal closures. Cannot overlap existing confirmed guest bookings.
          </p>
          <Notice>{blockedNotice}</Notice>
          <Notice error>{blockedError}</Notice>

          {blockedRanges.length === 0 ? (
            <p style={{ fontStyle: "italic", color: "var(--muted)", margin: "0 0 16px" }}>
              No blocked date ranges currently set.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
              {blockedRanges.map((r, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr auto",
                    gap: "12px",
                    alignItems: "end",
                    border: "1px solid var(--line)",
                    padding: "12px",
                    borderRadius: "6px",
                  }}
                >
                  <FormField
                    label="Block From Date"
                    name={`blocked-from-${idx}`}
                    type="date"
                    value={r.from}
                    onChange={(e) => handleBlockedChange(idx, "from", e.target.value)}
                    required
                  />
                  <FormField
                    label="Block To Date"
                    name={`blocked-to-${idx}`}
                    type="date"
                    value={r.to}
                    onChange={(e) => handleBlockedChange(idx, "to", e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="button button-danger button-small"
                    onClick={() => handleRemoveBlocked(idx)}
                    style={{ height: "42px", marginBottom: "16px" }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <button
              type="button"
              className="button button-small"
              onClick={handleAddBlocked}
              style={{ background: "transparent", color: "inherit", border: "1px solid var(--line)" }}
            >
              + Add Blocked Range
            </button>
            <button className="button" type="submit" disabled={savingBlocked}>
              {savingBlocked ? "Saving dates…" : "Save Blocked Dates"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
