import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { OverviewPage } from '@/pages/OverviewPage';
import { PlaygroundPage } from '@/pages/PlaygroundPage';
import { DecisionsPage } from '@/pages/DecisionsPage';
import { AttackLabPage } from '@/pages/AttackLabPage';
import { PoliciesPage } from '@/pages/PoliciesPage';
import { AuditPage } from '@/pages/AuditPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { InvestigatePage } from '@/pages/InvestigatePage';
import { DemoPage } from '@/pages/DemoPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="demo" element={<DemoPage />} />
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="playground" element={<PlaygroundPage />} />
        <Route path="decisions" element={<DecisionsPage />} />
        <Route path="investigate" element={<InvestigatePage />} />
        <Route path="attack-lab" element={<AttackLabPage />} />
        <Route path="policies" element={<PoliciesPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
