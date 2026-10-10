import "./globals.css";

export const metadata = {
  title: "Craft-Chain: the story behind every handmade batch",
  description:
    "Create a batch, add updates as it changes hands, and let anyone check where it came from.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Young+Serif&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}