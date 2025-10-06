'use client';
import { useEffect, useState } from 'react';

type Prefs = {
  theme: string;
  labelCriticaName: string; labelUrgenteName: string; labelRelevanteName: string; labelOpcionalName: string;
  colorCritica: string; colorUrgente: string; colorRelevante: string; colorOpcional: string;
};

const PRESETS = [
  { name: 'Esmeralda', critica:'#EF4444', urgente:'#F59E0B', relevante:'#10B981', opcional:'#9CA3AF' },
  { name: 'Pastel', critica:'#FCA5A5', urgente:'#FCD34D', relevante:'#86EFAC', opcional:'#CBD5E1' },
  { name: 'Oscuro', critica:'#DC2626', urgente:'#D97706', relevante:'#059669', opcional:'#6B7280' },
];

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => { fetch('/api/prefs').then(r=>r.json()).then(setPrefs); }, []);

  const applyPreset = (p:any) => {
    if (!prefs) return;
    setPrefs({ ...prefs,
      theme: p.name,
      colorCritica: p.critica, colorUrgente:p.urgente, colorRelevante:p.relevante, colorOpcional:p.opcional
    });
  };

  const save = async () => {
    await fetch('/api/prefs', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(prefs) });
    alert('Preferencias guardadas. Refresca para aplicar colores.');
  };

  if (!prefs) return <div>Cargando…</div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">🎨 Personalización de etiquetas</h1>

      <div className="mb-4">
        <p className="text-sm font-semibold mb-2">Paletas predefinidas</p>
        <div className="flex gap-3">
          {PRESETS.map(p => (
            <button key={p.name} onClick={()=>applyPreset(p)} className="px-3 py-2 rounded border border-ui bg-surface">
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 bg-surface p-4 rounded border border-ui">
        {[
          { key:'Critica',  color: prefs.colorCritica,  label: prefs.labelCriticaName },
          { key:'Urgente',  color: prefs.colorUrgente,  label: prefs.labelUrgenteName },
          { key:'Relevante',color: prefs.colorRelevante, label: prefs.labelRelevanteName },
          { key:'Opcional', color: prefs.colorOpcional,  label: prefs.labelOpcionalName },
        ].map(item => (
          <div key={item.key} className="flex items-center gap-3">
            <input type="color" value={(prefs as any)[`color${item.key}`]}
              onChange={e=>setPrefs(pr=> pr ? ({ ...pr, [`color${item.key}`]: e.target.value }) as any : pr)} />
            <input className="border border-ui rounded px-3 h-10 flex-1"
              value={(prefs as any)[`label${item.key}Name`]}
              onChange={e=>setPrefs(pr=> pr ? ({ ...pr, [`label${item.key}Name`]: e.target.value }) as any : pr)} />
          </div>
        ))}
      </div>

      <div className="flex justify-end mt-4">
        <button className="h-10 px-4 rounded text-white" style={{ background:'var(--accent)' }} onClick={save}>Guardar</button>
      </div>
    </div>
  );
}
