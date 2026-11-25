"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { airlineApi, Flight } from "@/lib/moderators";
import { ApiError } from "@/lib/api";
import { Badge, EmptyState, Notice, Pagination, Skeleton, Table } from "@/components/ui";

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

export default function AirlineFlightsPage() {
  const [page, setPage] = useState(1);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    airlineApi
      .listFlights(page)
      .then((res) => {
        if (!active) return;
        setFlights(res.items || []);
        setTotal(res.total || 0);
        setPageCount(res.pageCount || 1);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load flights.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page]);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <span className="section-kicker">FLIGHT OPERATIONS</span>
          <h1>Flight Schedules</h1>
          <p className="lede">
            View, schedule and manage flights operated by your airline.
          </p>
        </div>
        <div>
          <Link className="button" href="/dashboard/airline/flights/create">
            Schedule new flight
          </Link>
        </div>
      </div>

      <Notice error>{error}</Notice>

      {loading ? (
        <Skeleton />
      ) : flights.length === 0 ? (
        <EmptyState>No flights scheduled yet. Create your first flight route above.</EmptyState>
      ) : (
        <>
          <Table caption={`Scheduled flights (${total} total)`}>
            <thead>
              <tr>
                <th scope="col">Flight #</th>
                <th scope="col">Route</th>
                <th scope="col">Departure</th>
                <th scope="col">Arrival</th>
                <th scope="col">Cabins & Seats</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {flights.map((flight) => {
                const cabinsSummary = Object.entries(flight.cabins || {})
                  .map(([name, data]) => `${name} (${data?.seatCount ?? 0})`)
                  .join(", ");

                return (
                  <tr key={flight._id || flight.id}>
                    <td>
                      <strong>{flight.flightNumber}</strong>
                    </td>
                    <td>
                      <code>{flight.departureAirport}</code> &rarr;{" "}
                      <code>{flight.arrivalAirport}</code>
                    </td>
                    <td>{formatDateTime(flight.departureTimeUtc)}</td>
                    <td>{formatDateTime(flight.arrivalTimeUtc)}</td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {cabinsSummary || "None"}
                    </td>
                    <td>
                      <Badge>
                        {flight.status === "SCHEDULED" ? (
                          <span style={{ color: "green" }}>SCHEDULED</span>
                        ) : (
                          <span style={{ color: "#c00" }}>CANCELLED</span>
                        )}
                      </Badge>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <Link
                          className="button button-small"
                          href={`/dashboard/airline/flights/${flight._id || flight.id}`}
                        >
                          Manage
                        </Link>
                      </div>
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
    </>
  );
}
