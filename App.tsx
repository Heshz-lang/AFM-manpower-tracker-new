import { useState, useCallback } from 'react';
import { LayoutDashboard, Grid3x3, BarChart3, History, Wrench, Settings, FileText, Shield, User } from 'lucide-react';
import StatusBoard from '@/views/StatusBoard';
import GraphicalDashboard from '@/views/GraphicalDashboard';
import HistoricalAnalytics from '@/views/HistoricalAnalytics';
import JobTracker from '@/views/JobTracker';
import JobRegistration from '@/views/JobRegistration';
import AdminPanel from '@/views/AdminPanel';
import AllocationForm from '@/views/AllocationForm';

export type Role = 'admin' | 'user';

type ViewId = 'status' | 'allocate' | 'charts' | 'history' | 'register-job' | 'job-tracker' | 'admin';

interface NavItem {
  id: ViewId;
  label: string;
  icon: typeof LayoutDashboard;
  group: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'status', label: 'Status Board', icon: Grid3x3, group: 'Dashboard' },
  { id: 'charts', label: 'Graphical Dashboard', icon: BarChart3, group: 'Dashboard' },
  { id: 'allocate', label: 'Daily Allocation', icon: FileText, group: 'Operations' },
  { id: 'register-job', label: 'Job Registration', icon: Wrench, group: 'Operations' },
  { id: 'job-tracker', label: 'Production Tracker', icon: LayoutDashboard, group: 'Operations' },
  { id: 'history', label: 'Historical Analytics', icon: History, group: 'Reports' },
  { id: 'admin', label: 'Admin Panel', icon: Settings, group: 'System' },
];

export default function App() {
  const [view, setView] = useState<ViewId>('status');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [role, setRole] = useState<Role>('user');

  const isAdmin = role === 'admin';

  const navItems = NAV_ITEMS.filter((item) => item.id !== 'admin' || isAdmin);

  const groupedNav = navItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-slate-900 text-slate-100 flex flex-col z-40 transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-teal-500 flex items-center justify-center flex-shrink-0">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold truncate">Manpower Tracker</h1>
              <p className="text-xs text-slate-400">Engineering Section</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {Object.entries(groupedNav).map(([group, items]) => (
            <div key={group}>
              <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {group}
              </p>
              <div className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setView(item.id);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        active
                          ? 'bg-teal-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-4.5 h-4.5 flex-shrink-0" size={18} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setRole('user')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                role === 'user' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              User
            </button>
            <button
              onClick={() => setRole('admin')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                role === 'admin' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Admin
            </button>
          </div>
          <p className="text-xs text-slate-500">Daily Manpower & Production Management</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-20 bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-lg hover:bg-slate-800"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-semibold">Manpower Tracker</span>
          <div className="w-10" />
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1600px] w-full mx-auto">
          {view === 'status' && <StatusBoard />}
          {view === 'allocate' && <AllocationForm role={role} />}
          {view === 'charts' && <GraphicalDashboard />}
          {view === 'history' && <HistoricalAnalytics />}
          {view === 'register-job' && <JobRegistration />}
          {view === 'job-tracker' && <JobTracker />}
          {view === 'admin' && <AdminPanel />}
        </main>
      </div>
    </div>
  );
}
