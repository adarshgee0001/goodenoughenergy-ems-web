import { useState, useEffect, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { deviceService } from './device.service';
import type { Device, DeviceType } from './device.types';

const DEVICE_TYPES: DeviceType[] = ['BMS', 'PCS', 'EMU', 'TMS', 'METER', 'IO', 'PV_INVERTER'];

const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  BMS: 'BMS',
  PCS: 'PCS',
  EMU: 'EMU',
  TMS: 'TMS',
  METER: 'Meter',
  IO: 'IO',
  PV_INVERTER: 'PV Inverter',
};

interface EditDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (device: Device) => void;
  device: Device | null;
}

export function EditDeviceModal({ isOpen, onClose, onSuccess, device }: EditDeviceModalProps) {
  const [type, setType] = useState<DeviceType>('PCS');
  const [name, setName] = useState('');
  const [componentId, setComponentId] = useState('');
  const [hardwareId, setHardwareId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (device) {
      setType(device.type);
      setName(device.name || '');
      setComponentId(device.componentId || '');
      setHardwareId(device.hardwareId || '');
      setError(null);
    }
  }, [device]);

  if (!isOpen || !device) return null;

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedComponentId = componentId.trim();

    if (!trimmedComponentId) {
      setError('Component ID is required and cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await deviceService.updateDevice(device.id, {
        type,
        componentId: trimmedComponentId,
        name: name.trim() || null,
        hardwareId: hardwareId.trim() || null,
      });
      onSuccess(updated);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while updating the device.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = componentId.trim() !== '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Edit Device</h2>
          <button
            onClick={handleClose}
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
            <label htmlFor="edit-device-type" className="block text-sm font-medium text-slate-700 mb-1">
              Device Type *
            </label>
            <select
              id="edit-device-type"
              required
              disabled={isSubmitting}
              value={type}
              onChange={(e) => setType(e.target.value as DeviceType)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            >
              {DEVICE_TYPES.map((t) => (
                <option key={t} value={t}>{DEVICE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="edit-device-component-id" className="block text-sm font-medium text-slate-700 mb-1">
              Component ID *
            </label>
            <input
              id="edit-device-component-id"
              type="text"
              required
              disabled={isSubmitting}
              value={componentId}
              onChange={(e) => setComponentId(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          <div>
            <label htmlFor="edit-device-name" className="block text-sm font-medium text-slate-700 mb-1">
              Name <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="edit-device-name"
              type="text"
              disabled={isSubmitting}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          <div>
            <label htmlFor="edit-device-hardware-id" className="block text-sm font-medium text-slate-700 mb-1">
              Hardware ID <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="edit-device-hardware-id"
              type="text"
              disabled={isSubmitting}
              value={hardwareId}
              onChange={(e) => setHardwareId(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors duration-150 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isFormValid}
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
