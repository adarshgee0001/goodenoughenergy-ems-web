import { useState, useEffect, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { clientService } from './client.service';
import type { Client } from './client.types';

interface EditClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (client: Client) => void;
  client: Client | null;
}

export function EditClientModal({ isOpen, onClose, onSuccess, client }: EditClientModalProps) {
  const [name, setName] = useState('');
  const [businessIdentifier, setBusinessIdentifier] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill form when client prop changes or modal opens
  useEffect(() => {
    if (isOpen && client) {
      setName(client.name);
      setBusinessIdentifier(client.businessIdentifier || '');
      setError(null);
    }
  }, [isOpen, client]);

  if (!isOpen || !client) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Client Name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedClient = await clientService.updateClient(
        client.id,
        trimmedName,
        businessIdentifier.trim()
      );
      onSuccess(updatedClient);
      
      // We don't reset form fields manually here because the parent will close the modal,
      // and useEffect will re-initialize fields next time it opens.
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while updating the client.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Edit Client</h2>
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors duration-150 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50"
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
            <label htmlFor="edit-name" className="block text-sm font-medium text-slate-700 mb-1">
              Client Name *
            </label>
            <input
              id="edit-name"
              type="text"
              required
              disabled={isSubmitting}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          <div>
            <label htmlFor="edit-businessIdentifier" className="block text-sm font-medium text-slate-700 mb-1">
              Business Identifier <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              id="edit-businessIdentifier"
              type="text"
              disabled={isSubmitting}
              value={businessIdentifier}
              onChange={(e) => setBusinessIdentifier(e.target.value)}
              placeholder="e.g. ACME-001"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors duration-150 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-900 bg-primary-600 border border-transparent rounded-lg hover:bg-primary-500 transition-colors duration-150 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
