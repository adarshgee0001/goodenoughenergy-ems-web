import { useState, type FormEvent } from 'react';
import { Loader2, X, Check, Copy } from 'lucide-react';
import { userService } from './user.service';
import type { ClientUser } from './user.types';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  onSuccess: (user: ClientUser) => void;
}

export function CreateUserModal({ isOpen, onClose, clientId, onSuccess }: CreateUserModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [invitationStatus, setInvitationStatus] = useState<{sent: boolean, message?: string} | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail) {
      setError('Name and email are required.');
      return;
    }

    // Basic email validation pattern
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await userService.createClientUser(clientId, {
        name: trimmedName,
        email: trimmedEmail
      });
      
      onSuccess(response.user);
      
      if (response.invitation) {
        setInvitationStatus(response.invitation);
      }

      if (response.temporaryPassword) {
        setTempPassword(response.temporaryPassword);
      } else {
        // If no password returned, just close
        handleClose();
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while creating the user.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const handleClose = () => {
    // Reset state when closing
    setName('');
    setEmail('');
    setError(null);
    setTempPassword(null);
    setCopied(false);
    setInvitationStatus(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">
            {tempPassword ? 'User Created' : 'Create Client User'}
          </h2>
          <button 
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {tempPassword ? (
          <div className="p-6 space-y-6 text-center flex flex-col items-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-2">
              <Check className="w-6 h-6" />
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-slate-900">User created successfully.</h3>
              <p className="text-sm text-slate-500 mt-1">Please securely copy the temporary password below.</p>
            </div>
            
            <div className="w-full bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2 text-left">Login Email</div>
              <div className="text-left font-medium text-slate-900 mb-4">{email}</div>

              <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2 text-left">Temporary Password</div>
              <div className="flex items-center justify-between bg-white border border-slate-300 rounded-md p-2">
                <code className="text-slate-900 font-mono text-lg">{tempPassword}</code>
                <button
                  onClick={handleCopy}
                  className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {invitationStatus && (
              <div className={`w-full p-4 rounded-lg border text-sm text-left ${invitationStatus.sent ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 font-bold">
                    {invitationStatus.sent ? '✓' : '⚠'}
                  </div>
                  <div>
                    {invitationStatus.sent 
                      ? 'Invitation email sent successfully.' 
                      : `User created, but invitation email could not be sent. ${invitationStatus.message || ''}`}
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleClose}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-500"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">
                Name *
              </label>
              <input
                id="name"
                type="text"
                required
                disabled={isSubmitting}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                Email *
              </label>
              <input
                id="email"
                type="email"
                required
                disabled={isSubmitting}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. john@example.com"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            <div className="pt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim() || !email.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-900 bg-primary-600 border border-transparent rounded-lg hover:bg-primary-500 focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create User'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
