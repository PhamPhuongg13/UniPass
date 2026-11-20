import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN || "http://localhost:3417"),
  title: "UniPass — Your student passport on Avalanche",
  description: "Verify once with your school email. Join events, vote and claim rewards — one stamp per program, enforced on Avalanche. Your email stays private.",
  openGraph: {
    title: "UniPass — Your student passport on Avalanche",
    description: "Verify once with your school email. Join events, vote and claim rewards — one stamp per program, enforced on Avalanche. Your email stays private.",
    images: [{ url: "/images/og-image.png", width: 1536, height: 804, alt: "UniPass student passport on Avalanche" }],
    type: "website",
    siteName: "UniPass",
  },
  twitter: {
    card: "summary_large_image",
    title: "UniPass — Your student passport on Avalanche",
    description: "Verify once with your school email. Join events, vote and claim rewards — one stamp per program, enforced on Avalanche. Your email stays private.",
    images: ["/images/og-image.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
