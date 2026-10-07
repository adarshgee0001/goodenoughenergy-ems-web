import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Battery, AlertCircle, Loader2, Edit2, Trash2 } from 'lucide-react';
import { siteService } from '../../features/sites/site.service';
import type { Site } from '../../features/sites/site.types';
import { bessService } from '../../features/bess/bess.service';
import type { BessAsset } from '../../features/bess/bess.types';
import { CreateBessModal } from '../../features/bess/CreateBessModal';
import { EditBessModal } from '../../features/bess/EditBessModal';
import { DeleteBessModal } from '../../features/bess/DeleteBessModal';
import { usePaginationSearch } from '../../hooks/usePaginationSearch';
import { Search, X } from 'lucide-react';

export default function SiteDetailsPage() {
  const { clientId, siteId } = useParams<{ clientId: string; siteId: string }>();
  
  const [site, setSite] = useState<Site | null>(null);
  const [isSiteLoading, setIsSiteLoading] = useState(true);
  const [siteError, setSiteError] = useState<string | null>(null);

  const [assets, setAssets] = useState<BessAsset[]>([]);
  const [isAssetsLoading, setIsAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assetTotalPages, setAssetTotalPages] = useState(0);

  const {
    page: assetPage,
    setPage: setAssetPage,
    limit: assetLimit,
    search: assetSearch,
    setSearch: setAssetSearch,
    debouncedSearch: debouncedAssetSearch,
    reset: resetAssetSearch
  } = usePaginationSearch();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedAssetForEdit, setSelectedAssetForEdit] = useState<BessAsset | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedAssetForDelete, setSelectedAssetForDelete] = useState<BessAsset | null>(null);

  const fetchSiteDetails = useCallback(async () => {
    if (!siteId) return;
    setIsSiteLoading(true);
    try {
      const data = await siteService.getSite(siteId);
      setSite(data);
      setSiteError(null);
    } catch (err) {
      if (err instanceof Error) {
        setSiteError(err.message);
      } else {
        setSiteError('An unexpected error occurred while fetching site details.');
      }
    } finally {
      setIsSiteLoading(false);
    }
  }, [siteId]);

  const fetchAssets = useCallback(async (page: number, currentSearch: string) => {
    if (!siteId) return;
    setIsAssetsLoading(true);
    try {
      const data = await bessService.getSiteBess(siteId, page, assetLimit, currentSearch);
      setAssets(data.assets);
      if (data.pagination) {
        setAssetTotalPages(data.pagination.totalPages);
        setAssetPage(data.pagination.page);
      } else {
        setAssetTotalPages(data.assets.length > 0 ? 1 : 0);
      }
      setAssetsError(null);
    } catch (err) {
      if (err instanceof Error) {
        setAssetsError(err.message);
      } else {
        setAssetsError('An unexpected error occurred while fetching BESS assets.');
      }
    } finally {
      setIsAssetsLoading(false);
    }
  }, [siteId, assetLimit, setAssetPage]);

  useEffect(() => {
    fetchSiteDetails();
  }, [fetchSiteDetails]);

  useEffect(() => {
    fetchAssets(assetPage, debouncedAssetSearch);
  }, [fetchAssets, assetPage, debouncedAssetSearch]);

  // Reset search and pagination when switching sites
  useEffect(() => {
    resetAssetSearch();
  }, [siteId, resetAssetSearch]);

  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false);
    setAssetPage(1);
    fetchAssets(1, debouncedAssetSearch);
  };

  const handleEditClick = (asset: BessAsset) => {
    setSelectedAssetForEdit(asset);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    setSelectedAssetForEdit(null);
    fetchAssets(assetPage, debouncedAssetSearch);
  };

  const handleDeleteClick = (asset: BessAsset) => {
    setSelectedAssetForDelete(asset);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteSuccess = () => {
    setIsDeleteModalOpen(false);
    setSelectedAssetForDelete(null);
    fetchAssets(assetPage, debouncedAssetSearch);
  };

  if (isSiteLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary-500" />
        <p>Loading site details...</p>
      </div>
    );
  }

  if (siteError || !site) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link to={`/admin/clients/${clientId}`} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Site Details</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-red-800">Error Loading Site</h3>
          <p className="text-red-600 mt-2">{siteError || 'Site not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header & Site Summary */}
      <div>
        <div className="flex items-center gap-4 mb-6">
          <Link to={`/admin/clients/${clientId}`} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="Back to Client">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{site.name}</h1>
            <p className="text-slate-500 mt-1">Site Management</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 mb-1">Business Identifier</p>
            <p className="text-slate-900 font-medium">{site.businessIdentifier || 'N/A'}</p>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 mb-1">Timezone</p>
            <p className="text-slate-900">{site.timezone || 'Not specified'}</p>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 mb-1">Site ID</p>
            <p className="text-slate-600 font-mono text-sm">{site.id}</p>
          </div>
        </div>
      </div>

      {/* BESS Assets Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900">BESS Assets</h2>
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-slate-900 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add BESS
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-slate-900 placeholder-slate-400"
              placeholder="Search BESS assets by name or identifier..."
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
            />
            {assetSearch && (
              <button
                onClick={() => setAssetSearch('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {isAssetsLoading && assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-white border border-slate-200 rounded-xl shadow-sm">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary-500" />
            <p>Loading assets...</p>
          </div>
        ) : assetsError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <p className="text-red-600 font-medium">{assetsError}</p>
          </div>
        ) : assets.length === 0 && assetSearch ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No BESS assets found</h3>
            <p className="text-slate-500 mt-2 max-w-sm mx-auto mb-6">
              We couldn't find any BESS assets matching "{assetSearch}".
            </p>
            <button 
              onClick={() => setAssetSearch('')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors"
            >
              Clear Search
            </button>
          </div>
        ) : assets.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Battery className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No BESS assets found</h3>
            <p className="text-slate-500 mt-2 max-w-sm mx-auto">
              This site does not have any BESS assets yet.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                    <th className="py-4 px-6 whitespace-nowrap">Asset Name</th>
                    <th className="py-4 px-6 whitespace-nowrap">Asset Identifier</th>
                    <th className="py-4 px-6 whitespace-nowrap hidden lg:table-cell">EMU ID</th>
                    <th className="py-4 px-6 whitespace-nowrap hidden xl:table-cell">MQTT Topic</th>
                    <th className="py-4 px-6 whitespace-nowrap hidden md:table-cell">Asset ID</th>
                    <th className="py-4 px-6 whitespace-nowrap text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assets.map((asset) => (
                    <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-6 text-sm font-medium text-slate-900">
                        <Link to={`/admin/clients/${clientId}/sites/${siteId}/bess/${asset.id}`} className="hover:text-primary-600 transition-colors">
                          {asset.name}
                        </Link>
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-500">
                        {asset.assetIdentifier}
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-500 hidden lg:table-cell">
                        {asset.emuId || '--'}
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-500 hidden xl:table-cell max-w-[200px] truncate" title={asset.mqttTopic || ''}>
                        {asset.mqttTopic || '--'}
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-400 font-mono hidden md:table-cell">
                        {asset.id}
                      </td>
                      <td className="py-4 px-6 text-right space-x-2">
                        <Link
                          to={`/admin/clients/${clientId}/sites/${siteId}/bess/${asset.id}`}
                          className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors mr-1"
                          title="View Devices"
                        >
                          View Devices
                        </Link>
                        <button
                          onClick={() => handleEditClick(asset)}
                          className="inline-flex items-center justify-center p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Edit Asset"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(asset)}
                          className="inline-flex items-center justify-center p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Asset"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {assetTotalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  Page {assetPage} of {assetTotalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAssetPage(assetPage - 1)}
                    disabled={assetPage <= 1 || isAssetsLoading}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setAssetPage(assetPage + 1)}
                    disabled={assetPage >= assetTotalPages || isAssetsLoading}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {siteId && (
        <CreateBessModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={handleCreateSuccess}
          siteId={siteId}
        />
      )}

      <EditBessModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={handleEditSuccess}
        asset={selectedAssetForEdit}
      />

      <DeleteBessModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onSuccess={handleDeleteSuccess}
        asset={selectedAssetForDelete}
      />
    </div>
  );
}
