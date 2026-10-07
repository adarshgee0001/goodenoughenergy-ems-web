export interface NavigationItem {
  name: string;
  href: string;
}

export const mainNavigation: NavigationItem[] = [
  { name: 'Products', href: '/products' },
  { name: 'EMS', href: '/ems' },
  { name: 'Solutions', href: '/solutions' },
  { name: 'About', href: '/about' },
  { name: 'Resources', href: '/resources' },
  { name: 'Contact', href: '/contact' },
];

export const footerNavigation = {
  company: [
    { name: 'About', href: '/about' },
    { name: 'Careers', href: '/about#careers' },
    { name: 'News', href: '/resources#news' },
    { name: 'Contact', href: '/contact' },
  ],
  products: [
    { name: 'StorEDGE 0.25', href: '/products/storedge-025' },
    { name: 'StorEDGE 5.0', href: '/products/storedge-50' },
    { name: 'All Products', href: '/products' },
  ],
  solutions: [
    { name: 'EMS', href: '/ems' },
    { name: 'Peak Shaving', href: '/solutions' },
    { name: 'Energy Arbitrage', href: '/solutions' },
  ],
  resources: [
    { name: 'Documentation', href: '/resources' },
    { name: 'Case Studies', href: '/resources' },
    { name: 'Support', href: '/contact' },
  ],
};
