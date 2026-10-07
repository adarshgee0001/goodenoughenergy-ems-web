import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Cpu, AlertCircle, Loader2, Edit2, Trash2 } from 'lucide-react';
import { bessService } from '../../features/bess/bess.service';
import type { BessAsset } from '../../features/bess/bess.types';
import { deviceService } from '../../features/devices/device.service';
import type { Device } from '../../features/devices/device.types';
import { CreateDeviceModal } from '../../features/devices/CreateDeviceModal';
import { EditDeviceModal } from '../../features/devices/EditDeviceModal';
import { DeleteDeviceModal } from '../../features/devices/DeleteDeviceModal';
import { VoltageTrendSection } from '../EMSApp/components/VoltageTrendSection';
import { GridStateTrendSection } from '../EMSApp/components/GridStateTrendSection';

export default function BessDetailsPage() {
  const { clientId, siteId, assetId } = useParams<{ clientId: string; siteId: string; assetId: string }>();

  const [asset, setAsset] = useState<BessAsset | null>(null);
  const [isAssetLoading, setIsAssetLoading] = useState(true);
  const [assetError, setAssetError] = useState<string | null>(null);

  const [devices, setDevices] = useState<Device[]>([]);
  const [isDevicesLoading, setIsDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedDeviceForEdit, setSelectedDeviceForEdit] = useState<Device | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDeviceForDelete, setSelectedDeviceForDelete] = useState<Device | null>(null);

  const fetchAsset = useCallback(async () => {
    if (!assetId) return;
    setIsAssetLoading(true);
    try {
      // Fetch all BESS for this site and find the matching one
      const fetchedAsset = await bessService.getBess(assetId);
      setAsset(fetchedAsset);
      setAssetError(fetchedAsset ? null : 'BESS Asset not found.');
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : 'Failed to load BESS asset.');
    } finally {
      setIsAssetLoading(false);
    }
  }, [assetId, siteId]);

  const fetchDevices = useCallback(async () => {
    if (!assetId) return;
    setIsDevicesLoading(true);
    try {
      const data = await deviceService.getBessDevices(assetId);
      setDevices(data);
      setDevicesError(null);
    } catch (err) {
      setDevicesError(err instanceof Error ? err.message : 'Failed to load devices.');
    } finally {
      setIsDevicesLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    fetchAsset();
    fetchDevices();
  }, [fetchAsset, fetchDevices]);

  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false);
    fetchDevices();
  };

  const handleEditClick = (device: Device) => {
    setSelectedDeviceForEdit(device);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    setSelectedDeviceForEdit(null);
    fetchDevices();
  };

  const handleDeleteClick = (device: Device) => {
    setSelectedDeviceForDelete(device);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteSuccess = () => {
    setIsDeleteModalOpen(false);
    setSelectedDeviceForDelete(null);
    fetchDevices();
  };

  if (isAssetLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary-500" />
        <p>Loading BESS asset...</p>
      </div>
    );
  }

  if (assetError || !asset) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link to={`/admin/clients/${clientId}/sites/${siteId}`} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">BESS Asset Details</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-red-800">Error Loading Asset</h3>
          <p className="text-red-600 mt-2">{assetError || 'BESS Asset not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-4 mb-6">
          <Link to={`/admin/clients/${clientId}/sites/${siteId}`} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="Back to Site">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{asset.name}</h1>
            <p className="text-slate-500 mt-1">BESS Asset · Device Management</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 mb-1">Asset Identifier</p>
            <p className="text-slate-900 font-medium">{asset.assetIdentifier}</p>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 mb-1">Created</p>
            <p className="text-slate-900">
              {new Date(asset.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 mb-1">Asset ID</p>
            <p className="text-slate-600 font-mono text-sm">{asset.id}</p>
          </div>
        </div>
      </div>

      {/* Devices Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900">Devices</h2>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-slate-900 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Device
          </button>
        </div>

        {isDevicesLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-white border border-slate-200 rounded-xl shadow-sm">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary-500" />
            <p>Loading devices...</p>
          </div>
        ) : devicesError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <p className="text-red-600 font-medium">{devicesError}</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Cpu className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No devices found</h3>
            <p className="text-slate-500 mt-2 max-w-sm mx-auto">
              This BESS asset has no devices mapped yet. Add a device to enable MQTT telemetry persistence.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                    <th className="py-4 px-6 whitespace-nowrap">Type</th>
                    <th className="py-4 px-6 whitespace-nowrap">Name</th>
                    <th className="py-4 px-6 whitespace-nowrap">Component ID</th>
                    <th className="py-4 px-6 whitespace-nowrap hidden lg:table-cell">Hardware ID</th>
                    <th className="py-4 px-6 whitespace-nowrap hidden md:table-cell">Created</th>
                    <th className="py-4 px-6 whitespace-nowrap text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {devices.map((device) => (
                    <tr key={device.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700">
                          {device.type}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm font-medium text-slate-900">
                        {device.name || <span className="text-slate-400 italic">—</span>}
                      </td>
                      <td className="py-4 px-6 text-sm font-mono text-slate-600">
                        {device.componentId || <span className="text-slate-400">—</span>}
                      </td>
                      <td className="py-4 px-6 text-sm font-mono text-slate-400 hidden lg:table-cell">
                        {device.hardwareId || '—'}
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-500 hidden md:table-cell">
                        {new Date(device.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => handleEditClick(device)}
                          className="inline-flex items-center justify-center p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Edit Device"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(device)}
                          className="inline-flex items-center justify-center p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Device"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <VoltageTrendSection assetId={asset.id} />
      <GridStateTrendSection assetId={asset.id} />

      {assetId && (
        <CreateDeviceModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={handleCreateSuccess}
          assetId={assetId}
        />
      )}

      <EditDeviceModal
        isOpen={isEditModalOpen}
        onClose={() => { setIsEditModalOpen(false); setSelectedDeviceForEdit(null); }}
        onSuccess={handleEditSuccess}
        device={selectedDeviceForEdit}
      />

      <DeleteDeviceModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setSelectedDeviceForDelete(null); }}
        onSuccess={handleDeleteSuccess}
        device={selectedDeviceForDelete}
      />
    </div>
  );
}
