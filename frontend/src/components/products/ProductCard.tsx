import { Link } from 'react-router-dom';
import type { Product } from '../../data/products';
import { Battery } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { motion } from 'framer-motion';

export function ProductCard({ product }: { product: Product }) {
  return (
    <motion.div 
      whileHover={{ y: -8 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="bg-white rounded-3xl overflow-hidden border border-slate-100 shadow-sm flex flex-col group hover:shadow-xl transition-shadow"
    >
      <div className="h-64 bg-slate-50 flex flex-col items-center justify-center p-8 relative border-b border-slate-100 overflow-hidden">
        {product.badge && (
          <div className="absolute top-4 right-4 z-10">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 border border-primary-100 text-primary-700 text-[10px] font-bold uppercase tracking-wider rounded-full shadow-sm">
              {product.badge}
            </span>
          </div>
        )}
        {product.image ? (
          <img 
            src={product.image} 
            alt={product.imageAlt || product.name}
            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
        ) : null}
        
        <div 
          className="flex-col items-center justify-center" 
          style={{ display: product.image ? 'none' : 'flex' }}
        >
          <Battery className="w-24 h-24 text-slate-300 mb-4" strokeWidth={1} />
          <span className="text-slate-400 font-medium tracking-widest uppercase">{product.name}</span>
        </div>
        
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </div>
      <div className="p-8 flex-grow flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-2xl font-bold text-slate-900">{product.name}</h3>
          <div className="text-right">
            <p className="font-semibold text-primary-600">{product.capacity}</p>
            {product.power && <p className="text-sm text-slate-500">{product.power}</p>}
          </div>
        </div>
        <p className="text-slate-600 mb-8 flex-grow leading-relaxed">{product.description}</p>
        <div className="flex flex-wrap gap-2 mb-8">
          {product.useCases.slice(0, 3).map((useCase, i) => (
            <Badge key={i}>{useCase}</Badge>
          ))}
          {product.useCases.length > 3 && (
            <Badge>+{product.useCases.length - 3} more</Badge>
          )}
        </div>
        <Link
          to={product.route}
          className="inline-flex justify-center items-center px-6 py-3 border border-slate-200 hover:border-primary-600 text-sm font-semibold rounded-full text-slate-900 hover:text-white hover:bg-primary-600 transition-colors w-full"
        >
          Explore {product.name}
        </Link>
      </div>
    </motion.div>
  );
}
