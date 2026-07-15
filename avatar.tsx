import React, { useState, useEffect } from 'react';
import { 
  Users, LayoutDashboard, Settings, LogOut, 
  ChevronDown, Plus,
  MoreVertical, ShieldAlert, CheckCircle2,
  Activity,
  Terminal, Server, Crosshair
} from 'lucide-react';

export function CommandCenter() {
  const [time, setTime] = useState(new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' }) + ' UTC');

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' }) + ' UTC');
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const activeStaff = [
    { id: 1, name: "CoolOfficer", role: "Patrol", time: "02:14:36", avatar: "CO", status: "active" },
    { id: 2, name: "Alpha_Mike", role: "Dispatch", time: "04:51:09", avatar: "AM", status: "active" },
    { id: 3, name: "DutySergeant", role: "Supervisor", time: "01:05:22", avatar: "DS", status: "active" },
    { id: 4, name: "Bravo_Six", role: "Patrol", time: "00:42:11", avatar: "BS", status: "break" },
    { id: 5, name: "Echo_Actual", role: "Training", time: "01:12:04", avatar: "EA", status: "active" },
  ];

  const weeklyRoster = [
    { id: 1, name: "CoolOfficer", role: "Patrol", total: 14.5, quota: 12, shifts: 4 },
    { id: 2, name: "Alpha_Mike", role: "Dispatch", total: 22.0, quota: 20, shifts: 5 },
    { id: 3, name: "DutySergeant", role: "Supervisor", total: 8.0, quota: 15, shifts: 2 },
    { id: 4, name: "Bravo_Six", role: "Patrol", total: 10.0, quota: 10, shifts: 3 },
    { id: 5, name: "Charlie_Tango", role: "Patrol", total: 4.5, quota: 12, shifts: 1 },
    { id: 6, name: "Delta_Actual", role: "Supervisor", total: 15.0, quota: 15, shifts: 4 },
    { id: 7, name: "Echo_Actual", role: "Training", total: 2.0, quota: 5, shifts: 1 },
  ];

  return (
    <div className="flex h-screen w-full bg-[#0a0e17] text-[#e7e5df] font-inter overflow-hidden selection:bg-[#d9a441] selection:text-black">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Oswald:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');
        .font-oswald { font-family: 'Oswald', sans-serif; }
        .font-space { font-family: 'Space Grotesk', sans-serif; }
        .font-inter { font-family: 'Inter', sans-serif; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .glow-amber { box-shadow: 0 0 10px rgba(217, 164, 65, 0.5); }
        .glow-amber-text { text-shadow: 0 0 8px rgba(217, 164, 65, 0.6); }
        .glow-green { box-shadow: 0 0 10px rgba(95, 174, 122, 0.5); }
        .glow-red { box-shadow: 0 0 10px rgba(201, 96, 90, 0.5); }
        .grid-bg {
          background-image: linear-gradient(rgba(33, 41, 54, 0.3) 1px, transparent 1px),
          linear-gradient(90deg, rgba(33, 41, 54, 0.3) 1px, transparent 1px);
          background-size: 20px 20px;
        }
      `}} />

      {/* SIDEBAR */}
      <aside className="w-64 bg-[#12161d] border-r border-[#212936] flex flex-col z-10 relative">
        <div className="h-16 flex items-center px-6 border-b border-[#212936]">
          <Terminal className="w-6 h-6 text-[#d9a441] mr-3" />
          <h1 className="font-oswald text-xl font-bold tracking-widest text-[#e7e5df]">SHIFT<span className="text-[#d9a441]">US</span></h1>
        </div>

        <div className="p-6 pb-2 border-b border-[#212936]">
          <div className="text-[10px] uppercase font-space text-[#8b93a3] tracking-widest mb-2">System Time</div>
          <div className="font-mono text-xl text-[#d9a441] glow-amber-text font-medium">{time}</div>
          <div className="text-xs text-[#5fae7a] mt-1 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#5fae7a] glow-green"></div>
            Servers Nominal
          </div>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          <div className="px-4 mb-2">
            <p className="text-[10px] uppercase font-space text-[#8b93a3] tracking-widest px-2 mb-2">Navigation</p>
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-[#8b93a3] hover:text-[#e7e5df] hover:bg-[#1a2029] group transition-colors">
              <LayoutDashboard className="w-4 h-4 group-hover:text-[#d9a441] transition-colors" />
              <span className="text-sm font-medium">My Dashboard</span>
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-[#e7e5df] bg-[#1a2029] border-l-2 border-[#d9a441] group transition-colors">
              <Activity className="w-4 h-4 text-[#d9a441]" />
              <span className="text-sm font-medium">Command Center</span>
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-[#8b93a3] hover:text-[#e7e5df] hover:bg-[#1a2029] group transition-colors">
              <Settings className="w-4 h-4 group-hover:text-[#d9a441] transition-colors" />
              <span className="text-sm font-medium">Admin</span>
            </a>
          </div>
        </nav>

        <div className="p-4 border-t border-[#212936] bg-[#0a0e17]">
          <div className="flex items-center justify-between p-2 hover:bg-[#1a2029] cursor-pointer transition-colors border border-transparent hover:border-[#212936]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#1a2029] border border-[#d9a441] text-[#d9a441] flex items-center justify-center font-bold text-xs font-space">
                AD
              </div>
              <div>
                <div className="text-sm font-medium text-[#e7e5df]">Admin_User</div>
                <div className="text-[10px] text-[#d9a441] uppercase tracking-wider">SysAdmin</div>
              </div>
            </div>
            <LogOut className="w-4 h-4 text-[#8b93a3] hover:text-[#c9605a] transition-colors" />
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col relative grid-bg overflow-y-auto">
        {/* Header Strip */}
        <header className="h-16 flex items-center justify-between px-8 bg-[#12161d]/80 backdrop-blur border-b border-[#212936] sticky top-0 z-20">
          <div className="flex items-center gap-4">
            <h2 className="font-oswald text-xl font-medium tracking-wide flex items-center gap-3 text-[#e7e5df]">
              <Crosshair className="w-5 h-5 text-[#d9a441]" />
              COMMAND CENTER OVERVIEW
            </h2>
          </div>
          <div className="text-xs font-mono text-[#5fae7a] flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#5fae7a] animate-pulse"></div>
            Bot Online
          </div>
        </header>

        <div className="p-8 flex-1 flex flex-col gap-6 max-w-[1600px] mx-auto w-full">
          
          {/* LIVE ROSTER SECTION */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-space font-medium text-sm text-[#8b93a3] uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 bg-[#d9a441] rounded-full glow-amber animate-pulse"></div>
                Live Roster — Active Shifts
              </h3>
              <div className="text-xs font-mono text-[#8b93a3]">
                {activeStaff.length} PERSONNEL ONLINE
              </div>
            </div>
            
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
              {activeStaff.map((staff) => (
                <div key={staff.id} className="min-w-[240px] bg-[#12161d] border border-[#212936] p-4 flex flex-col gap-4 relative group">
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-[#212936] group-hover:bg-[#d9a441] transition-colors"></div>
                  
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 flex items-center justify-center font-bold font-space text-sm border 
                        ${staff.status === 'active' ? 'bg-[#5fae7a]/10 border-[#5fae7a]/30 text-[#5fae7a]' : 'bg-[#d9a441]/10 border-[#d9a441]/30 text-[#d9a441]'}`}>
                        {staff.avatar}
                      </div>
                      <div>
                        <div className="font-medium text-sm text-[#e7e5df]">{staff.name}</div>
                        <div className="text-xs text-[#8b93a3]">{staff.role}</div>
                      </div>
                    </div>
                    <div className="relative flex h-2 w-2">
                      {staff.status === 'active' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#5fae7a] opacity-75"></span>}
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${staff.status === 'active' ? 'bg-[#5fae7a]' : 'bg-[#d9a441]'}`}></span>
                    </div>
                  </div>

                  <div className="flex items-end justify-between mt-2">
                    <div>
                      <div className="text-[10px] uppercase font-space text-[#8b93a3] tracking-wider mb-1">Elapsed Time</div>
                      <div className={`font-mono text-xl ${staff.status === 'active' ? 'text-[#e7e5df]' : 'text-[#d9a441]'}`}>
                        {staff.time}
                      </div>
                    </div>
                    {staff.status === 'break' && (
                      <span className="text-[10px] font-space uppercase tracking-widest text-[#d9a441] px-2 py-0.5 bg-[#d9a441]/10 border border-[#d9a441]/20">ON BREAK</span>
                    )}
                  </div>
                </div>
              ))}
              
              <div className="min-w-[240px] border border-dashed border-[#212936] flex flex-col items-center justify-center text-[#8b93a3] hover:text-[#d9a441] hover:border-[#d9a441]/50 cursor-pointer transition-all bg-[#12161d]/30">
                <Plus className="w-6 h-6 mb-2" />
                <span className="font-space text-xs uppercase tracking-widest">Force Clock-In</span>
              </div>
            </div>
          </section>

          {/* GRID LAYOUT */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* WEEKLY TABLE */}
            <section className="lg:col-span-2 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-space font-medium text-sm text-[#8b93a3] uppercase tracking-widest">
                  Weekly Compliance Metrics
                </h3>
              </div>

              <div className="bg-[#12161d] border border-[#212936] flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#212936] bg-[#1a2029]/50">
                      <th className="font-space text-[10px] uppercase tracking-widest text-[#8b93a3] font-medium py-3 px-4">Personnel</th>
                      <th className="font-space text-[10px] uppercase tracking-widest text-[#8b93a3] font-medium py-3 px-4">Primary Role</th>
                      <th className="font-space text-[10px] uppercase tracking-widest text-[#8b93a3] font-medium py-3 px-4 text-right">Hours Logged</th>
                      <th className="font-space text-[10px] uppercase tracking-widest text-[#8b93a3] font-medium py-3 px-4 text-right">Quota Status</th>
                      <th className="font-space text-[10px] uppercase tracking-widest text-[#8b93a3] font-medium py-3 px-4">Progress</th>
                      <th className="py-3 px-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#212936]">
                    {weeklyRoster.map((row) => {
                      const pct = Math.min(100, Math.round((row.total / row.quota) * 100));
                      const isMet = row.total >= row.quota;
                      return (
                        <tr key={row.id} className="hover:bg-[#1a2029]/50 transition-colors group">
                          <td className="py-3 px-4">
                            <div className="font-medium text-sm text-[#e7e5df]">{row.name}</div>
                            <div className="text-xs text-[#8b93a3] mt-0.5">{row.shifts} shifts this week</div>
                          </td>
                          <td className="py-3 px-4 text-sm text-[#8b93a3]">{row.role}</td>
                          <td className="py-3 px-4 text-right">
                            <div className="font-mono text-sm text-[#e7e5df]">{row.total.toFixed(1)}h</div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="font-mono text-sm text-[#8b93a3]">/ {row.quota.toFixed(1)}h</div>
                          </td>
                          <td className="py-3 px-4 w-48">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-1.5 bg-[#212936] overflow-hidden">
                                <div 
                                  className={`h-full ${isMet ? 'bg-[#5fae7a] glow-green' : 'bg-[#d9a441]'}`}
                                  style={{ width: `${pct}%` }}
                                ></div>
                              </div>
                              <span className={`text-xs font-mono w-10 text-right ${isMet ? 'text-[#5fae7a]' : 'text-[#d9a441]'}`}>{pct}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button className="text-[#8b93a3] hover:text-[#e7e5df] opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ACTION PANEL */}
            <div className="flex flex-col gap-6">
              
              {/* ADD TIME FORM */}
              <section className="flex flex-col gap-3">
                <h3 className="font-space font-medium text-sm text-[#8b93a3] uppercase tracking-widest flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-[#c9605a]" />
                  Admin Override: Log Time
                </h3>
                
                <div className="bg-[#12161d] border border-[#212936] p-5 flex flex-col gap-4">
                  <p className="text-xs text-[#8b93a3] leading-relaxed mb-1">
                    Manually inject shift records for personnel. This action is logged and visible in the audit trail.
                  </p>
                  
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] uppercase font-space text-[#8b93a3] tracking-widest">Target Personnel</label>
                      <div className="relative">
                        <select className="w-full bg-[#0a0e17] border border-[#212936] text-sm text-[#e7e5df] p-2.5 appearance-none focus:outline-none focus:border-[#d9a441] transition-colors">
                          <option>Select member...</option>
                          <option>DutySergeant</option>
                          <option>Alpha_Mike</option>
                          <option>Charlie_Tango</option>
                        </select>
                        <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#8b93a3] pointer-events-none" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] uppercase font-space text-[#8b93a3] tracking-widest">Shift Type</label>
                        <div className="relative">
                          <select className="w-full bg-[#0a0e17] border border-[#212936] text-sm text-[#e7e5df] p-2.5 appearance-none focus:outline-none focus:border-[#d9a441] transition-colors">
                            <option>Patrol</option>
                            <option>Dispatch</option>
                            <option>Supervisor</option>
                            <option>Training</option>
                          </select>
                          <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#8b93a3] pointer-events-none" />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] uppercase font-space text-[#8b93a3] tracking-widest">Duration (Hours)</label>
                        <input 
                          type="number" 
                          step="0.5"
                          placeholder="e.g. 2.5"
                          className="w-full bg-[#0a0e17] border border-[#212936] text-sm text-[#e7e5df] p-2.5 focus:outline-none focus:border-[#d9a441] transition-colors font-mono"
                        />
                      </div>
                    </div>

                  </div>

                  <button className="mt-2 w-full bg-[#d9a441] text-[#0a0e17] font-space font-semibold uppercase tracking-widest text-xs py-3 hover:bg-[#c4933a] transition-colors flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Authorize Log Entry
                  </button>
                </div>
              </section>

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
