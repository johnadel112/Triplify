"use client";
import Link from "next/link";
import { ProtectedRoute } from "@/components/protected-route";
import { useAuth } from "@/components/auth-provider";

function Workspace() {
  const { user } = useAuth();
  if (!user) return null;

  if (user.role === "ADMIN") {
    return (
      <div className="container page-space">
        <h1>Welcome, {user.name}</h1>
        <p>Administration operations and platform management.</p>
        <Link className="button" href="/admin">
          Open administration
        </Link>
      </div>
    );
  }

  if (user.role === "AIRLINE_MODERATOR") {
    return (
      <div className="container page-space">
        <span className="section-kicker">AIRLINE OPERATIONS</span>
        <h1>Welcome, {user.name}</h1>
        <p>Manage your airline profile, flight schedules, cabin pricing, and guest bookings.</p>
        {!user.providerId && (
          <p className="form-notice error-notice">
            Your moderator account is not currently assigned to an airline provider ID. Please contact an administrator.
          </p>
        )}
        <div className="operations-list">
          <Link href="/dashboard/airline">
            <div>
              <h2>Airline profile</h2>
              <p>Update airline name, 2-character IATA code, contact email and brand logo.</p>
            </div>
            <span className="badge">Profile & Logo</span>
          </Link>
          <Link href="/dashboard/airline/flights">
            <div>
              <h2>Flight schedules</h2>
              <p>View active and upcoming flights, update schedules, and cancel flights.</p>
            </div>
            <span className="badge">Flights</span>
          </Link>
          <Link href="/dashboard/airline/flights/create">
            <div>
              <h2>Schedule new flight</h2>
              <p>Add a new flight route with local times, cabin classes, seats and baggage allowances.</p>
            </div>
            <span className="badge">Create flight</span>
          </Link>
          <Link href="/dashboard/airline/policies">
            <div>
              <h2>Baggage & cancellation policies</h2>
              <p>Configure baggage piece pricing, maximum extra bags, and cancellation refund tiers.</p>
            </div>
            <span className="badge">Policies</span>
          </Link>
        </div>
      </div>
    );
  }

  if (user.role === "HOTEL_MODERATOR") {
    return (
      <div className="container page-space">
        <span className="section-kicker">HOTEL OPERATIONS</span>
        <h1>Welcome, {user.name}</h1>
        <p>Manage your hotel profile, photos, bookable rooms, availability dates, and reservations.</p>
        {!user.providerId && (
          <p className="form-notice error-notice">
            Your moderator account is not currently assigned to a hotel provider ID. Please contact an administrator.
          </p>
        )}
        <div className="operations-list">
          <Link href="/dashboard/hotel">
            <div>
              <h2>Hotel profile & photos</h2>
              <p>Update property details, address, star classification, amenities, and gallery photos.</p>
            </div>
            <span className="badge">Profile & Photos</span>
          </Link>
          <Link href="/dashboard/hotel/rooms">
            <div>
              <h2>Rooms & availability</h2>
              <p>Manage inventory, room rates, occupancy, status, and bookable/blocked date ranges.</p>
            </div>
            <span className="badge">Rooms</span>
          </Link>
          <Link href="/dashboard/hotel/policies">
            <div>
              <h2>Check-in & cancellation policies</h2>
              <p>Set 24-hour local check-in/out times and tiered refund policies.</p>
            </div>
            <span className="badge">Policies</span>
          </Link>
          <Link href="/dashboard/hotel/reservations">
            <div>
              <h2>Guest reservations</h2>
              <p>Track guest bookings, lifecycle statuses, and reservation details.</p>
            </div>
            <span className="badge">Reservations</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container page-space">
      <h1>Welcome, {user.name}</h1>
      <p>Manage your details, trips, itineraries and account security.</p>
      <Link className="button" href="/account">
        Open account
      </Link>
    </div>
  );
}

export default function Page() {
  return (
    <ProtectedRoute>
      <Workspace />
    </ProtectedRoute>
  );
}
