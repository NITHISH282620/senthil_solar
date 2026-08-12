"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            Sentil Solar Ops is temporarily unavailable
          </h1>
          <p style={{ color: "#666", marginTop: "0.5rem" }}>
            A critical error occurred. Please try again.
          </p>
          {error.digest && (
            <p
              style={{
                color: "#999",
                marginTop: "0.5rem",
                fontFamily: "monospace",
                fontSize: "0.75rem",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #ddd",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
