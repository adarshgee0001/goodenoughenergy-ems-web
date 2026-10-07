import { useState, type FormEvent } from 'react';
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

interface CreateDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (device: Device) => void;
  assetId: string;
}

export function CreateDeviceModal({ isOpen, onClose, onSuccess, assetId }: CreateDeviceModalProps) {
  const [type, setType] = useState<DeviceType>('PCS');
  const [name, setName] = useState('');
  const [componentId, setComponentId] = useState('');
  const [hardwareId, setHardwareId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setType('PCS');
    setName('');
    setComponentId('');
    setHardwareId('');
    setError(null);
  };

  const handleClose = () => {
    reset();
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
      const device = await deviceService.createDevice(assetId, {
        type,
        componentId: trimmedComponentId,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(hardwareId.trim() ? { hardwareId: hardwareId.trim() } : {}),
      });
      onSuccess(device);
      reset();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while creating the device.');
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
          <h2 className="text-xl font-bold text-slate-900">Add Device</h2>
          <button
            onClick={handleClose}
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
            <label htmlFor="device-type" className="block text-sm font-medium text-slate-700 mb-1">
              Device Type *
            </label>
            <select
              id="device-type"
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
            <label htmlFor="device-component-id" className="block text-sm font-medium text-slate-700 mb-1">
              Component ID *
            </label>
            <input
              id="device-component-id"
              type="text"
              required
              disabled={isSubmitting}
              value={componentId}
              onChange={(e) => setComponentId(e.target.value)}
              placeholder="e.g. pcs"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
            <p className="mt-1 text-xs text-slate-500">Matches the <code className="font-mono">devs[].dev</code> field in the MQTT payload.</p>
          </div>

          <div>
            <label htmlFor="device-name" className="block text-sm font-medium text-slate-700 mb-1">
              Name <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="device-name"
              type="text"
              disabled={isSubmitting}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main PCS"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          <div>
            <label htmlFor="device-hardware-id" className="block text-sm font-medium text-slate-700 mb-1">
              Hardware ID <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="device-hardware-id"
              type="text"
              disabled={isSubmitting}
              value={hardwareId}
              onChange={(e) => setHardwareId(e.target.value)}
              placeholder="e.g. MAC or serial number"
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
              disabled={isSubmitting || !isFormValid}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-500 focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Device'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
