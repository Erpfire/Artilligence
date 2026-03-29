import "./globals.css";
import SessionProvider from "@/components/SessionProvider";

export const metadata = {
  title: "Artilligence",
  description: "Exide Battery MLM Sales Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
