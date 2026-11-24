import Link from "next/link";
import { StatusPanel } from "@/components/status-panel";
export default function NotFound() {
  return (
    <div className="container page-space">
      <StatusPanel
        title="That route is off the map"
        message="The page may have moved or is not part of this journey yet."
        action={
          <Link className="button button-small" href="/">
            Return home
          </Link>
        }
      />
    </div>
  );
}
