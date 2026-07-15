import React from 'react';
import {
  Clock,
  LogOut,
  Settings,
  Users,
  LayoutDashboard,
  Plus,
  ChevronDown,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

const mockLiveShifts = [
  { id: 1, name: "CoolOfficer", avatar: "CO", role: "Patrol", time: "02:14:30", type: "Active Duty" },
  { id: 2, name: "Alpha_Mike", avatar: "AM", role: "Supervisor", time: "04:30:11", type: "Supervisory" },
  { id: 3, name: "DutySergeant", avatar: "DS", role: "Command", time: "01:05:45", type: "Command" },
];

const mockWeeklyRoster = [
  { id: 1, name: "CoolOfficer", avatar: "CO", role: "Patrol", hours: 14.5, quota: 15, status: "warn" },
  { id: 2, name: "Alpha_Mike", avatar: "AM", role: "Supervisor", hours: 22.0, quota: 20, status: "good" },
  { id: 3, name: "DutySergeant", avatar: "DS", role: "Command", hours: 10.5, quota: 10, status: "good" },
  { id: 4, name: "BravoTwo", avatar: "BT", role: "Patrol", hours: 8.0, quota: 15, status: "bad" },
  { id: 5, name: "Charlie_99", avatar: "C9", role: "Patrol", hours: 15.0, quota: 15, status: "good" },
  { id: 6, name: "DeltaActual", avatar: "DA", role: "Command", hours: 5.0, quota: 10, status: "bad" },
  { id: 7, name: "Echo_Unit", avatar: "EU", role: "Patrol", hours: 12.5, quota: 15, status: "warn" },
];

export const CleanBold = () => {
  return (
    <div className="min-h-screen bg-[#0f1117] text-[#e7e5df] font-sans flex selection:bg-blue-500/30">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[#1e2330] bg-[#12151c] flex flex-col shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-[#1e2330]">
          <div className="flex items-center gap-3 text-white">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold tracking-tight text-lg">Shiftus</span>
          </div>
        </div>
        
        <div className="flex-1 py-6 px-4 flex flex-col gap-1">
          <div className="text-xs font-medium text-[#8b93a3] uppercase tracking-wider mb-2 px-2">Overview</div>
          <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" active />
          <NavItem icon={<Users size={18} />} label="Admin" />
          <NavItem icon={<Settings size={18} />} label="Shift Types" />
        </div>

        <div className="p-4 border-t border-[#1e2330]">
          <button className="flex items-center gap-3 text-[#8b93a3] hover:text-[#e7e5df] transition-colors w-full px-2 py-2 rounded-md hover:bg-[#1e2330]/50">
            <LogOut size={18} />
            <span className="font-medium text-sm">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-[#1e2330] bg-[#0f1117]/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <h2 className="text-base font-semibold text-white">Admin Overview</h2>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
              AD
            </div>
            <span className="text-sm font-medium text-[#e7e5df]">AdminUser</span>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-8 space-y-8">
          
          {/* Live Now Hero Strip */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#5fae7a] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#5fae7a]"></span>
              </div>
              <h2 className="text-xl font-semibold text-white tracking-tight">Live Now</h2>
              <span className="text-[#8b93a3] text-sm ml-2">{mockLiveShifts.length} members on duty</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {mockLiveShifts.map((shift) => (
                <div key={shift.id} className="relative group bg-[#161a22] border border-[#1e2330] hover:border-blue-500/30 rounded-xl p-5 shadow-sm transition-all hover:shadow-blue-500/5 overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/80"></div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#212633] flex items-center justify-center text-[#e7e5df] font-medium border border-[#2d3342]">
                        {shift.avatar}
                      </div>
                      <div>
                        <div className="font-medium text-[#e7e5df]">{shift.name}</div>
                        <div className="text-xs text-[#8b93a3]">{shift.role}</div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 text-xs font-medium border border-blue-500/20">
                      {shift.type}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#1e2330]">
                    <div className="text-2xl font-mono text-white tracking-tight">{shift.time}</div>
                    <button className="text-sm font-medium text-blue-400 hover:text-blue-300">View logs</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 pb-8">
            
            {/* Weekly Roster Table (Left, Wider) */}
            <section className="xl:col-span-2 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-blue-500 rounded-sm"></div>
                  <h2 className="text-lg font-semibold text-white">Weekly Roster</h2>
                </div>
                <button className="text-sm text-[#8b93a3] hover:text-white flex items-center gap-1 transition-colors">
                  View all <ChevronDown size={14} className="-rotate-90" />
                </button>
              </div>
              
              <div className="bg-[#161a22] border border-[#1e2330] rounded-xl overflow-hidden shadow-sm flex-1">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-[#12151c] text-[#8b93a3] font-medium border-b border-[#1e2330]">
                    <tr>
                      <th className="px-6 py-4 font-medium">Member</th>
                      <th className="px-6 py-4 font-medium">Role</th>
                      <th className="px-6 py-4 font-medium w-48">Progress</th>
                      <th className="px-6 py-4 font-medium text-right">Hours / Quota</th>
                      <th className="px-6 py-4 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2330]">
                    {mockWeeklyRoster.map((member) => {
                      const percent = Math.min(100, (member.hours / member.quota) * 100);
                      const isGood = member.status === 'good';
                      const isWarn = member.status === 'warn';
                      const barColor = isGood ? 'bg-[#5fae7a]' : isWarn ? 'bg-[#d9a441]' : 'bg-[#c9605a]';
                      
                      return (
                        <tr key={member.id} className="hover:bg-[#1e2330]/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#212633] flex items-center justify-center text-xs font-medium text-[#e7e5df]">
                                {member.avatar}
                              </div>
                              <span className="font-medium text-[#e7e5df]">{member.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-[#8b93a3]">{member.role}</td>
                          <td className="px-6 py-4">
                            <div className="w-full h-2 bg-[#1e2330] rounded-full overflow-hidden">
                              <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${percent}%` }}></div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="font-medium text-[#e7e5df]">{member.hours.toFixed(1)}h</span>
                            <span className="text-[#8b93a3]"> / {member.quota}h</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end">
                              {isGood ? (
                                <div className="flex items-center gap-1.5 text-[#5fae7a] bg-[#5fae7a]/10 px-2.5 py-1 rounded-md text-xs font-medium border border-[#5fae7a]/20">
                                  <CheckCircle2 size={14} /> Met
                                </div>
                              ) : isWarn ? (
                                <div className="flex items-center gap-1.5 text-[#d9a441] bg-[#d9a441]/10 px-2.5 py-1 rounded-md text-xs font-medium border border-[#d9a441]/20">
                                  <Clock size={14} /> Close
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-[#c9605a] bg-[#c9605a]/10 px-2.5 py-1 rounded-md text-xs font-medium border border-[#c9605a]/20">
                                  <AlertCircle size={14} /> Behind
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Add Time For Member (Right) */}
            <section className="flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-5 bg-blue-500 rounded-sm"></div>
                <h2 className="text-lg font-semibold text-white">Add Time</h2>
              </div>
              
              <div className="bg-[#161a22] border border-[#1e2330] rounded-xl p-6 shadow-sm relative overflow-hidden flex-1">
                <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/40 to-transparent"></div>
                
                <p className="text-sm text-[#8b93a3] mb-6">Manually log hours on behalf of a member. This action is audited.</p>
                
                <form className="space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-[#e7e5df] mb-1.5">Member</label>
                    <div className="relative">
                      <select className="w-full bg-[#12151c] border border-[#1e2330] rounded-lg py-2.5 px-4 text-sm text-[#e7e5df] appearance-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all cursor-pointer">
                        <option>Select member...</option>
                        <option>CoolOfficer</option>
                        <option>Alpha_Mike</option>
                        <option>BravoTwo</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8b93a3] pointer-events-none" />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-[#e7e5df] mb-1.5">Shift Type</label>
                    <div className="relative">
                      <select className="w-full bg-[#12151c] border border-[#1e2330] rounded-lg py-2.5 px-4 text-sm text-[#e7e5df] appearance-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all cursor-pointer">
                        <option>Select shift type...</option>
                        <option>Active Duty</option>
                        <option>Supervisory</option>
                        <option>Command</option>
                        <option>Training</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8b93a3] pointer-events-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#e7e5df] mb-1.5">Date</label>
                      <input 
                        type="date" 
                        defaultValue="2023-10-25"
                        className="w-full bg-[#12151c] border border-[#1e2330] rounded-lg py-2.5 px-4 text-sm text-[#e7e5df] focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all [color-scheme:dark]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#e7e5df] mb-1.5">Hours</label>
                      <input 
                        type="number" 
                        placeholder="0.00"
                        className="w-full bg-[#12151c] border border-[#1e2330] rounded-lg py-2.5 px-4 text-sm text-[#e7e5df] focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
                      />
                    </div>
                  </div>

                  <button 
                    type="button"
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg py-2.5 text-sm transition-colors mt-2 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                  >
                    <Plus size={16} /> Log Time
                  </button>
                </form>
              </div>
            </section>
          </div>

        </div>
      </main>
    </div>
  );
};

const NavItem = ({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) => {
  return (
    <a href="#" className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
      active 
        ? 'bg-blue-500/10 text-blue-400 font-medium' 
        : 'text-[#8b93a3] hover:text-[#e7e5df] hover:bg-[#1e2330]/50'
    }`}>
      {icon}
      <span className="text-sm">{label}</span>
    </a>
  );
};
