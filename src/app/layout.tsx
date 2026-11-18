import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UniPass — Sự kiện dành cho sinh viên VNU",
  description: "Xem workshop, talk và hoạt động sinh viên quanh VNU.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
