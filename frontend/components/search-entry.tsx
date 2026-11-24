"use client";
import { useState } from "react";
import Link from "next/link";
export function SearchEntry({
  flightHref,
  hotelHref,
}: {
  flightHref?: string;
  hotelHref?: string;
}) {
  const [mode, setMode] = useState<"flights" | "hotels">("flights");
  const href = mode === "flights" ? flightHref : hotelHref;
  return (
    <section className="search-entry" aria-label="Plan your journey">
      <div className="search-tabs" role="group" aria-label="Travel type">
        <button
          aria-pressed={mode === "flights"}
          onClick={() => setMode("flights")}
        >
          Flights
        </button>
        <button
          aria-pressed={mode === "hotels"}
          onClick={() => setMode("hotels")}
        >
          Hotels
        </button>
      </div>
      <div className="search-body">
        <div>
          <h2>
            {mode === "flights"
              ? "Where will you go next?"
              : "Find your place in the world."}
          </h2>
          <p>
            {href
              ? "Choose your destination and travel dates in search."
              : `${mode === "flights" ? "Flight" : "Hotel"} search is not available yet. Create an account to prepare your traveler details.`}
          </p>
        </div>
        {href ? (
          <Link href={href} className="button">
            Search {mode}
          </Link>
        ) : (
          <Link href="/register" className="button">
            Get ready to travel
          </Link>
        )}
      </div>
    </section>
  );
}
