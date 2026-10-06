import "./globals.css";

export const metadata = {
  title: "Vouchr — Decentralized Certificate Registry",
  description: "Issue and verify certificates on Ethereum Sepolia.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
