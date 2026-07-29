import { FlaskConical } from "lucide-react";
import { APP_RELEASE } from "@/src/lib/app-release";
import { BRAND } from "@/src/lib/brand";

export function AppReleaseCard() {
  return (
    <section
      aria-labelledby="app-release-title"
      className="card settings-section app-release-card"
      id="about"
    >
      <div className="card-title">
        <div>
          <h2 id="app-release-title">About {BRAND.name}</h2>
          <p>The exact application build you are currently testing.</p>
        </div>
        <FlaskConical aria-hidden="true" size={20} />
      </div>

      <div className="release-overview">
        <span className="release-channel">{APP_RELEASE.channelLabel}</span>
        <div>
          <strong>{APP_RELEASE.displayVersion}</strong>
          <p>
            This is a testing release. Features and stored-data formats may
            change before the stable release.
          </p>
        </div>
      </div>
    </section>
  );
}
