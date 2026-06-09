import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CopilotKit } from "@copilotkit/react-core";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import "@copilotkit/react-ui/styles.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Learning Agent",
  description: "Turn any PDF into an interactive lesson",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground transition-colors duration-200">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <header className="sticky top-0 z-50 w-full border-b border-border/50 glass bg-background/80">
            <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
              <a href="/dashboard" className="flex items-center gap-2.5 group">
                <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                  <svg
                    className="h-4 w-4 text-primary-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.966 8.966 0 0 0-6 2.292m0-14.25v14.25"
                    />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-foreground tracking-tight">
                  Memorang <span className="text-primary font-bold">AI</span>
                </span>
              </a>
              <ThemeToggle />
            </div>
          </header>
          <CopilotKit runtimeUrl="/api/copilotkit" useSingleEndpoint={false}>
            <div className="flex-1">{children}</div>
          </CopilotKit>
        </ThemeProvider>
      </body>
    </html>
  );
}
