import { useState } from 'react';
import { Loader2, X, Check, Copy, AlertTriangle } from 'lucide-react';
import { userService } from './user.service';
import type { ClientUser } from './user.types';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: ClientUser | null;
  onSuccess: () => void;
}

export function ResetPasswordModal({ isOpen, onClose, user, onSuccess }: ResetPasswordModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen || !user) return null;

  const handleReset = async () => {
    setError(null);
    setIsSubmitting(true);
    
    try {
      const response = await userService.resetUserPassword(user.id);
      
      onSuccess();
      
      if (response.temporaryPassword) {
        setTempPassword(response.temporaryPassword);
      } else {
        handleClose();
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while resetting the password.');
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
    setError(null);
    setTempPassword(null);
    setCopied(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">
            {tempPassword ? 'Password Reset' : 'Reset Password'}
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
              <h3 className="text-lg font-medium text-slate-900">Password reset successfully.</h3>
              <p className="text-sm text-slate-500 mt-1">Please securely copy the new temporary password below.</p>
            </div>
            
            <div className="w-full bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-2 text-left">New Temporary Password</div>
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

            <button
              onClick={handleClose}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-500"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex items-start gap-4 p-4 bg-amber-50 rounded-lg border border-amber-100">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-amber-800">Reset password for {user.name}?</h4>
                <p className="text-sm text-amber-700 mt-1">
                  This will immediately invalidate their current password. They will be required to change this temporary password upon their next login.
                </p>
              </div>
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
                onClick={handleReset}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 border border-transparent rounded-lg hover:bg-amber-700 focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  'Reset Password'
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
