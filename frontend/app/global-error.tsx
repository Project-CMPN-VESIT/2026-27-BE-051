"use client";
import Link from "next/link";

/**
 * Root-level error boundary.
 *
 * This replaces the entire document, including <html>, so globals.css and the
 * theme tokens are not available — styles must be inline and self-contained.
 * The literal values below are the resolved light-theme "Gentle Trust" tokens,
 * so a catastrophic failure still looks like the product rather than a different
 * application: warm cream paper, warm charcoal ink, forest green action.
 */
const COLOURS = {
  paper: "#faf7f1",      // --background
  ink: "#2b2723",        // --foreground
  muted: "#6b635a",      // --muted-foreground
  card: "#fdfcf9",       // --card
  border: "#e6dfd3",     // --border
  forest: "#24513e",     // --primary
  forestHover: "#1b3f30", // --primary-hover
};

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
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          margin: 0,
          background: COLOURS.paper,
          color: COLOURS.ink,
          lineHeight: 1.65,
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 460,
              width: "100%",
              textAlign: "center",
              background: COLOURS.card,
              border: `1px solid ${COLOURS.border}`,
              borderRadius: 16,
              padding: "40px 28px",
              boxShadow: "0 14px 34px -10px rgba(60, 50, 40, 0.14)",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "#f4ede0",
                color: COLOURS.forest,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                fontSize: 22,
              }}
              aria-hidden="true"
            >
              !
            </div>

            <h1
              style={{
                fontFamily: "ui-serif, Georgia, serif",
                fontSize: 24,
                fontWeight: 600,
                margin: "0 0 10px",
                letterSpacing: "-0.012em",
              }}
            >
              Something went wrong
            </h1>
            <p style={{ fontSize: 14, color: COLOURS.muted, margin: "0 0 26px" }}>
              A critical error stopped the page from loading. Trying again will
              usually clear it.
            </p>

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => reset()}
                style={{
                  background: COLOURS.forest,
                  color: "#fbf9f4",
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = COLOURS.forestHover;
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = COLOURS.forest;
                }}
              >
                Try again
              </button>
              <Link
                href="/"
                style={{
                  background: "transparent",
                  color: COLOURS.ink,
                  border: `1px solid ${COLOURS.border}`,
                  borderRadius: 10,
                  padding: "10px 20px",
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Go home
              </Link>
            </div>

            {error.digest && (
              <p
                style={{
                  fontSize: 11,
                  color: COLOURS.muted,
                  marginTop: 22,
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                Reference: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
