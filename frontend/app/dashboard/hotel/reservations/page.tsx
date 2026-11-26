"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { hotelApi, HotelReservation } from "@/lib/moderators";
import { ApiError } from "@/lib/api";
import {
  Badge,
  Dialog,
  EmptyState,
  Notice,
  Pagination,
  Select,
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

function getStatusBadge(status: HotelReservation["status"]) {
  switch (status) {
    case "CONFIRMED":
      return <span style={{ color: "green", fontWeight: 600 }}>CONFIRMED</span>;
    case "COMPLETED":
      return <span style={{ color: "#2563eb", fontWeight: 600 }}>COMPLETED</span>;
    case "CANCELLED":
      return <span style={{ color: "#dc2626", fontWeight: 600 }}>CANCELLED</span>;
    case "PENDING_PAYMENT":
      return <span style={{ color: "#d97706", fontWeight: 600 }}>PENDING PAYMENT</span>;
    case "EXPIRED":
      return <span style={{ color: "#6b7280", fontWeight: 600 }}>EXPIRED</span>;
    default:
      return <span>{status}</span>;
  }
}

export default function HotelReservationsPage() {
  const { user } = useAuth();
  const providerId = user?.providerId;

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [reservations, setReservations] = useState<HotelReservation[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Details modal
  const [selectedBooking, setSelectedBooking] = useState<HotelReservation | null>(null);

  useEffect(() => {
    if (!providerId) return;
    let active = true;

    hotelApi
      .listReservations(providerId, page, statusFilter || undefined)
      .then((res) => {
        if (!active) return;
        setReservations(res.items || []);
        setTotal(res.total || 0);
        setPageCount(res.pageCount || 1);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load hotel reservations.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [providerId, page, statusFilter]);

  function handleFilterChange(newStatus: string) {
    setLoading(true);
    setStatusFilter(newStatus);
    setPage(1);
  }

  return (
    <>
      <span className="section-kicker">GUEST BOOKINGS</span>
      <h1>Hotel Reservations</h1>
      <p className="lede">
        Monitor guest stays, check-in schedules, room assignments, and reservation statuses.
      </p>

      {/* Status Filter */}
      <div className="filters">
        <Select
          label="Filter by Status"
          name="status"
          value={statusFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="PENDING_PAYMENT">Pending Payment</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="EXPIRED">Expired</option>
        </Select>
      </div>

      <Notice error>{error}</Notice>

      {loading ? (
        <Skeleton />
      ) : reservations.length === 0 ? (
        <EmptyState>No reservations found matching the selected filter.</EmptyState>
      ) : (
        <>
          <Table caption={`Hotel reservations (${total} total)`}>
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Guest</th>
                <th scope="col">Stay Dates</th>
                <th scope="col">Rooms</th>
                <th scope="col">Total</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((res) => {
                const roomsSummary = res.rooms
                  .map((r) => `${r.name} (${r.type})`)
                  .join(", ");

                return (
                  <tr key={res.id}>
                    <td>
                      <code>{res.reference || "Hold in progress"}</code>
                    </td>
                    <td>
                      <strong>{res.guest.name}</strong>
                    </td>
                    <td>
                      {res.checkInDate} &rarr; {res.checkOutDate}
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                        {res.nights} night{res.nights === 1 ? "" : "s"}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.85rem", maxWidth: "220px" }}>
                      {roomsSummary}
                    </td>
                    <td>
                      <strong>
                        ${res.total.toFixed(2)} {res.currency}
                      </strong>
                    </td>
                    <td>
                      <Badge>{getStatusBadge(res.status)}</Badge>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button-small"
                        onClick={() => setSelectedBooking(res)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          {pageCount > 1 && (
            <Pagination
              page={page}
              pageCount={pageCount}
              onChange={(nextPage) => {
                setLoading(true);
                setPage(nextPage);
              }}
              disabled={loading}
            />
          )}
        </>
      )}

      {/* Reservation Details Modal */}
      {selectedBooking && (
        <Dialog
          title={`Reservation Details: ${selectedBooking.reference || selectedBooking.id}`}
          onClose={() => setSelectedBooking(null)}
        >
          <div style={{ display: "grid", gap: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", background: "var(--bg-subtle)", padding: "16px", borderRadius: "8px" }}>
              <div>
                <span className="section-kicker">GUEST INFORMATION</span>
                <p style={{ margin: "4px 0", fontSize: "1.1rem", fontWeight: "bold" }}>
                  {selectedBooking.guest.name}
                </p>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
                  User ID: <code>{selectedBooking.guest.id}</code>
                </p>
              </div>

              <div>
                <span className="section-kicker">BOOKING STATUS</span>
                <p style={{ margin: "4px 0" }}>
                  <Badge>{getStatusBadge(selectedBooking.status)}</Badge>
                </p>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
                  Created: {formatDateTime(selectedBooking.createdAt)}
                </p>
              </div>
            </div>

            <div>
              <span className="section-kicker">STAY SCHEDULE</span>
              <p style={{ margin: "4px 0", fontSize: "1rem" }}>
                Check-in: <strong>{selectedBooking.checkInDate}</strong> &bull; Check-out: <strong>{selectedBooking.checkOutDate}</strong> ({selectedBooking.nights} night{selectedBooking.nights === 1 ? "" : "s"})
              </p>
            </div>

            <div>
              <span className="section-kicker">RESERVED ROOMS</span>
              <div style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
                {selectedBooking.rooms.map((room, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: "1px solid var(--line)",
                      padding: "12px",
                      borderRadius: "6px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <strong>{room.name}</strong> (<code>{room.type}</code>)
                      <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                        {room.adults} adult(s), {room.childrenCount} child(ren) &bull; ${room.pricePerNight.toFixed(2)} / night
                      </div>
                    </div>
                    <div>
                      <strong>${room.subtotal.toFixed(2)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "2px solid var(--line)",
                paddingTop: "16px",
                marginTop: "8px",
              }}
            >
              <span style={{ fontSize: "1.1rem", fontWeight: "bold" }}>Total Amount:</span>
              <span style={{ fontSize: "1.3rem", fontWeight: "bold", color: "var(--navy)" }}>
                ${selectedBooking.total.toFixed(2)} {selectedBooking.currency}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
              <button type="button" onClick={() => setSelectedBooking(null)}>
                Close
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
