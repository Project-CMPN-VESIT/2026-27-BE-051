import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/layout/providers";
import { Navbar } from "@/components/layout/navbar";
import { SiteFooter } from "@/components/layout/site-footer";

const serifDisplay = localFont({
  src: [
    { path: "../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-600-italic.woff2", weight: "600", style: "italic" },
    { path: "../node_modules/@fontsource/source-serif-4/files/source-serif-4-latin-700-italic.woff2", weight: "700", style: "italic" },
  ],
  display: "swap",
  variable: "--font-serif-display",
});

const grotesk = localFont({
  src: [
    { path: "../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-grotesk",
});

const monoCode = localFont({
  src: [
    { path: "../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-mono-code",
});

/**
 * Fonts are self-hosted by next/font — no render-blocking request to Google and
 * no layout shift. The `variable` values are consumed by the @theme block in
 * globals.css (--font-serif-display / --font-grotesk / --font-mono-code).
 *
 * A humanist serif for headings is deliberate: it reads as considered and
 * credible, which is the whole pitch. The grotesk keeps UI text unambiguous.
 */
export const metadata: Metadata = {
  title: {
    default: "CodeBazaar — Proof that the code is real",
    template: "%s | CodeBazaar",
  },
  description:
    "Every project on CodeBazaar carries a Verified Build Score computed from its real commit history. Buy, fund, and hire with evidence instead of screenshots.",
  keywords: [
    "verified build score",
    "student projects",
    "hackathon verification",
    "code marketplace",
    "developer reputation",
  ],
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://codebazaar.dev",
    siteName: "CodeBazaar",
    title: "CodeBazaar — Proof that the code is real",
    description:
      "Verified Build Scores computed from real commit history. Buy, fund, and hire with evidence.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    // Matches --background in each theme so the mobile browser chrome blends in.
    { media: "(prefers-color-scheme: light)", color: "#faf7f1" },
    { media: "(prefers-color-scheme: dark)", color: "#16130f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      // Next 16 no longer overrides scroll-behavior during navigation unless
      // asked to. Without this, `scroll-behavior: smooth` makes route changes
      // animate a long scroll to the top.
      data-scroll-behavior="smooth"
      className={`${serifDisplay.variable} ${grotesk.variable} ${monoCode.variable}`}
    >
      <body className="min-h-dvh bg-background font-sans antialiased flex flex-col">
        <Providers>
          <Navbar />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
