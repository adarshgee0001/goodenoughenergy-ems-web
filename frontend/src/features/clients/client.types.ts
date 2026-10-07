export interface Client {
  id: string;
  name: string;
  businessIdentifier?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedClients {
  clients: Client[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
