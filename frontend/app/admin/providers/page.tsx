"use client";
import { useState } from "react";
import { adminApi } from "@/lib/admin";
import { ApiError } from "@/lib/api";
import { FormField } from "@/components/form-field";
import { ConfirmDialog, Notice, Select } from "@/components/ui";
export default function ProvidersPage() {
  const [pending, setPending] = useState<{
    type: "hotels" | "airlines";
    id: string;
    active: boolean;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      await adminApi.provider(pending.type, pending.id, pending.active);
      setNotice(
        `Provider ${pending.id} is now ${pending.active ? "active" : "inactive"}.`,
      );
      setPending(undefined);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Unable to update provider.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span className="section-kicker">PARTNER AVAILABILITY</span>
      <h1>Provider controls</h1>
      <p>
        Provider deactivation is separate from moderator suspension. It does not
        cancel existing confirmed bookings.
      </p>
      <p className="form-notice warning-notice">
        Provider inventory and current status are not available in this console
        yet. Use a verified provider ID from your provider records.
      </p>
      <form
        className="settings-form narrow"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setError("");
          setNotice("");
          setPending({
            type: data.get("type") as "hotels" | "airlines",
            id: String(data.get("id")),
            active: data.get("action") === "reactivate",
          });
        }}
      >
        <Notice>{notice}</Notice>
        <Select label="Provider type" name="type">
          <option value="airlines">Airline</option>
          <option value="hotels">Hotel</option>
        </Select>
        <FormField
          label="Provider ID"
          name="id"
          required
          pattern="[a-fA-F0-9]{24}"
          hint="24-character provider identifier"
        />
        <Select label="Action" name="action">
          <option value="deactivate">Deactivate</option>
          <option value="reactivate">Reactivate</option>
        </Select>
        <button className="button">Review action</button>
      </form>
      {pending && (
        <ConfirmDialog
          title={`${pending.active ? "Reactivate" : "Deactivate"} provider?`}
          busy={busy}
          error={error}
          onCancel={() => setPending(undefined)}
          onConfirm={confirm}
        >
          <p>
            {pending.type}: <code>{pending.id}</code>
          </p>
          <p>
            Confirm that this is the intended provider. Existing confirmed
            bookings remain in place.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
