'use client';
import { useEffect, useState } from 'react';

type Prefs = {
  theme: string;
  labelCriticaName: string;
  labelUrgenteName: string;
  labelRelevanteName: string;
  labelOpcionalName: string;
  colorCritica: string;
  colorUrgente: string;
  colorRelevante: string;
  colorOpcional: string;
};

type Preset = {
  name: string;
  critica: string;
  urgente: string;
  relevante: string;
  opcional: string;
};

const PRESETS: Preset[] = [
  { name: 'Esmeralda', critica: '#EF4444', urgente: '#F59E0B', relevante: '#10B981', opcional: '#9CA3AF' },
  { name: 'Pastel', critica: '#FCA5A5', urgente: '#FCD34D', relevante: '#86EFAC', opcional: '#CBD5E1' },
  { name: 'Oscuro', critica: '#DC2626', urgente: '#D97706', relevante: '#059669', opcional: '#6B7280' },
];

const LABEL_CONFIG = [
  { key: 'Critica', colorKey: 'colorCritica', labelKey: 'labelCriticaName' },
  { key: 'Urgente', colorKey: 'colorUrgente', labelKey: 'labelUrgenteName' },
  { key: 'Relevante', colorKey: 'colorRelevante', labelKey: 'labelRelevanteName' },
  { key: 'Opcional', colorKey: 'colorOpcional', labelKey: 'labelOpcionalName' },
] as const;

type ColorKey = (typeof LABEL_CONFIG)[number]['colorKey'];
type LabelKey = (typeof LABEL_CONFIG)[number]['labelKey'];

function isPrefs(value: unknown): value is Prefs {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const keys: (keyof Prefs)[] = [
    'theme',
    'labelCriticaName',
    'labelUrgenteName',
    'labelRelevanteName',
    'labelOpcionalName',
    'colorCritica',
    'colorUrgente',
    'colorRelevante',
    'colorOpcional',
  ];
  return keys.every((key) => typeof record[key] === 'string');
}

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/prefs');
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (isPrefs(data)) {
          setPrefs(data);
        }
      } catch (error) {
        console.error('Error al cargar preferencias', error);
      }
    };

    void load();
  }, []);

  const applyPreset = (preset: Preset) => {
    setPrefs((prev) =>
      prev
        ? {
            ...prev,
            theme: preset.name,
            colorCritica: preset.critica,
            colorUrgente: preset.urgente,
            colorRelevante: preset.relevante,
            colorOpcional: preset.opcional,
          }
        : prev,
    );
  };

  const handleColorChange = (key: ColorKey, value: string) => {
    setPrefs((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleLabelChange = (key: LabelKey, value: string) => {
    setPrefs((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const save = async () => {
    if (!prefs) return;
    await fetch('/api/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    alert('Preferencias guardadas. Refresca para aplicar colores.');
  };

  if (!prefs) return <div>Cargando...</div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold mb-4">Personalizacion de etiquetas</h1>

      <div className="mb-4">
        <p className="text-sm font-semibold mb-2">Paletas predefinidas</p>
        <div className="flex gap-3">
          {PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset)}
              className="px-3 py-2 rounded border border-ui bg-surface"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 bg-surface p-4 rounded border border-ui">
        {LABEL_CONFIG.map(({ key, colorKey, labelKey }) => (
          <div key={key} className="flex items-center gap-3">
            <input
              type="color"
              value={prefs[colorKey]}
              onChange={(event) => handleColorChange(colorKey, event.target.value)}
            />
            <input
              className="border border-ui rounded px-3 h-10 flex-1"
              value={prefs[labelKey]}
              onChange={(event) => handleLabelChange(labelKey, event.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end mt-4">
        <button className="h-10 px-4 rounded text-white" style={{ background: 'var(--accent)' }} onClick={save}>
          Guardar
        </button>
      </div>
    </div>
  );
}
