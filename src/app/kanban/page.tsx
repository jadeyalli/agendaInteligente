type ColumnProps = { title: string; className?: string };

const Column = ({ title, className = '' }: ColumnProps) => (
    <div className={`bg-surface border border-ui rounded-xl p-3 ${className}`}>
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="space-y-2">
        <div className="p-3 rounded text-white" style={{ background:'var(--critica)' }}>Crítica • Entrega del informe</div>
        <div className="p-3 rounded" style={{ background:'var(--urgente)', color:'#111827' }}>Urgente • Llamada</div>
        <div className="p-3 rounded text-white" style={{ background:'var(--relevante)' }}>Relevante • Planificar sprint</div>
        <div className="p-3 rounded" style={{ background:'var(--opcional)', color:'#111827' }}>Opcional • Ideas</div>
      </div>
    </div>
  );

export default function KanbanPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Tareas por prioridad</h1>
      <div className="grid grid-cols-4 gap-4">
        <Column title="Crítica" />
        <Column title="Urgente" />
        <Column title="Relevante" />
        <Column title="Opcional" />
      </div>
    </div>
  );
}
