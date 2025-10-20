
export const metadata = {
  title: 'Crypto Ledger',
  description: 'Back-office',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
