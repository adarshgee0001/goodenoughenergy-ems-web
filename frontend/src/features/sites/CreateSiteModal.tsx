import { useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { siteService } from './site.service';
import type { Site } from './site.types';

interface CreateSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (site: Site) => void;
  clientId: string;
}

export function CreateSiteModal({ isOpen, onClose, onSuccess, clientId }: CreateSiteModalProps) {
  const [name, setName] = useState('');
  const [businessIdentifier, setBusinessIdentifier] = useState('');
  const [timezone, setTimezone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const trimmedName = name.trim();
    const trimmedBusinessId = businessIdentifier.trim();
    const selectedTimezone = timezone.trim() || undefined;
    
    if (!trimmedName || !trimmedBusinessId) {
      setError('Site Name and Business Identifier are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newSite = await siteService.createSite(clientId, trimmedName, trimmedBusinessId, selectedTimezone);
      onSuccess(newSite);
      
      setName('');
      setBusinessIdentifier('');
      setTimezone('');
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while creating the site.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Add Site</h2>
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="site-name" className="block text-sm font-medium text-slate-700 mb-1">
              Site Name *
            </label>
            <input
              id="site-name"
              type="text"
              required
              disabled={isSubmitting}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Greater Noida Plant"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          <div>
            <label htmlFor="site-businessIdentifier" className="block text-sm font-medium text-slate-700 mb-1">
              Business Identifier *
            </label>
            <input
              id="site-businessIdentifier"
              type="text"
              required
              disabled={isSubmitting}
              value={businessIdentifier}
              onChange={(e) => setBusinessIdentifier(e.target.value)}
              placeholder="e.g. SITE-001"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          <div>
            <label htmlFor="site-timezone" className="block text-sm font-medium text-slate-700 mb-1">
              Timezone (Optional)
            </label>
            <select
              id="site-timezone"
              disabled={isSubmitting}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            >
              <option value="">Not specified</option>
              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              <option value="UTC">UTC</option>
              <option value="Asia/Dubai">Asia/Dubai (GST)</option>
              <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="America/New_York">America/New_York (EST/EDT)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
            </select>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || !businessIdentifier.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-500 focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Site'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
