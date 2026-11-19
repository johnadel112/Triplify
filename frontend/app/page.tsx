import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="home-page">
      <section className="hero container">
        <div className="hero-copy">
          <span className="eyebrow"><i /> One journey. Every detail.</span>
          <h1>Go farther.<br /><em>Plan lighter.</em></h1>
          <p>Bring flights, stays and the moments between them into one calm, considered travel workspace.</p>
          <div className="hero-actions"><Link className="button" href="/register">Start your journey <span>→</span></Link><Link className="text-link" href="/login">I already have an account</Link></div>
          <div className="trust-row"><span>Secure account access</span><span>One connected itinerary</span><span>Built for every traveler</span></div>
        </div>
        <div className="hero-art" aria-label="Abstract route from Cairo to a new destination">
          <span className="sun" /><span className="route-line" /><span className="route-dot dot-one" /><span className="route-dot dot-two" />
          <div className="trip-card"><small>NEXT CHAPTER</small><strong>Cairo <span>→</span> Anywhere</strong><p>Your plans, ready when you are.</p></div>
          <div className="coordinate">30.0444° N<br />31.2357° E</div>
        </div>
      </section>
      <section className="feature-band"><div className="container feature-grid"><article><span>01</span><h2>Search with clarity</h2><p>Compare the details that matter without losing the bigger picture.</p></article><article><span>02</span><h2>Book with confidence</h2><p>Verified pricing and policies stay attached to every booking.</p></article><article><span>03</span><h2>Keep it together</h2><p>Your account becomes the quiet home for each upcoming journey.</p></article></div></section>
    </div>
  );
}
