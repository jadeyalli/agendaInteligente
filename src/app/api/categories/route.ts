import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';

const DEFAULT_CATEGORIES = ['Escuela', 'Trabajo', 'Personal', 'Familia', 'Salud'];

function parseCategories(raw: string | null | undefined): string[] {
  if (!raw) return [...DEFAULT_CATEGORIES];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((c) => typeof c === 'string' && c.trim().length > 0);
      return valid.length > 0 ? valid : [...DEFAULT_CATEGORIES];
    }
  } catch {
    // ignore parse errors
  }
  return [...DEFAULT_CATEGORIES];
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  const categories = parseCategories(settings?.categories);
  return NextResponse.json({ categories });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { categories?: unknown };
  const incoming = body.categories;

  if (!Array.isArray(incoming)) {
    return NextResponse.json({ error: 'categories debe ser un array.' }, { status: 400 });
  }

  const categories = incoming
    .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    .map((c) => c.trim())
    .slice(0, 50); // max 50 categories

  if (categories.length === 0) {
    return NextResponse.json({ error: 'Debe haber al menos una categoría.' }, { status: 400 });
  }

  await prisma.userSettings.upsert({
    where: { userId: user.id },
    update: { categories: JSON.stringify(categories) },
    create: {
      userId: user.id,
      categories: JSON.stringify(categories),
    },
  });

  return NextResponse.json({ categories });
}
