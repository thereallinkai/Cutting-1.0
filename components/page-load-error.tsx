import Link from "next/link";

export function PageLoadError({
  title,
  message,
  retryHref,
  retryLabel = "Try again",
}: {
  title: string;
  message: string;
  retryHref: string;
  retryLabel?: string;
}) {
  return (
    <div className="page-frame">
      <header className="page-header">
        <div>
          <span className="date-label">Stored data unavailable</span>
          <h1>{title}</h1>
          <p>We are not showing empty values as if they were current.</p>
        </div>
      </header>
      <div className="message-box error" role="alert">
        <strong>{title}</strong>
        <span>{message}</span>
        <Link className="button button-quiet" href={retryHref}>
          {retryLabel}
        </Link>
      </div>
    </div>
  );
}
