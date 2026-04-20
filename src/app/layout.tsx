import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "إكسامي - منصة تعليمية ذكية",
  description: "منصة تعليمية ذكية مدعومة بالذكاء الاصطناعي للطلاب والمعلمين",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={`${cairo.variable} font-sans antialiased bg-background text-foreground`}
        style={{ fontFamily: 'var(--font-cairo), sans-serif' }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
