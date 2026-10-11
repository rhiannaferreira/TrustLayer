import { LayoutDashboard, Bot, Activity, Swords, ScrollText, FileClock, Network, FlaskConical, Globe, ShieldCheck, Inbox, KeyRound, SlidersHorizontal, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard, description: 'AI agents propose. TrustLayer decides.' },
  { to: '/workspace', label: 'Agent Workspace', icon: Bot, description: 'Give an agent any task' },
  { to: '/reviews', label: 'Review Queue', icon: Inbox, description: 'Approve or reject held actions' },
  { to: '/agents', label: 'Agents & API', icon: KeyRound, description: 'Keys, permissions and limits' },
  { to: '/trust-gate', label: 'Scenario Tester', icon: ShieldCheck, description: 'Edit a proposal and test the gate' },
  { to: '/overview', label: 'Shopping Overview', icon: LayoutDashboard, description: 'Original purchasing demo' },
  { to: '/rules', label: 'Your Rules', icon: SlidersHorizontal, description: 'Rules for your purchasing agent' },
  { to: '/playground', label: 'Agent Playground', icon: Bot, description: 'Run an agent end to end' },
  { to: '/research', label: 'Web Research', icon: Globe, description: 'Search the web for any topic' },
  { to: '/decisions', label: 'Live Decisions', icon: Activity, description: 'Every evaluated action' },
  { to: '/investigate', label: 'Investigation', icon: Network, description: 'Decision pipeline & replay' },
  { to: '/attack-lab', label: 'Attack Lab', icon: Swords, description: 'Adversarial testing' },
  { to: '/test-console', label: 'Test Console', icon: FlaskConical, description: 'Run the checks against the backend' },
  { to: '/policies', label: 'Policies', icon: ScrollText, description: 'Rules and thresholds' },
  { to: '/audit', label: 'Audit Trail', icon: FileClock, description: 'Decision history' },
];
