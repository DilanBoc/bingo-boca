import { Bowlby_One, Nunito } from 'next/font/google';
import './globals.css';

const display = Bowlby_One({ weight: '400', subsets: ['latin'], variable: '--f-display' });
const body = Nunito({ subsets: ['latin'], variable: '--f-body' });

export const metadata = {
  title: 'Bingo en familia',
  description: 'Bingo de 75 balotas para jugar desde el celular',
};
export const viewport = { width: 'device-width', initialScale: 1, themeColor: '#0E3B2E' };

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
