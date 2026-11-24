import Link from "next/link";
export default function AdminPage() {
  return (
    <>
      <span className="section-kicker">ADMINISTRATION</span>
      <h1>Operations overview</h1>
      <p className="lede">
        A clear view of the accounts, partners and content behind every journey.
      </p>
      <div className="operations-list">
        {[
          [
            "accounts",
            "Accounts & access",
            "Review travelers and moderators. Manage account status and password resets.",
          ],
          [
            "providers",
            "Provider availability",
            "Manage hotel and airline availability using a verified provider identifier.",
          ],
          [
            "bookings",
            "Booking inspection",
            "Inspect booking references, customers, travel dates and amounts.",
          ],
          [
            "reports",
            "Content review",
            "Review reports and resolve inappropriate content.",
          ],
          [
            "audit-logs",
            "Accountability",
            "Read the record of administrative actions.",
          ],
        ].map(([route, title, description]) => (
          <Link href={`/admin/${route}`} key={route}>
            <h2>{title}</h2>
            <p>{description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
