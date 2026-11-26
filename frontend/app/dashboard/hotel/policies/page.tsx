"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { hotelApi, HotelCancellationTier } from "@/lib/moderators";
import { ApiError } from "@/lib/api";
import { FormField } from "@/components/form-field";
import { Notice, Skeleton } from "@/components/ui";

export default function HotelPoliciesPage() {
  const { user } = useAuth();
  const providerId = user?.providerId;

  const [loading, setLoading] = useState(Boolean(providerId));
  const [loadError, setLoadError] = useState("");

  const [checkInTime, setCheckInTime] = useState("14:00");
  const [checkOutTime, setCheckOutTime] = useState("11:00");
  const [tiers, setTiers] = useState<HotelCancellationTier[]>([
    { daysBefore: 7, refundPercentage: 100 },
    { daysBefore: 2, refundPercentage: 50 },
    { daysBefore: 0, refundPercentage: 0 },
  ]);

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!providerId) return;
    let active = true;

    hotelApi
      .getHotel(providerId)
      .then((data) => {
        if (!active) return;
        if (data.checkInTime) setCheckInTime(data.checkInTime);
        if (data.checkOutTime) setCheckOutTime(data.checkOutTime);
        if (data.cancellationTiers && data.cancellationTiers.length > 0) {
          setTiers(data.cancellationTiers);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError ? err.message : "Failed to load hotel policies.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [providerId]);

  function handleAddTier() {
    setTiers([...tiers, { daysBefore: 1, refundPercentage: 25 }]);
  }

  function handleRemoveTier(index: number) {
    setTiers(tiers.filter((_, i) => i !== index));
  }

  function handleTierChange(index: number, field: keyof HotelCancellationTier, val: number) {
    const next = [...tiers];
    next[index] = { ...next[index], [field]: val };
    setTiers(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!providerId || saving) return;
    setSaving(true);
    setError("");
    setNotice("");

    // Validate 24h format HH:mm
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!timeRegex.test(checkInTime)) {
      setError("Check-in time must be in 24-hour format HH:mm (e.g. 14:00).");
      setSaving(false);
      return;
    }
    if (!timeRegex.test(checkOutTime)) {
      setError("Check-out time must be in 24-hour format HH:mm (e.g. 11:00).");
      setSaving(false);
      return;
    }

    try {
      await hotelApi.updatePolicies(providerId, {
        checkInTime,
        checkOutTime,
        cancellationTiers: tiers,
      });
      setNotice("Hotel check-in/out times and cancellation policy updated successfully.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to update hotel policies.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton />;

  return (
    <>
      <span className="section-kicker">POLICY MANAGEMENT</span>
      <h1>Hotel Policies</h1>
      <p className="lede">
        Configure standard 24-hour local check-in and check-out times, and tiered cancellation refund rules.
      </p>

      <Notice error>{loadError}</Notice>

      <form className="settings-form" onSubmit={handleSubmit} style={{ maxWidth: "800px", marginTop: "24px" }}>
        <Notice>{notice}</Notice>
        <Notice error>{error}</Notice>

        <h2>Check-in & Check-out Schedule</h2>
        <p style={{ margin: "0 0 16px", fontSize: "0.9rem", color: "var(--muted)" }}>
          Times are expressed in the property&apos;s local timezone (24-hour format HH:mm).
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <FormField
            label="Daily Check-in Time"
            name="checkInTime"
            type="text"
            pattern="^([01]\d|2[0-3]):[0-5]\d$"
            value={checkInTime}
            onChange={(e) => setCheckInTime(e.target.value)}
            required
            hint="e.g. 14:00 or 15:00"
          />

          <FormField
            label="Daily Check-out Time"
            name="checkOutTime"
            type="text"
            pattern="^([01]\d|2[0-3]):[0-5]\d$"
            value={checkOutTime}
            onChange={(e) => setCheckOutTime(e.target.value)}
            required
            hint="e.g. 11:00 or 12:00"
          />
        </div>

        <h2>Cancellation & Refund Tiers</h2>
        <p style={{ margin: "0 0 16px", fontSize: "0.9rem", color: "var(--muted)" }}>
          Specify what percentage of the booking amount is refunded according to how many days before arrival the guest cancels.
        </p>

        <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
          {tiers.map((tier, idx) => (
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
                label="Days Before Check-in"
                name={`tier-days-${idx}`}
                type="number"
                min="0"
                max="365"
                value={String(tier.daysBefore)}
                onChange={(e) => handleTierChange(idx, "daysBefore", Number(e.target.value))}
                required
              />
              <FormField
                label="Refund Percentage (%)"
                name={`tier-refund-${idx}`}
                type="number"
                min="0"
                max="100"
                value={String(tier.refundPercentage)}
                onChange={(e) => handleTierChange(idx, "refundPercentage", Number(e.target.value))}
                required
              />
              <button
                type="button"
                className="button button-danger button-small"
                onClick={() => handleRemoveTier(idx)}
                disabled={tiers.length <= 1}
                style={{ height: "42px", marginBottom: "16px" }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <button
            type="button"
            className="button button-small"
            onClick={handleAddTier}
            style={{ background: "transparent", color: "inherit", border: "1px solid var(--line)" }}
          >
            + Add Refund Tier
          </button>
          <button className="button" type="submit" disabled={saving || !providerId}>
            {saving ? "Saving policies…" : "Save Hotel Policies"}
          </button>
        </div>
      </form>
    </>
  );
}
