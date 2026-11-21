import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalForge — Product Intelligence",
  description:
    "Understand product behaviour, measure experiments, and make evidence-led decisions.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
