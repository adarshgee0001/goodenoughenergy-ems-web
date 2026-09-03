import { Link } from 'react-router-dom';
import bgPlaceholder from '../../assets/images/hero/login-bg-placeholder.svg';

export default function LoginPage() {
  return (
    <div className="flex-grow flex items-center justify-center py-24 px-4 sm:px-6 lg:px-8 relative bg-slate-900 min-h-screen">
      {/* Background Image & Overlays */}
      <div className="absolute inset-0 z-0">
        <img 
          src={bgPlaceholder} 
          alt="Energy Infrastructure" 
          className="w-full h-full object-cover opacity-50" 
        />
      </div>
      <div className="absolute inset-0 bg-slate-900/80 z-0" />

      <div className="max-w-md w-full relative z-10 space-y-8 bg-white/10 backdrop-blur-lg p-10 rounded-3xl border border-white/10 shadow-2xl text-center">
        <div>
          <h2 className="mt-6 text-3xl font-bold text-white tracking-tight">
            Authentication Coming Soon
          </h2>
          <p className="mt-4 text-sm text-slate-300 leading-relaxed">
            Secure access for clients, distributors, and administrators will be introduced in the next application phase.
          </p>
        </div>
        <div className="mt-8">
          <Link
            to="/"
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-full shadow-sm text-sm font-bold text-slate-900 bg-primary-600 hover:bg-primary-500 transition-colors"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
