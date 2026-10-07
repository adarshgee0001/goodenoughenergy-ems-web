export function SectionHeader({ title, subtitle }: { title: string, subtitle?: string }) {
  return (
    <div className="text-center mb-16 max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-slate-900 tracking-tight sm:text-4xl mb-4">
        {title}
      </h2>
      {subtitle && <p className="text-lg text-slate-600">{subtitle}</p>}
    </div>
  );
}
