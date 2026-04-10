import '@/styles/globals.css';

export const metadata = {
  title: 'BoilerGPA — Purdue GPA Calculator',
  description: 'AI-powered syllabus parsing and historical curve prediction for Purdue University',
  icons: {
    icon: [
      { rel: 'icon', url: '/favicon.ico' },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <div className="min-h-screen bg-gradient-to-b from-charcoal-950 via-charcoal-900 to-charcoal-950">
          {children}
        </div>
      </body>
    </html>
  );
}
