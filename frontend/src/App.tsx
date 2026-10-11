import { Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { OverviewPage } from '@/pages/OverviewPage';
import { PlaygroundPage } from '@/pages/PlaygroundPage';
import { DecisionsPage } from '@/pages/DecisionsPage';
import { AttackLabPage } from '@/pages/AttackLabPage';
import { PoliciesPage } from '@/pages/PoliciesPage';
import { AuditPage } from '@/pages/AuditPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="playground" element={<PlaygroundPage />} />
        <Route path="decisions" element={<DecisionsPage />} />
        <Route path="attack-lab" element={<AttackLabPage />} />
        <Route path="policies" element={<PoliciesPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
