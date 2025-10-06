import './globals.css';
import ThemeProvider from './theme-provider';
import Link from 'next/link';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata = {
  title: 'Agenda Inteligente',
  description: 'Prototipo Incremento 1',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  let prefs: any = null;
  try {
    const res = await fetch(`${base}/api/prefs`, { cache: 'no-store' });
    if (res.ok) prefs = await res.json();
  } catch {}

  return (
    <html lang="es">
      <body className={`${inter.variable} bg-app text-body`} style={{ fontFamily: 'var(--font-inter), system-ui, Arial' }}>
        <ThemeProvider prefs={prefs}>
          <div className="flex flex-col min-h-screen">
            <nav className="h-16 bg-surface border-b border-ui flex items-center justify-between px-6">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full" style={{ background: 'var(--accent)' }} />
                <span className="font-semibold">Agenda Inteligente</span>
              </div>
              <div className="flex items-center gap-3">
                <input className="h-9 w-80 rounded border border-ui px-3" placeholder="Buscar..." aria-label="Buscar" />
                <div className="h-9 w-9 rounded bg-gray-100 flex items-center justify-center" title="Modo oscuro">●</div>
                <Link href="/settings" className="h-9 w-9 rounded bg-gray-100 flex items-center justify-center" title="Settings">⚙</Link>
                <div className="h-9 w-9 rounded-full bg-gray-300" />
              </div>
            </nav>
            <div className="flex flex-1">
              <aside className="w-64 bg-surface border-r border-ui p-4">
                <p className="text-sm font-semibold mb-3">Navegación</p>
                <div className="space-y-2">
                  <a className="block px-3 py-2 rounded border border-transparent hover:border-ui" href="/">Hoy</a>
                  <a className="block px-3 py-2 rounded bg-[#ECFDF5] border border-[var(--accent)]" href="/calendar">Calendario</a>
                  <a className="block px-3 py-2 rounded hover:bg-gray-50" href="/kanban">Tareas</a>
                  <a className="block px-3 py-2 rounded hover:bg-gray-50" href="/settings">Configurar</a>
                </div>
                <button id="btn-new" className="mt-4 w-full h-10 rounded text-white" style={{ background: 'var(--accent)' }}>
                  Crear
                </button>
              </aside>
              <main className="flex-1 p-4">{children}</main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}