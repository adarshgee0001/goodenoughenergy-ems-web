import { useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { bessService } from './bess.service';
import type { BessAsset } from './bess.types';

interface CreateBessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (asset: BessAsset) => void;
  siteId: string;
}

export function CreateBessModal({ isOpen, onClose, onSuccess, siteId }: CreateBessModalProps) {
  const [name, setName] = useState('');
  const [assetIdentifier, setAssetIdentifier] = useState('');
  const [emuId, setEmuId] = useState('');
  const [mqttTopic, setMqttTopic] = useState('');
  const [model, setModel] = useState('');
  const [energyCapacity, setEnergyCapacity] = useState('');
  const [powerRating, setPowerRating] = useState('');
  const [reportIntervalMinutes, setReportIntervalMinutes] = useState(15);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const trimmedName = name.trim();
    const trimmedAssetId = assetIdentifier.trim();
    const trimmedEmuId = emuId.trim();
    const trimmedMqttTopic = mqttTopic.trim();
    
    if (!trimmedName || !trimmedAssetId || !trimmedMqttTopic || !trimmedEmuId) {
      setError('Asset Name, Asset Identifier, MQTT Topic, and EMU ID are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newAsset = await bessService.createBess(
        siteId, 
        trimmedName, 
        trimmedAssetId, 
        emuId.trim() || null,
        model.trim() || undefined, 
        energyCapacity, 
        powerRating,
        mqttTopic.trim() || null,
        reportIntervalMinutes
      );
      onSuccess(newAsset);
      
      setName('');
      setAssetIdentifier('');
      setEmuId('');
      setMqttTopic('');
      setModel('');
      setEnergyCapacity('');
      setPowerRating('');
      setReportIntervalMinutes(15);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while creating the BESS asset.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Add BESS Asset</h2>
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
            <label htmlFor="bess-name" className="block text-sm font-medium text-slate-700 mb-1">
              BESS Name *
            </label>
            <input
              id="bess-name"
              type="text"
              required
              disabled={isSubmitting}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. StorEDGE 5.0"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          <div>
            <label htmlFor="bess-identifier" className="block text-sm font-medium text-slate-700 mb-1">
              Asset Identifier *
            </label>
            <input
              id="bess-identifier"
              type="text"
              required
              disabled={isSubmitting}
              value={assetIdentifier}
              onChange={(e) => setAssetIdentifier(e.target.value)}
              placeholder="e.g. STOR-5MWH-001"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          <div>
            <label htmlFor="bess-mqtt-topic" className="block text-sm font-medium text-slate-700 mb-1">
              MQTT Topic *
            </label>
            <input
              id="bess-mqtt-topic"
              type="text"
              required
              disabled={isSubmitting}
              value={mqttTopic}
              onChange={(e) => setMqttTopic(e.target.value)}
              placeholder="e.g. /gw50hadarsh/0QQSB03PY21106F680100009/user"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Unique MQTT topic assigned to this BESS by R&D.
            </p>
          </div>

          <div>
            <label htmlFor="bess-emu-id" className="block text-sm font-medium text-slate-700 mb-1">
              EMU ID *
            </label>
            <input
              id="bess-emu-id"
              type="text"
              required
              disabled={isSubmitting}
              value={emuId}
              onChange={(e) => setEmuId(e.target.value)}
              placeholder="e.g. EMU-998877"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Matches the sn field in the MQTT payload.
            </p>
          </div>

          <div>
            <label htmlFor="bess-model" className="block text-sm font-medium text-slate-700 mb-1">
              Model (Optional)
            </label>
            <input
              id="bess-model"
              type="text"
              disabled={isSubmitting}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. StorEDGE 5.0"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="bess-energy" className="block text-sm font-medium text-slate-700 mb-1">
                Energy Capacity (kWh)
              </label>
              <input
                id="bess-energy"
                type="number"
                min="0"
                step="0.1"
                disabled={isSubmitting}
                value={energyCapacity}
                onChange={(e) => setEnergyCapacity(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
            <div>
              <label htmlFor="bess-power" className="block text-sm font-medium text-slate-700 mb-1">
                Power Rating (kW)
              </label>
              <input
                id="bess-power"
                type="number"
                min="0"
                step="0.1"
                disabled={isSubmitting}
                value={powerRating}
                onChange={(e) => setPowerRating(e.target.value)}
                placeholder="e.g. 2500"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
          </div>

          <div>
            <label htmlFor="bess-interval" className="block text-sm font-medium text-slate-700 mb-1">
              Reporting Interval (Minutes)
            </label>
            <select
              id="bess-interval"
              disabled={isSubmitting}
              value={reportIntervalMinutes}
              onChange={(e) => setReportIntervalMinutes(parseInt(e.target.value, 10))}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-slate-900 disabled:bg-slate-50 disabled:text-slate-500"
            >
              {[...Array(20)].map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1} minute{i > 0 ? 's' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Applies to all BESS assets in this site for synchronized reporting.
            </p>
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
              disabled={isSubmitting || !name.trim() || !assetIdentifier.trim() || !mqttTopic.trim() || !emuId.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-500 focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Asset'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
