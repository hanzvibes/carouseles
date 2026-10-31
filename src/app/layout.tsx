import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carouseles — Programmatic Carousel Design",
  description: "Turn one idea into a polished multi-slide carousel."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}