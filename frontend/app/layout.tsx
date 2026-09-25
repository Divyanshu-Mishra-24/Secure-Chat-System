import type { Metadata } from "next";
import "./styles.css";
import "./landing.css";

export const metadata: Metadata = {
  title: "Signal — Private Messenger",
  description: "Sign in to your private messaging account.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
