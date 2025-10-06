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
  if (typeof value !== 'object' || value === null) {
    return null;
  }
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
      <body className={`${inter.variable} bg-app text-body`} style={{ fontFamily: 'var(--font-inter), system-ui, Arial' }}>
        <ThemeProvider prefs={prefs ?? undefined}>
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
                  <Link className="block px-3 py-2 rounded border border-transparent hover:border-ui" href="/">Hoy</Link>
                  <Link className="block px-3 py-2 rounded bg-[#ECFDF5] border border-[var(--accent)]" href="/calendar">Calendario</Link>
                  <Link className="block px-3 py-2 rounded hover:bg-gray-50" href="/kanban">Tareas</Link>
                  <Link className="block px-3 py-2 rounded hover:bg-gray-50" href="/settings">Configurar</Link>
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
