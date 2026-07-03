import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Facet",
  description:
    "A forum where you speak through masks — contextual personas under one hidden root — and every Room is tended by an AI agent the community can overrule.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        <footer
          className="border-t py-4 text-center text-xs"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Facet — personas are public, roots are private. Agent decisions are always overrideable.
        </footer>
      </body>
    </html>
  );
}
