import Image from "next/image";
import Link from "next/link";
import { SearchEntry } from "@/components/search-entry";
export default function HomePage() {
  return (
    <div className="home-page">
      <section className="travel-hero">
        <Image
          src="/images/journey.jpg"
          alt="Mountain peaks rising above a tranquil alpine landscape"
          fill
          priority
          sizes="100vw"
          className="hero-photo"
        />
        <div className="hero-shade" />
        <div className="container hero-copy">
          <span className="eyebrow">THE ART OF GOING FURTHER</span>
          <h1>
            Explore the world.
            <br />
            <em>Exceptionally.</em>
          </h1>
          <p>
            Flights, stays and the moments in between.
            <br />
            Make room for your next journey.
          </p>
          <Link className="button button-light" href="/register">
            Create your account
          </Link>
        </div>
        <span className="photo-caption">
          A change of scenery. A different perspective.
        </span>
      </section>
      <div className="container search-container">
        <SearchEntry />
      </div>
      <section className="container editorial-section">
        <div>
          <span className="section-kicker">TRAVEL, CONSIDERED</span>
          <h2>
            Every journey begins
            <br />
            with a little possibility.
          </h2>
        </div>
        <div>
          <p>
            Somewhere unfamiliar. A familiar place, seen differently. Bring your
            travel plans together with an account that keeps your details close.
          </p>
          <Link className="text-link" href="/account">
            Your personal travel space
          </Link>
        </div>
      </section>
    </div>
  );
}
