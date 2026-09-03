import { Link } from 'react-router-dom';

interface PageHeroProps {
  title: string;
  description: string;
  bgImage?: string;
  badge?: string;
  rightVisual?: React.ReactNode;
  breadcrumbs?: { label: string; to: string }[];
  cta?: { label: string; to: string; variant?: 'primary' | 'outline' };
}

export function PageHero({
  title,
  description,
  bgImage,
  badge,
  rightVisual,
  breadcrumbs,
  cta
}: PageHeroProps) {
  return (
    <section className="relative w-full bg-slate-900 text-white overflow-hidden py-24 sm:py-32 flex items-center min-h-[40vh]">
      {/* Background Image with Dark Gradient Overlay */}
      {bgImage && (
        <>
          <div className="absolute inset-0 z-0">
            <img 
              src={bgImage} 
              alt="Hero background" 
              className="w-full h-full object-cover" 
            />
          </div>
          <div className="absolute inset-0 bg-slate-900/80 z-0" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent z-0" />
        </>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 w-full">
        <div className={`grid gap-12 items-center ${rightVisual ? 'lg:grid-cols-2' : 'max-w-3xl'}`}>
          <div>
            {breadcrumbs && (
              <nav className="mb-6 flex text-sm text-slate-400 font-medium">
                {breadcrumbs.map((crumb, idx) => (
                  <span key={idx} className="flex items-center">
                    {idx > 0 && <span className="mx-2 text-slate-600">/</span>}
                    {idx === breadcrumbs.length - 1 ? (
                      <span className="text-slate-200">{crumb.label}</span>
                    ) : (
                      <Link to={crumb.to} className="hover:text-white transition-colors">
                        {crumb.label}
                      </Link>
                    )}
                  </span>
                ))}
              </nav>
            )}

            {badge && (
              <span className="inline-block px-3 py-1 rounded-full bg-primary-900/50 text-primary-400 text-sm font-semibold mb-6 border border-primary-500/20">
                {badge}
              </span>
            )}
            
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl mb-6">
              {title}
            </h1>
            <p className="text-lg sm:text-xl text-slate-300 leading-relaxed mb-10">
              {description}
            </p>

            {cta && (
              <div>
                <Link
                  to={cta.to}
                  className={`inline-flex px-8 py-4 font-semibold rounded-full shadow-sm transition-colors text-lg ${
                    cta.variant === 'outline'
                      ? 'bg-transparent border border-slate-300 hover:bg-slate-800 text-white'
                      : 'bg-primary-600 hover:bg-primary-500 text-white'
                  }`}
                >
                  {cta.label}
                </Link>
              </div>
            )}
          </div>

          {rightVisual && (
            <div className="hidden lg:flex justify-center items-center">
              {rightVisual}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
