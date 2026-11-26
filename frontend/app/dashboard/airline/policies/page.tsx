"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { airlineApi, AirlineCancellationTier } from "@/lib/moderators";
import { ApiError } from "@/lib/api";
import { FormField } from "@/components/form-field";
import { Notice, Skeleton } from "@/components/ui";

export default function AirlinePoliciesPage() {
  const { user } = useAuth();
  const providerId = user?.providerId;

  const [loading, setLoading] = useState(Boolean(providerId));
  const [loadError, setLoadError] = useState("");

  // Baggage policy state
  const [extraBagPrice, setExtraBagPrice] = useState<number | "">(45);
  const [maxExtraBagsPerPassenger, setMaxExtraBagsPerPassenger] = useState<number | "">(2);
  const [savingBaggage, setSavingBaggage] = useState(false);
  const [baggageNotice, setBaggageNotice] = useState("");
  const [baggageError, setBaggageError] = useState("");

  // Cancellation policy state
  const [tiers, setTiers] = useState<AirlineCancellationTier[]>([
    { daysBefore: 7, refundPercentage: 100 },
    { daysBefore: 2, refundPercentage: 50 },
    { daysBefore: 0, refundPercentage: 0 },
  ]);
  const [savingCancel, setSavingCancel] = useState(false);
  const [cancelNotice, setCancelNotice] = useState("");
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    if (!providerId) return;
    let active = true;

    airlineApi
      .getProfile(providerId)
      .then((data) => {
        if (!active) return;
        if (data.baggagePolicy) {
          setExtraBagPrice(data.baggagePolicy.extraBagPrice ?? 45);
          setMaxExtraBagsPerPassenger(data.baggagePolicy.maxExtraBagsPerPassenger ?? 2);
        }
        if (data.cancellationPolicy?.tiers && data.cancellationPolicy.tiers.length > 0) {
          setTiers(data.cancellationPolicy.tiers);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError ? err.message : "Failed to load airline policies.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [providerId]);

  async function handleSaveBaggage(e: React.FormEvent) {
    e.preventDefault();
    if (!providerId || savingBaggage) return;
    setSavingBaggage(true);
    setBaggageError("");
    setBaggageNotice("");

    try {
      await airlineApi.updateBaggagePolicy(providerId, {
        extraBagPrice: Number(extraBagPrice),
        maxExtraBagsPerPassenger: Number(maxExtraBagsPerPassenger),
      });
      setBaggageNotice("Baggage policy updated successfully.");
    } catch (err) {
      setBaggageError(
        err instanceof ApiError ? err.message : "Failed to update baggage policy.",
      );
    } finally {
      setSavingBaggage(false);
    }
  }

  function handleAddTier() {
    setTiers([...tiers, { daysBefore: 1, refundPercentage: 25 }]);
  }

  function handleRemoveTier(index: number) {
    setTiers(tiers.filter((_, i) => i !== index));
  }

  function handleTierChange(index: number, field: keyof AirlineCancellationTier, val: number) {
    const next = [...tiers];
    next[index] = { ...next[index], [field]: val };
    setTiers(next);
  }

  async function handleSaveCancellation(e: React.FormEvent) {
    e.preventDefault();
    if (!providerId || savingCancel) return;
    setSavingCancel(true);
    setCancelError("");
    setCancelNotice("");

    try {
      await airlineApi.updateCancellationPolicy(providerId, { tiers });
      setCancelNotice("Cancellation policy tiers updated successfully.");
    } catch (err) {
      setCancelError(
        err instanceof ApiError ? err.message : "Failed to update cancellation policy.",
      );
    } finally {
      setSavingCancel(false);
    }
  }

  if (loading) return <Skeleton />;

  return (
    <>
      <span className="section-kicker">POLICY MANAGEMENT</span>
      <h1>Airline Policies</h1>
      <p className="lede">
        Configure extra baggage limits and standardized booking cancellation refund tiers for your airline.
      </p>

      <Notice error>{loadError}</Notice>

      <div style={{ display: "grid", gap: "32px", maxWidth: "800px", marginTop: "24px" }}>
        {/* Baggage Policy */}
        <form className="settings-form" onSubmit={handleSaveBaggage}>
          <h2>Extra Baggage Policy</h2>
          <p style={{ margin: "0 0 16px", fontSize: "0.9rem", color: "var(--muted)" }}>
            Define flat pricing per extra checked bag and maximum bags permitted per passenger.
          </p>
          <Notice>{baggageNotice}</Notice>
          <Notice error>{baggageError}</Notice>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <FormField
              label="Price per Extra Bag"
              name="extraBagPrice"
              type="number"
              step="0.01"
              min="0.01"
              value={String(extraBagPrice)}
              onChange={(e) => setExtraBagPrice(e.target.value === "" ? "" : Number(e.target.value))}
              required
              hint="Fee charged for each additional bag"
            />

            <FormField
              label="Max Extra Bags / Passenger"
              name="maxExtraBagsPerPassenger"
              type="number"
              min="0"
              max="10"
              value={String(maxExtraBagsPerPassenger)}
              onChange={(e) => setMaxExtraBagsPerPassenger(e.target.value === "" ? "" : Number(e.target.value))}
              required
              hint="Allowed extra bags per traveler (0-10)"
            />
          </div>

          <button className="button" type="submit" disabled={savingBaggage || !providerId}>
            {savingBaggage ? "Saving policy…" : "Save baggage policy"}
          </button>
        </form>

        {/* Cancellation Policy */}
        <form className="settings-form" onSubmit={handleSaveCancellation}>
          <h2>Cancellation Refund Policy</h2>
          <p style={{ margin: "0 0 16px", fontSize: "0.9rem", color: "var(--muted)" }}>
            Set tiered refund percentages based on how many days prior to departure a cancellation occurs.
          </p>
          <Notice>{cancelNotice}</Notice>
          <Notice error>{cancelError}</Notice>

          <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
            {tiers.map((t, idx) => (
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
                  label="Days Before Departure"
                  name={`tier-days-${idx}`}
                  type="number"
                  min="0"
                  max="365"
                  value={String(t.daysBefore)}
                  onChange={(e) => handleTierChange(idx, "daysBefore", Number(e.target.value))}
                  required
                />
                <FormField
                  label="Refund Percentage (%)"
                  name={`tier-refund-${idx}`}
                  type="number"
                  min="0"
                  max="100"
                  value={String(t.refundPercentage)}
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
            <button className="button" type="submit" disabled={savingCancel || !providerId}>
              {savingCancel ? "Saving tiers…" : "Save cancellation policy"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
