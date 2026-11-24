"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui";
export default function SettingsPage() {
  const { user, deactivate } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await deactivate();
      router.replace("/login?deactivated=1");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Unable to deactivate your account.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="content-heading">
        <span className="section-kicker">ACCOUNT CONTROLS</span>
        <h2>Manage your account</h2>
        <p>Choose how you use Triplify.</p>
      </div>
      {user.role === "USER" ? (
        <section className="danger-zone">
          <h3>Deactivate account</h3>
          <p>
            Deactivation prevents sign-in and ends all active sessions. Upcoming
            confirmed bookings must be resolved first. This does not delete your
            booking history.
          </p>
          <button
            className="danger-button"
            onClick={() => {
              setError("");
              setOpen(true);
            }}
          >
            Deactivate my account
          </button>
        </section>
      ) : (
        <p>
          Administrator and moderator account status is managed through
          administration.
        </p>
      )}
      {open && (
        <ConfirmDialog
          title="Deactivate your account?"
          busy={busy}
          error={error}
          onCancel={() => setOpen(false)}
          onConfirm={confirm}
        >
          <p>
            You will lose sign-in access to this account. This action cannot be
            reversed from your account settings.
          </p>
          <p>
            The server will check for upcoming confirmed bookings before
            proceeding.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
