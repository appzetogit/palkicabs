import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Car, 
  UserCheck, 
  Clock, 
  IndianRupee, 
  Wallet, 
  CreditCard, 
  FileText, 
  TrendingUp,
  ChevronRight,
  Monitor
} from 'lucide-react';
import { motion } from 'framer-motion';
import AdminPageHeader from '../../components/ui/AdminPageHeader';
import { adminService } from '../../services/adminService';

const StatCard = ({ icon: Icon, label, value, color, onViewAll }) => (
  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 ${color.bg} ${color.text} rounded-lg flex items-center justify-center`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-[11px] font-bold text-gray-500">{label}</p>
        <p className="text-xl font-black text-gray-900 mt-0.5">{value}</p>
      </div>
    </div>
    <button 
      onClick={onViewAll}
      className="text-[10px] font-bold text-yellow-600 hover:underline"
    >
      View All
    </button>
  </div>
);

const FinanceCard = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
    <div>
      <p className="text-[11px] font-bold text-gray-500">{label}</p>
      <p className="text-lg font-black text-gray-900 mt-0.5">₹ {value}</p>
    </div>
    <div className={`w-8 h-8 ${color.bg} ${color.text} rounded-lg flex items-center justify-center`}>
      <Icon size={16} />
    </div>
  </div>
);

const OwnerDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setIsLoading(true);
        const response = await adminService.getOwnerDashboard();
        setData(response?.data?.data || response?.data || null);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Could not load the dashboard');
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-10 h-10 border-4 border-gray-100 border-t-yellow-400 rounded-full animate-spin"></div>
        <p className="text-sm font-bold text-gray-500">Fetching Owner Insights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-red-100 bg-red-50 p-6 text-center">
        <p className="text-sm font-bold text-red-600">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-3 rounded-lg bg-red-100 px-4 py-1.5 text-xs font-bold text-red-700 hover:bg-red-200">Retry</button>
      </div>
    );
  }

  const monthly = data?.monthly_earnings || [];
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.earnings));

  const stats = [
    { icon: Users, label: 'Registered Owners', value: data?.total_owners || 0, color: { bg: 'bg-emerald-50', text: 'text-emerald-500' }, path: '/admin/owners' },
    { icon: UserCheck, label: 'Approved Owners', value: data?.approved_owners || 0, color: { bg: 'bg-emerald-50', text: 'text-emerald-500' }, path: '/admin/owners' },
    { icon: Clock, label: 'Owner Awaiting Review', value: data?.pending_owners || 0, color: { bg: 'bg-red-50', text: 'text-red-500' }, path: '/admin/owners' },
    { icon: Car, label: 'Registered Fleets', value: data?.total_fleets || 0, color: { bg: 'bg-emerald-50', text: 'text-emerald-500' }, path: '/admin/fleet/manage' },
    { icon: Monitor, label: 'Approved Fleets', value: data?.approved_fleets || 0, color: { bg: 'bg-emerald-50', text: 'text-emerald-500' }, path: '/admin/fleet/manage' },
    { icon: Car, label: 'Fleets Awaiting Review', value: data?.pending_fleets || 0, color: { bg: 'bg-red-50', text: 'text-red-500' }, path: '/admin/fleet/manage' },
    { icon: Monitor, label: 'Registered Drivers', value: data?.total_drivers || 0, color: { bg: 'bg-emerald-50', text: 'text-emerald-500' }, path: '/admin/drivers' },
    { icon: UserCheck, label: 'Approved Drivers', value: data?.approved_drivers || 0, color: { bg: 'bg-emerald-50', text: 'text-emerald-500' }, path: '/admin/drivers' },
    { icon: Clock, label: 'Drivers Awaiting Review', value: data?.pending_drivers || 0, color: { bg: 'bg-red-50', text: 'text-red-500' }, path: '/admin/drivers/pending' },
  ];

  const finances = [
    { icon: FileText, label: 'Today Earnings', value: data?.today_earnings || 0, color: { bg: 'bg-sky-50', text: 'text-sky-500' } },
    { icon: Monitor, label: 'By Cash', value: data?.today_cash || 0, color: { bg: 'bg-emerald-50', text: 'text-emerald-500' } },
    { icon: Wallet, label: 'By Wallet', value: data?.today_wallet || 0, color: { bg: 'bg-amber-50', text: 'text-amber-500' } },
    { icon: CreditCard, label: 'By Card/Online', value: data?.today_online || 0, color: { bg: 'bg-red-50', text: 'text-red-500' } },
    { icon: FileText, label: 'Admin Commission', value: data?.admin_commission || 0, color: { bg: 'bg-slate-50', text: 'text-slate-500' } },
    { icon: Monitor, label: 'Drivers Earnings', value: data?.driver_earnings || 0, color: { bg: 'bg-gray-50', text: 'text-gray-500' } },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="px-4 py-2 lg:px-6 lg:py-2">
        <AdminPageHeader module="Owner Management" page="Owner Dashboard" title="Owner Dashboard" />

        {/* Stats Grid */}
        <div className="space-y-4 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.map((stat, i) => (
              <StatCard 
                key={i} 
                {...stat} 
                onViewAll={() => navigate(stat.path)}
              />
            ))}
          </div>

          {/* Charts & Finance Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Today trips */}
            <div className="lg:col-span-1 bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col">
               <p className="text-sm font-bold text-gray-900 mb-6">Today Trips</p>
               <div className="flex-1 flex flex-col items-center justify-center relative min-h-[200px]">
                  <div className="w-32 h-32 border-[8px] border-yellow-100 rounded-full flex flex-col items-center justify-center">
                     <p className="text-2xl font-black text-gray-900">{data?.today_trips?.total || 0}</p>
                     <p className="text-[10px] font-bold text-gray-400">Total Rides</p>
                  </div>
                  <div className="mt-6 w-full space-y-2">
                     {[['Completed', data?.today_trips?.completed, 'bg-green-500'], ['Ongoing', data?.today_trips?.ongoing, 'bg-sky-500'], ['Cancelled', data?.today_trips?.cancelled, 'bg-red-500']].map(([label, n, dot]) => (
                       <div key={label} className="flex items-center justify-between px-4">
                          <div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${dot}`}></div><span className="text-xs font-bold text-gray-500">{label}</span></div>
                          <span className="text-xs font-black text-gray-900">{n || 0}</span>
                       </div>
                     ))}
                  </div>
               </div>
            </div>

            {/* Finance Stats */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
               {finances.map((fin, i) => (
                 <FinanceCard key={i} {...fin} />
               ))}
            </div>
          </div>

          {/* Bottom row: Earnings Overview & Overall Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
             {/* More Finance Grid */}
             <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <FinanceCard icon={TrendingUp} label="Overall Earnings" value={data?.overall_earnings || 0} color={{ bg: 'bg-red-50', text: 'text-red-500' }} />
                <FinanceCard icon={Monitor} label="By Cash" value={data?.overall_cash || 0} color={{ bg: 'bg-amber-50', text: 'text-amber-500' }} />
                <FinanceCard icon={Wallet} label="By Wallet" value={data?.overall_wallet || 0} color={{ bg: 'bg-emerald-50', text: 'text-emerald-500' }} />
                <FinanceCard icon={CreditCard} label="By Card/Online" value={data?.overall_online || 0} color={{ bg: 'bg-sky-50', text: 'text-sky-500' }} />
                <FinanceCard icon={FileText} label="Admin Commission" value={data?.overall_admin_comm || 0} color={{ bg: 'bg-gray-50', text: 'text-gray-500' }} />
                <FinanceCard icon={FileText} label="Owner Earnings" value={data?.overall_owner_earnings || 0} color={{ bg: 'bg-slate-50', text: 'text-slate-500' }} />
             </div>

             {/* Monthly earnings */}
             <div className="lg:col-span-1 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <p className="text-sm font-bold text-gray-900 mb-4">Earnings (last 6 months)</p>
                {monthly.length === 0 ? (
                  <p className="py-10 text-center text-xs font-semibold text-gray-400">No completed rides yet</p>
                ) : (
                  <div className="flex h-40 items-end justify-between gap-2 border-b-2 border-gray-100">
                    {monthly.map((m) => (
                      <div key={m.month} className="flex flex-1 flex-col items-center justify-end" title={`₹ ${m.earnings}`}>
                        <span className="mb-1 text-[9px] font-bold text-gray-500">₹{m.earnings}</span>
                        <div className="w-full rounded-t bg-emerald-500" style={{ height: `${Math.max(4, (m.earnings / maxMonthly) * 100)}%` }} />
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex justify-between gap-2">
                  {monthly.map((m) => <span key={m.month} className="flex-1 text-center text-[10px] font-bold text-gray-400">{m.month.slice(5)}/{m.month.slice(2, 4)}</span>)}
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OwnerDashboard;

