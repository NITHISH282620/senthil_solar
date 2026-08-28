import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Tamil } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { getServerLocale } from "@/lib/i18n/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Geist has no Tamil glyphs at all — without an explicit Tamil-capable
// family in the stack, the browser falls back to whatever font the device
// happens to ship, which is inconsistent across Android versions/browsers.
// Noto Sans Tamil is Google's own reference Tamil font, matched in weight to
// Geist so mixed Tamil/English text (a Tamil label next to an English site
// name) doesn't visibly change typeface mid-sentence.
const notoSansTamil = Noto_Sans_Tamil({
  variable: "--font-noto-tamil",
  subsets: ["tamil"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "SolarOps — Operations Management",
    template: "%s — SolarOps",
  },
  description:
    "Solar installation operations management system for employees, customers, quotations, work orders, billing, and reporting.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansTamil.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <LocaleProvider initialLocale={locale}>
          <TooltipProvider delay={0}>
            {children}
          </TooltipProvider>
          <Toaster richColors position="top-right" />
        </LocaleProvider>
      </body>
    </html>
  );
}
