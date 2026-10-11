import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SidebarContent } from './Sidebar';
import { TopBar } from './TopBar';
import { SettingsModal } from './SettingsModal';
import { Modal } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/context/AppStore';
import { useToast } from '@/context/ToastContext';
import { useEffect } from 'react';

export function AppShell() {
  const [mobileNav, setMobileNav] = useState(false);
  const [settings, setSettings] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const { resetDemo } = useAppStore();
  const { notify } = useToast();
  const location = useLocation();

  useEffect(() => {
    setMobileNav(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const doReset = () => {
    resetDemo();
    setConfirmReset(false);
    notify({ tone: 'success', title: 'Demo reset', description: 'Policies restored and the labelled seed dataset recreated.' });
  };

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-line bg-surface/60 lg:block">
        <SidebarContent onReset={() => setConfirmReset(true)} />
      </aside>

      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNav(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-64 animate-fade-in border-r border-line bg-surface" aria-label="Navigation">
            <SidebarContent onNavigate={() => setMobileNav(false)} onReset={() => setConfirmReset(true)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <TopBar onMenu={() => setMobileNav(true)} onSettings={() => setSettings(true)} />
        <main id="main" className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>

      <SettingsModal open={settings} onClose={() => setSettings(false)} />
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo?"
        subtitle="Use this before presenting."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={doReset}>
              Reset demo
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          This clears every locally stored evaluation, review and execution, restores default policies, and recreates the three labelled seed records. Backend data is not affected.
        </p>
      </Modal>
    </div>
  );
}
