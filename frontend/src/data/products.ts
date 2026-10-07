export interface Product {
  id: string;
  name: string;
  capacity: string;
  power: string;
  description: string;
  useCases: string[];
  route: string;
  image?: string;
  imageAlt?: string;
  badge?: string;
}

export const products: Product[] = [
  {
    id: 'storedge-025',
    name: 'StorEDGE 0.25',
    capacity: '250 kWh',
    power: '125 kVA / kW',
    description: 'Designed for commercial and industrial applications. Provides reliable backup and peak shaving capabilities.',
    useCases: [
      'Commercial & Industrial',
      'Peak Shaving',
      'Energy Arbitrage',
      'Backup',
      'Renewable Integration'
    ],
    route: '/products/storedge-025',
    image: '/images/products/storedge_025.webp',
    imageAlt: 'StorEDGE 0.25 Battery Storage Unit',
    badge: 'Popular',
  },
  {
    id: 'storedge-50',
    name: 'StorEDGE 5.0',
    capacity: '5.0 MWh',
    power: '2.5 MVA / MW', // Assuming a standard C-rate similar to 0.25 for placeholder
    description: 'Designed for larger-scale energy applications. Delivers utility-grade reliability and intelligent energy dispatch.',
    useCases: [
      'Utility Scale',
      'Grid Support',
      'Large C&I',
      'Microgrids'
    ],
    route: '/products/storedge-50',
    image: '/images/products/storedge_5.0.webp',
    imageAlt: 'StorEDGE 5.0 Battery Storage Unit',
    badge: 'New',
  }
];
