import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IVidya AI Concept Tutor",
  description: "Prototype based on Class VI NCERT Science chapter on Magnets",
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