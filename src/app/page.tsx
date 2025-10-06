import './globals.css';
import ThemeProvider from './theme-provider';
import Link from 'next/link';
import { Inter } from 'next/font/google';

type ThemePrefs = {
  colorCritica?: string;
  colorUrgente?: string;
  colorRelevante?: string;
  colorOpcional?: string;
};

function extractThemePrefs(value: unknown): ThemePrefs | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return {
    colorCritica: typeof record.colorCritica === 'string' ? record.colorCritica : undefined,
    colorUrgente: typeof record.colorUrgente === 'string' ? record.colorUrgente : undefined,
    colorRelevante: typeof record.colorRelevante === 'string' ? record.colorRelevante : undefined,
    colorOpcional: typeof record.colorOpcional === 'string' ? record.colorOpcional : undefined,
  };
}

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata = {
  title: 'Agenda Inteligente',
  description: 'Prototipo Incremento 1',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  const endpoint = base ? new URL('/api/prefs', base).toString() : '/api/prefs';

  let prefs: ThemePrefs | null = null;
  try {
    const res = await fetch(endpoint, { cache: 'no-store', next: { revalidate: 0 } });
    if (res.ok) {
      const data: unknown = await res.json();
      prefs = extractThemePrefs(data);
    }
  } catch (error) {
    console.error('Error al cargar preferencias', error);
  }

  return (
    <html lang="es">
      <body
        className={`${inter.variable} bg-app text-body`}
        style={{ fontFamily: 'var(--font-inter), system-ui, Arial' }}
      >
        <ThemeProvider prefs={prefs ?? undefined}>
          <div className="min-h-screen grid grid-rows-[56px_1fr]">
            {/* Topbar */}
            <nav className="px-4 md:px-6 bg-surface border-b border-ui flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-lg" style={{ background: 'var(--accent)' }} />
                <span className="font-semibold tracking-tight">Agenda Inteligente</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="input w-64 hidden md:block"
                  placeholder="Buscar ( / )"
                  aria-label="Buscar"
                />
                <Link
                  href="/settings"
                  className="btn"
                  title="Preferencias"
                >
                  Preferencias
                </Link>
                <button className="btn-primary">Crear</button>
              </div>
            </nav>

            {/* Body */}
            <div className="grid grid-cols-[240px_1fr] gap-0">
              {/* Sidebar */}
              <aside className="hidden md:block bg-surface border-r border-ui p-3">
                <div className="card p-3">
                  <p className="text-xs uppercase tracking-wide text-[var(--muted)] mb-2">Navegación</p>
                  <nav className="space-y-1.5">
                    <Link className="aside-link" href="/">Hoy</Link>
                    <Link className="aside-link aside-link--active" href="/calendar">Calendario</Link>
                    <Link className="aside-link" href="/kanban">Tareas</Link>
                    <Link className="aside-link" href="/settings">Configurar</Link>
                  </nav>
                </div>
              </aside>

              {/* Main */}
              <main className="p-4 md:p-6">{children}</main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
