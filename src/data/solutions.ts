export interface Solution {
  id: string;
  title: string;
  problem: string;
  approach: string;
  benefit: string;
}

export const solutions: Solution[] = [
  {
    id: 'peak-shaving',
    title: 'Peak Shaving',
    problem: 'Utility demand charges are calculated based on the highest 15-minute interval of energy consumption during a billing cycle, often accounting for over 50% of an industrial energy bill.',
    approach: 'Our EMS continuously monitors site load and grid tariffs. When it anticipates a demand peak, it automatically discharges the BESS to cap the grid draw below the expensive threshold.',
    benefit: 'Drastically reduces monthly demand charges without requiring operational changes or downtime.'
  },
  {
    id: 'energy-arbitrage',
    title: 'Energy Arbitrage',
    problem: 'Grid energy prices fluctuate significantly based on time-of-use (TOU) tariffs, being cheap at night and highly expensive during peak afternoon/evening hours.',
    approach: 'The EMS algorithmically charges the StorEDGE BESS during low-cost off-peak hours and discharges the stored energy to power the site during expensive peak periods.',
    benefit: 'Maximizes financial savings by shifting energy consumption to the lowest-cost periods.'
  },
  {
    id: 'renewable-integration',
    title: 'Renewable Integration',
    problem: 'Solar PV generation is intermittent and peaks at midday, often not aligning with the site\'s actual load profile, leading to wasted energy or unstable grid export.',
    approach: 'The EMS dynamically absorbs excess solar generation into the BESS, smoothing the output and storing it for use when solar generation drops or load increases.',
    benefit: 'Maximizes solar self-consumption, prevents grid export limits, and stabilizes site energy.'
  },
  {
    id: 'backup-power',
    title: 'Backup Power',
    problem: 'Grid outages and voltage sags can cause critical equipment failure, production downtime, and significant financial losses.',
    approach: 'Upon detecting a grid anomaly, the EMS seamlessly islands the site, directing the BESS to provide immediate, stable backup power to critical loads.',
    benefit: 'Ensures business continuity and protects sensitive industrial equipment from grid instability.'
  },
  {
    id: 'grid-support',
    title: 'Grid Support',
    problem: 'Grid operators struggle to maintain frequency and voltage stability during high demand, sometimes resulting in brownouts or penalties for unstable sites.',
    approach: 'The EMS can respond to utility signals to provide grid services (like frequency regulation) by rapidly injecting or absorbing power using the BESS.',
    benefit: 'Creates potential new revenue streams through grid service participation and ensures compliance.'
  },
  {
    id: 'demand-optimization',
    title: 'Demand Optimization',
    problem: 'Uncoordinated heavy machinery start-ups create massive simultaneous power draws that stress infrastructure and trigger demand penalties.',
    approach: 'The EMS orchestrates both the BESS discharge and the sequencing of controllable loads to flatten the overall site consumption profile.',
    benefit: 'Reduces peak loads and extends the lifespan of site electrical infrastructure.'
  }
];
