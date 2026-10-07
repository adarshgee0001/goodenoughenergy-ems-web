import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Building2, AlertCircle, Loader2, Edit2, Trash2, Search, X } from 'lucide-react';
import { clientService } from '../../features/clients/client.service';
import type { Client } from '../../features/clients/client.types';
import { CreateClientModal } from '../../features/clients/CreateClientModal';
import { EditClientModal } from '../../features/clients/EditClientModal';
import { DeleteClientModal } from '../../features/clients/DeleteClientModal';
import { usePaginationSearch } from '../../hooks/usePaginationSearch';

export default function ClientListPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);

  const {
    page,
    setPage,
    limit,
    search,
    setSearch,
    debouncedSearch,
  } = usePaginationSearch();
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedClientForEdit, setSelectedClientForEdit] = useState<Client | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedClientForDelete, setSelectedClientForDelete] = useState<Client | null>(null);

  const fetchClients = useCallback(async (currentPage: number, currentSearch: string) => {
    setIsLoading(true);
    try {
      const data = await clientService.getClients(currentPage, limit, currentSearch);
      setClients(data.clients);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages);
        setPage(data.pagination.page);
      } else {
        setTotalPages(data.clients.length > 0 ? 1 : 0);
      }
      setError(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred while fetching clients.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [limit, setPage]);

  useEffect(() => {
    fetchClients(page, debouncedSearch);
  }, [fetchClients, page, debouncedSearch]);

  const handleCreateSuccess = () => {
    setIsCreateModalOpen(false);
    setPage(1);
    fetchClients(1, debouncedSearch); // Go back to page 1 to see the newly created client
  };

  const handleEditClick = (client: Client) => {
    setSelectedClientForEdit(client);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    setSelectedClientForEdit(null);
    fetchClients(page, debouncedSearch);
  };

  const handleEditClose = () => {
    setIsEditModalOpen(false);
    setSelectedClientForEdit(null);
  };

  const handleDeleteClick = (client: Client) => {
    setSelectedClientForDelete(client);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteSuccess = () => {
    setIsDeleteModalOpen(false);
    setSelectedClientForDelete(null);
    fetchClients(page, debouncedSearch);
  };

  const handleDeleteClose = () => {
    setIsDeleteModalOpen(false);
    setSelectedClientForDelete(null);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 mt-1">
            Manage registered clients and their EMS access.
          </p>
        </div>
        <button 
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-slate-900 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Client
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-slate-900 placeholder-slate-400"
            placeholder="Search clients by name or identifier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isLoading && clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary-500" />
          <p>Loading clients...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-red-800">Error Loading Clients</h3>
          <p className="text-red-600 mt-2">{error}</p>
        </div>
      ) : clients.length === 0 && search ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">No clients found</h3>
          <p className="text-slate-500 mt-2 max-w-sm mx-auto mb-6">
            We couldn't find any clients matching "{search}".
          </p>
          <button 
            onClick={() => setSearch('')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors"
          >
            Clear Search
          </button>
        </div>
      ) : clients.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">No clients yet.</h3>
          <p className="text-slate-500 mt-2 max-w-sm mx-auto mb-6">
            Create your first client to get started.
          </p>
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-slate-900 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Client
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                  <th className="py-4 px-6 whitespace-nowrap">Client Name</th>
                  <th className="py-4 px-6 whitespace-nowrap">Business Identifier</th>
                  <th className="py-4 px-6 whitespace-nowrap hidden md:table-cell">Client ID</th>
                  <th className="py-4 px-6 whitespace-nowrap">Created</th>
                  <th className="py-4 px-6 whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="py-4 px-6 text-sm font-medium text-slate-900">
                      <Link to={`/admin/clients/${client.id}`} className="hover:text-primary-600 transition-colors">
                        {client.name}
                      </Link>
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-500">
                      {client.businessIdentifier || '-'}
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-400 font-mono hidden md:table-cell">
                      {client.id}
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-500">
                      {new Date(client.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <Link
                        to={`/admin/clients/${client.id}`}
                        className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
                        title="View Client Details"
                      >
                        View Details
                      </Link>
                      <button
                        onClick={() => handleEditClick(client)}
                        className="inline-flex items-center justify-center p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Edit Client"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(client)}
                        className="inline-flex items-center justify-center p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Client"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <span className="text-sm text-slate-500">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1 || isLoading}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages || isLoading}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <CreateClientModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        onSuccess={handleCreateSuccess}
      />

      <EditClientModal
        isOpen={isEditModalOpen}
        onClose={handleEditClose}
        onSuccess={handleEditSuccess}
        client={selectedClientForEdit}
      />

      <DeleteClientModal
        isOpen={isDeleteModalOpen}
        onClose={handleDeleteClose}
        onSuccess={handleDeleteSuccess}
        client={selectedClientForDelete}
      />
    </div>
  );
}
