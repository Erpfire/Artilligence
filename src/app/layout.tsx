import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import { Rajdhani, Outfit } from "next/font/google";

const rajdhani = Rajdhani({
  subsets: ["latin", "devanagari"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-rajdhani",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata = {
  title: "Artilligence — Exide Battery Sales Platform",
  description:
    "India's premier MLM sales platform for Exide battery products. Track sales, build your team, and grow your business.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${rajdhani.variable} ${outfit.variable}`}>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
