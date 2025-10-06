import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PATCH: actualizar evento por ID
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const data = await req.json();

    const updated = await prisma.event.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error al actualizar evento:', error);
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
  }
}

// DELETE: eliminar evento por ID
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    await prisma.event.delete({ where: { id } });

    return NextResponse.json({ message: 'Evento eliminado' });
  } catch (error) {
    console.error('Error al eliminar evento:', error);
    return NextResponse.json({ error: 'Error al eliminar evento' }, { status: 500 });
  }
}