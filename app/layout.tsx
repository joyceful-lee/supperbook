import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Supperbook",
  description:
    "Keep the recipes you come back to, plan a few good meals, and take a thoughtful list to the shops.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
