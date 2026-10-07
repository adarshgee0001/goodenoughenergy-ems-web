import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, MapPin, AlertCircle, Loader2, Eye, Edit2, Trash2 } from 'lucide-react';
import { clientService } from '../../features/clients/client.service';
import { usePreview } from '../../context/PreviewContext';
import type { Client } from '../../features/clients/client.types';
import { siteService } from '../../features/sites/site.service';
import type { Site } from '../../features/sites/site.types';
import { CreateSiteModal } from '../../features/sites/CreateSiteModal';
import { EditSiteModal } from '../../features/sites/EditSiteModal';
import { DeleteSiteModal } from '../../features/sites/DeleteSiteModal';
import { Users, Key } from 'lucide-react';
import { userService } from '../../features/users/user.service';
import type { ClientUser } from '../../features/users/user.types';
import { CreateUserModal } from '../../features/users/CreateUserModal';
import { ResetPasswordModal } from '../../features/users/ResetPasswordModal';
import { usePaginationSearch } from '../../hooks/usePaginationSearch';
import { Search, X } from 'lucide-react';

export default function ClientDetailsPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { startPreview } = usePreview();
  
  const [client, setClient] = useState<Client | null>(null);
  const [isClientLoading, setIsClientLoading] = useState(true);
  const [clientError, setClientError] = useState<string | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [isSitesLoading, setIsSitesLoading] = useState(true);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [siteTotalPages, setSiteTotalPages] = useState(0);
  
  const {
    page: sitePage,
    setPage: setSitePage,
    limit: siteLimit,
    search: siteSearch,
    setSearch: setSiteSearch,
    debouncedSearch: debouncedSiteSearch,
    reset: resetSiteSearch
  } = usePaginationSearch();

  const [isCreateSiteModalOpen, setIsCreateSiteModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [deletingSite, setDeletingSite] = useState<Site | null>(null);

  const [users, setUsers] = useState<ClientUser[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userTotalPages, setUserTotalPages] = useState(0);

  const {
    page: userPage,
    setPage: setUserPage,
    limit: userLimit,
    search: userSearch,
    setSearch: setUserSearch,
    debouncedSearch: debouncedUserSearch,
    reset: resetUserSearch
  } = usePaginationSearch();

  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<ClientUser | null>(null);

  const fetchClientDetails = useCallback(async () => {
    if (!clientId) return;
    setIsClientLoading(true);
    try {
      const data = await clientService.getClient(clientId);
      setClient(data);
      setClientError(null);
    } catch (err) {
      if (err instanceof Error) {
        setClientError(err.message);
      } else {
        setClientError('An unexpected error occurred while fetching client details.');
      }
    } finally {
      setIsClientLoading(false);
    }
  }, [clientId]);

  const fetchSites = useCallback(async (page: number, currentSearch: string) => {
    if (!clientId) return;
    setIsSitesLoading(true);
    try {
      const data = await siteService.getClientSites(clientId, page, siteLimit, currentSearch);
      setSites(data.sites);
      if (data.pagination) {
        setSiteTotalPages(data.pagination.totalPages);
        setSitePage(data.pagination.page);
      } else {
        setSiteTotalPages(data.sites.length > 0 ? 1 : 0);
      }
      setSitesError(null);
    } catch (err) {
      if (err instanceof Error) {
        setSitesError(err.message);
      } else {
        setSitesError('An unexpected error occurred while fetching sites.');
      }
    } finally {
      setIsSitesLoading(false);
    }
  }, [clientId, siteLimit, setSitePage]);

  const fetchUsers = useCallback(async (page: number, currentSearch: string) => {
    if (!clientId) return;
    setIsUsersLoading(true);
    try {
      const data = await userService.getClientUsers(clientId, page, userLimit, currentSearch);
      setUsers(data.users);
      if (data.pagination) {
        setUserTotalPages(data.pagination.totalPages);
        setUserPage(data.pagination.page);
      } else {
        setUserTotalPages(data.users.length > 0 ? 1 : 0);
      }
      setUsersError(null);
    } catch (err) {
      if (err instanceof Error) {
        setUsersError(err.message);
      } else {
        setUsersError('An unexpected error occurred while fetching users.');
      }
    } finally {
      setIsUsersLoading(false);
    }
  }, [clientId, userLimit, setUserPage]);

  useEffect(() => {
    fetchClientDetails();
  }, [fetchClientDetails]);

  useEffect(() => {
    fetchUsers(userPage, debouncedUserSearch);
  }, [fetchUsers, userPage, debouncedUserSearch]);

  useEffect(() => {
    fetchSites(sitePage, debouncedSiteSearch);
  }, [fetchSites, sitePage, debouncedSiteSearch]);

  // Reset search and pagination when switching clients
  useEffect(() => {
    resetSiteSearch();
    resetUserSearch();
  }, [clientId, resetSiteSearch, resetUserSearch]);

  const handleCreateSiteSuccess = () => {
    setIsCreateSiteModalOpen(false);
    setSitePage(1);
    fetchSites(1, debouncedSiteSearch);
  };

  const handleEditSiteSuccess = () => {
    setEditingSite(null);
    fetchSites(sitePage, debouncedSiteSearch);
  };

  const handleDeleteSiteSuccess = () => {
    setDeletingSite(null);
    fetchSites(sitePage, debouncedSiteSearch);
  };

  const handleCreateUserSuccess = () => {
    setIsCreateUserModalOpen(false);
    setUserPage(1);
    fetchUsers(1, debouncedUserSearch);
  };

  const handleResetPasswordSuccess = () => {
    setResetPasswordUser(null);
    fetchUsers(userPage, debouncedUserSearch);
  };

  if (isClientLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary-500" />
        <p>Loading client details...</p>
      </div>
    );
  }

  if (clientError || !client) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/clients" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Client Details</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-red-800">Error Loading Client</h3>
          <p className="text-red-600 mt-2">{clientError || 'Client not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header & Client Summary */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link to="/admin/clients" className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="Back to Clients">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
              <p className="text-slate-500 mt-1">Client Management</p>
            </div>
          </div>
          <button
            onClick={() => {
              startPreview(client.id, client.name);
              navigate('/app');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-medium transition-colors border border-indigo-200"
          >
            <Eye className="w-4 h-4" />
            Preview Dashboard
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 mb-1">Business Identifier</p>
            <p className="text-slate-900 font-medium">{client.businessIdentifier || 'N/A'}</p>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 mb-1">Created</p>
            <p className="text-slate-900">
              {new Date(client.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 mb-1">Client ID</p>
            <p className="text-slate-600 font-mono text-sm">{client.id}</p>
          </div>
        </div>
      </div>

      {/* Sites Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900">Sites</h2>
          <button 
            onClick={() => setIsCreateSiteModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-slate-900 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Site
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
              placeholder="Search sites by name or identifier..."
              value={siteSearch}
              onChange={(e) => setSiteSearch(e.target.value)}
            />
            {siteSearch && (
              <button
                onClick={() => setSiteSearch('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {isSitesLoading && sites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-white border border-slate-200 rounded-xl shadow-sm">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary-500" />
            <p>Loading sites...</p>
          </div>
        ) : sitesError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <p className="text-red-600 font-medium">{sitesError}</p>
          </div>
        ) : sites.length === 0 && siteSearch ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No sites found</h3>
            <p className="text-slate-500 mt-2 max-w-sm mx-auto mb-6">
              We couldn't find any sites matching "{siteSearch}".
            </p>
            <button 
              onClick={() => setSiteSearch('')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors"
            >
              Clear Search
            </button>
          </div>
        ) : sites.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No sites found</h3>
            <p className="text-slate-500 mt-2 max-w-sm mx-auto">
              This client does not have any sites yet. Add a site to get started.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                    <th className="py-4 px-6 whitespace-nowrap">Site Name</th>
                    <th className="py-4 px-6 whitespace-nowrap">Business Identifier</th>
                    <th className="py-4 px-6 whitespace-nowrap hidden md:table-cell">Site ID</th>
                    <th className="py-4 px-6 whitespace-nowrap">Created</th>
                    <th className="py-4 px-6 whitespace-nowrap text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sites.map((site) => (
                    <tr key={site.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="py-4 px-6 text-sm font-medium text-slate-900">
                        <Link to={`/admin/clients/${clientId}/sites/${site.id}`} className="hover:text-primary-600 transition-colors">
                          {site.name}
                        </Link>
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-500">
                        {site.businessIdentifier}
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-400 font-mono hidden md:table-cell">
                        {site.id}
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-500">
                        {new Date(site.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/admin/clients/${clientId}/sites/${site.id}`}
                            className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
                            title="View Site Details"
                          >
                            View Details
                          </Link>
                          <button
                            onClick={() => setEditingSite(site)}
                            className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Edit Site"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingSite(site)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Site"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {siteTotalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  Page {sitePage} of {siteTotalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSitePage(sitePage - 1)}
                    disabled={sitePage <= 1 || isSitesLoading}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setSitePage(sitePage + 1)}
                    disabled={sitePage >= siteTotalPages || isSitesLoading}
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

      {/* Client Users Section */}
      <div className="pt-8 border-t border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900">Client Users</h2>
          <button 
            onClick={() => setIsCreateUserModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-slate-900 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create User
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
              placeholder="Search users by name or email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
            {userSearch && (
              <button
                onClick={() => setUserSearch('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {isUsersLoading && users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-white border border-slate-200 rounded-xl shadow-sm">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-primary-500" />
            <p>Loading users...</p>
          </div>
        ) : usersError ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <p className="text-red-600 font-medium">{usersError}</p>
          </div>
        ) : users.length === 0 && userSearch ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No client users found</h3>
            <p className="text-slate-500 mt-2 max-w-sm mx-auto mb-6">
              We couldn't find any users matching "{userSearch}".
            </p>
            <button 
              onClick={() => setUserSearch('')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors"
            >
              Clear Search
            </button>
          </div>
        ) : users.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No client users found</h3>
            <p className="text-slate-500 mt-2 max-w-sm mx-auto">
              This client does not have any users yet. Create a user to provide them access to their dashboard.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
                    <th className="py-4 px-6 whitespace-nowrap">Name</th>
                    <th className="py-4 px-6 whitespace-nowrap">Email</th>
                    <th className="py-4 px-6 whitespace-nowrap">Role</th>
                    <th className="py-4 px-6 whitespace-nowrap">Status</th>
                    <th className="py-4 px-6 whitespace-nowrap text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="py-4 px-6 text-sm font-medium text-slate-900">
                        {user.name}
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-500">
                        {user.email}
                      </td>
                      <td className="py-4 px-6 text-sm text-slate-500">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {user.role}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-sm">
                        {user.forcePasswordChange ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Password Change Required
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => setResetPasswordUser(user)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Reset Password"
                        >
                          <Key className="w-3.5 h-3.5" />
                          Reset Password
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {userTotalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  Page {userPage} of {userTotalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setUserPage(userPage - 1)}
                    disabled={userPage <= 1 || isUsersLoading}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setUserPage(userPage + 1)}
                    disabled={userPage >= userTotalPages || isUsersLoading}
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

      {clientId && (
        <CreateSiteModal
          isOpen={isCreateSiteModalOpen}
          onClose={() => setIsCreateSiteModalOpen(false)}
          onSuccess={handleCreateSiteSuccess}
          clientId={clientId}
        />
      )}

      <EditSiteModal
        isOpen={!!editingSite}
        onClose={() => setEditingSite(null)}
        onSuccess={handleEditSiteSuccess}
        site={editingSite}
      />

      <DeleteSiteModal
        isOpen={!!deletingSite}
        onClose={() => setDeletingSite(null)}
        onSuccess={handleDeleteSiteSuccess}
        site={deletingSite}
      />
      
      {clientId && (
        <CreateUserModal
          isOpen={isCreateUserModalOpen}
          onClose={() => setIsCreateUserModalOpen(false)}
          onSuccess={handleCreateUserSuccess}
          clientId={clientId}
        />
      )}

      <ResetPasswordModal
        isOpen={!!resetPasswordUser}
        onClose={() => setResetPasswordUser(null)}
        onSuccess={handleResetPasswordSuccess}
        user={resetPasswordUser}
      />
    </div>
  );
}
