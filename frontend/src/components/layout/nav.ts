import { LayoutDashboard, Bot, Activity, Swords, ScrollText, FileClock, Network, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, description: 'Command center' },
  { to: '/playground', label: 'Agent Playground', icon: Bot, description: 'Run an agent end to end' },
  { to: '/decisions', label: 'Live Decisions', icon: Activity, description: 'Every evaluated action' },
  { to: '/investigate', label: 'Investigation', icon: Network, description: 'Decision pipeline & replay' },
  { to: '/attack-lab', label: 'Attack Lab', icon: Swords, description: 'Adversarial testing' },
  { to: '/policies', label: 'Policies', icon: ScrollText, description: 'Rules and thresholds' },
  { to: '/audit', label: 'Audit Trail', icon: FileClock, description: 'Decision history' },
];
