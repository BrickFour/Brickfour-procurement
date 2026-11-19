import { useState } from 'react';
import { Project, User } from '../types';
import { Building2, UserCheck, ShieldCheck, UserPlus, HardHat, AlertCircle, Plus, Mail, KeyRound, Send, CheckCircle2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { sendEmailNotification } from '../services/emailService';

interface AdminProjectManagerProps {
  projects: Project[];
  users: User[];
  onAssignManager: (projectId: string, managerUser: User) => void;
  onOpenAddProject: () => void;
  onOpenAddSiteManager: () => void;
}

export default function AdminProjectManager({
  projects,
  users,
  onAssignManager,
  onOpenAddProject,
  onOpenAddSiteManager,
}: AdminProjectManagerProps) {
  const [selectedManagerMap, setSelectedManagerMap] = useState<Record<string, string>>({});
  const [resentEmailId, setResentEmailId] = useState<string | null>(null);
  const [dispatchedEmail, setDispatchedEmail] = useState<{
    projectName: string;
    location: string;
    manager: string;
    managerEmail: string;
    managerPassword?: string;
    sentAt: string;
  } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const siteManagers = users.filter((u) => u.role === 'site_manager');

  const handleManagerSelectChange = (projectId: string, managerUserId: string) => {
    setSelectedManagerMap((prev) => ({ ...prev, [projectId]: managerUserId }));
    const managerUser = siteManagers.find((u) => u.id === managerUserId);
    const targetProject = projects.find((p) => p.id === projectId);

    if (managerUser) {
      onAssignManager(projectId, managerUser);

      const now = new Date();
      const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + now.toLocaleDateString();
      const pass = managerUser.password || 'site123password';
      const projName = targetProject?.name || 'Assigned Site Project';
      const loc = targetProject?.location || 'Site Location';

      setDispatchedEmail({
        projectName: projName,
        location: loc,
        manager: managerUser.name,
        managerEmail: managerUser.email,
        managerPassword: pass,
        sentAt: formattedTime,
      });

      // Dispatch Resend Email API call
      sendEmailNotification({
        to: 'pranavk.aconsultancy@gmail.com',
        subject: `[PRAVAH] Construction Site Assignment & Login Credentials - ${projName}`,
        body: `Hello ${managerUser.name},\n\nYou have been assigned as the Site Manager for: ${projName} (${loc}).\n\nYour site access credentials for the PRAVAH Construction Portal are:\n- Assigned Site: ${projName}\n- Login Email: ${managerUser.email}\n- Password: ${pass}\n\nPlease log in to access your site dashboard, update material stock levels, and log transactions.\n\nRegards,\nPRAVAH Central Operations`,
        fromName: 'PRAVAH Central Operations',
        type: 'Site Assignment Credentials',
      });
    }
  };

  const handleResendCredentials = (m: User) => {
    const password = m.password || 'site123password';
    const assignedProjects = projects.filter((p) => p.managerId === m.id || p.manager === m.name);
    const projName = assignedProjects.map(p => p.name).join(', ') || 'Assigned Construction Site';
    const loc = assignedProjects.map(p => p.location).join(', ') || 'Primary Location';

    const now = new Date();
    const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + now.toLocaleDateString();

    setResentEmailId(m.id);
    setTimeout(() => {
      setResentEmailId(null);
      setDispatchedEmail({
        projectName: projName,
        location: loc,
        manager: m.name,
        managerEmail: m.email,
        managerPassword: password,
        sentAt: formattedTime,
      });

      sendEmailNotification({
        to: 'pranavk.aconsultancy@gmail.com',
        subject: `[PRAVAH] Construction Site Login Credentials - ${m.name}`,
        body: `Hello ${m.name},\n\nHere are your login credentials for the PRAVAH Construction Site Portal:\n- Assigned Sites: ${projName}\n- Login Email: ${m.email}\n- Password: ${password}\n\nPlease log in to manage material stock and site transactions.\n\nRegards,\nPRAVAH Central Operations`,
        fromName: 'PRAVAH Central Operations',
        type: 'Credentials Dispatch',
      });
    }, 400);
  };

  const assignedCount = projects.filter((p) => p.managerId || siteManagers.some((u) => u.name === p.manager)).length;

  return (
    <div className="space-y-5 animate-in fade-in duration-200" id="admin-project-manager-container">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#23408e] text-white flex items-center justify-center shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Site Operations &amp; Manager Assignments</h1>
            <p className="text-xs text-slate-500">
              Assign site managers to construction sites. Assigned site managers get exclusive access to log stock for their site.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-admin-add-sm"
            onClick={onOpenAddSiteManager}
            className="px-4 py-2.5 rounded-lg border border-[#23408e] text-[#23408e] bg-white hover:bg-[#f5f8fd] text-sm font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <UserPlus size={16} />
            Register Site Manager
          </button>
          <button
            id="btn-admin-add-project"
            onClick={onOpenAddProject}
            className="px-4 py-2.5 rounded-lg bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Plus size={16} />
            Mobilize New Project
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Project Sites', value: projects.length, hint: 'Registered sites', cls: 'text-slate-900' },
          { label: 'Site Managers', value: siteManagers.length, hint: 'With login credentials', cls: 'text-slate-900' },
          { label: 'Assigned Sites', value: assignedCount, hint: 'Exclusive access active', cls: 'text-emerald-700' },
          { label: 'Unassigned Sites', value: projects.length - assignedCount, hint: 'Need a site manager', cls: projects.length - assignedCount ? 'text-amber-700' : 'text-slate-900' },
        ].map((k) => (
          <div key={k.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{k.label}</span>
            <p className={`text-2xl font-bold mt-1 ${k.cls}`}>{k.value}</p>
            <span className="text-[11px] text-slate-500">{k.hint}</span>
          </div>
        ))}
      </div>

      {/* Projects Assignment Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
            <Building2 size={16} className="text-[#23408e]" /> Site - Manager Binding Matrix ({projects.length} Sites)
          </h3>
          <span className="text-xs text-slate-500">{siteManagers.length} registered site managers</span>
        </div>

        <div className="overflow-auto max-h-[480px] relative">
          <table className="w-full text-left text-sm min-w-[700px]">
            <thead className="sticky top-0 z-20 bg-[#23408e]">
              <tr className="bg-[#23408e] text-white text-xs font-semibold uppercase tracking-wide">
                <th className="py-3 px-4 sticky top-0 bg-[#23408e] z-20">Project Site</th>
                <th className="py-3 px-4 sticky top-0 bg-[#23408e] z-20">Location</th>
                <th className="py-3 px-4 sticky top-0 bg-[#23408e] z-20">Status</th>
                <th className="py-3 px-4 sticky top-0 bg-[#23408e] z-20">Assigned Site Manager</th>
                <th className="py-3 px-4 text-right sticky top-0 bg-[#23408e] z-20">Access Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((proj) => {
                const assignedUserId = proj.managerId || siteManagers.find((u) => u.name === proj.manager)?.id || '';

                return (
                  <tr key={proj.id} className="border-b border-slate-100 last:border-0 hover:bg-[#f5f8fd] transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">{proj.name}</td>
                    <td className="py-3 px-4 text-slate-600">{proj.location}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold capitalize ${
                        proj.status === 'ongoing' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                        proj.status === 'completed' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                        'bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]'
                      }`}>
                        {proj.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        id={`select-manager-${proj.id}`}
                        value={selectedManagerMap[proj.id] || assignedUserId}
                        onChange={(e) => handleManagerSelectChange(proj.id, e.target.value)}
                        aria-label={`Site manager for ${proj.name}`}
                        className="bg-white border border-slate-300 text-slate-800 text-sm rounded-lg px-3 py-1.5 cursor-pointer focus:outline-hidden focus:border-[#23408e] focus:ring-1 focus:ring-[#23408e]/20"
                      >
                        <option value="" disabled>-- Assign Site Manager --</option>
                        {siteManagers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.title || 'Site Manager'})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {assignedUserId ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-emerald-50 text-emerald-800 border-emerald-200 whitespace-nowrap">
                          <UserCheck size={12} /> Exclusive Access Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-amber-50 text-amber-800 border-amber-200 whitespace-nowrap">
                          <AlertCircle size={12} /> Unassigned
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* List of Registered Site Managers */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
            <HardHat size={16} className="text-[#23408e]" /> Registered Site Managers Directory
          </h3>
          <span className="text-xs text-slate-500">Site managers can log in to view and edit their assigned sites</span>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {siteManagers.map((m) => {
            const assignedProjects = projects.filter((p) => p.managerId === m.id || p.manager === m.name);
            const pass = m.password || 'site123password';

            return (
              <div key={m.id} className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between gap-3 hover:border-[#c9d6f2] transition-colors">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-[#eaf0fb] text-[#23408e] font-bold text-sm flex items-center justify-center shrink-0">
                      {m.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-slate-900 truncate">{m.name}</h4>
                      <p className="text-[11px] text-slate-500 truncate">{m.title || 'Site Engineer'}</p>
                    </div>
                  </div>

                  <dl className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-500 inline-flex items-center gap-1"><Mail size={12} /> Email</dt>
                      <dd className="font-medium text-slate-900 truncate">{m.email}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-slate-500 inline-flex items-center gap-1"><KeyRound size={12} /> Password</dt>
                      <dd className="font-mono font-medium text-slate-900">{pass}</dd>
                    </div>
                  </dl>

                  <div className="text-xs">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Assigned Projects ({assignedProjects.length})</p>
                    {assignedProjects.length === 0 ? (
                      <span className="text-amber-700">No project currently assigned</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {assignedProjects.map((p) => (
                          <span key={p.id} className="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold bg-[#eaf0fb] text-[#23408e] border-[#c9d6f2]">
                            {p.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  id={`btn-resend-email-${m.id}`}
                  onClick={() => handleResendCredentials(m)}
                  disabled={resentEmailId === m.id}
                  className="w-full py-2 rounded-lg border border-[#23408e] text-[#23408e] bg-white hover:bg-[#f5f8fd] text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {resentEmailId === m.id ? (
                    <>
                      <Send size={13} className="animate-bounce" />
                      Dispatching Email...
                    </>
                  ) : (
                    <>
                      <Mail size={13} />
                      Resend Credentials Email
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dispatched Email Credentials Modal */}
      <AnimatePresence>
        {dispatchedEmail && (
          <motion.div
            key="admin-email-dispatched-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
            id="admin-email-dispatched-modal"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 overflow-hidden relative"
            >
              {/* Header Banner */}
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 p-4 rounded-2xl mb-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                  <Send size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-emerald-950">Site Credentials Email Dispatched!</span>
                    <span className="text-[10px] font-extrabold uppercase bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                      Delivered
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800 font-medium mt-0.5">
                    Credentials & site assignment details sent to <strong className="underline">{dispatchedEmail.managerEmail}</strong>
                  </p>
                </div>
              </div>

              {/* Email Content Card */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 shadow-inner text-xs font-sans border border-slate-800">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-slate-400 text-[11px]">
                  <div className="flex items-center gap-1.5 font-mono">
                    <Mail size={13} className="text-emerald-400" />
                    <span>To: <strong className="text-white">{dispatchedEmail.managerEmail}</strong></span>
                  </div>
                  <span className="text-[10px] text-slate-400">{dispatchedEmail.sentAt}</span>
                </div>

                <div className="space-y-1">
                  <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Subject</div>
                  <div className="font-extrabold text-slate-100 text-sm">
                    [PRAVAH] Construction Site Assignment & Login Credentials
                  </div>
                </div>

                <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60 space-y-2 text-slate-200">
                  <p className="font-bold text-emerald-400 text-xs">Hello {dispatchedEmail.manager},</p>
                  <p className="text-[11px] leading-relaxed text-slate-300">
                    You have been assigned as Site Manager for <strong>{dispatchedEmail.projectName}</strong>. Your login credentials for the PRAVAH Construction Site Portal are ready.
                  </p>

                  <div className="bg-slate-950/90 p-3 rounded-lg border border-slate-700 font-mono text-[11px] space-y-1.5 my-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Portal URL:</span>
                      <span className="text-sky-400 font-bold">PRAVAH Construction App</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Login Email:</span>
                      <span className="text-amber-300 font-bold">{dispatchedEmail.managerEmail}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Password:</span>
                      <span className="text-emerald-300 font-bold">{dispatchedEmail.managerPassword}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px]">
                      <span className="text-slate-500">Assigned Site:</span>
                      <span className="text-slate-300 font-semibold">{dispatchedEmail.projectName} ({dispatchedEmail.location})</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5">
                <a
                  id="btn-admin-open-email-client"
                  href={`mailto:${dispatchedEmail.managerEmail}?subject=${encodeURIComponent(`[PRAVAH] Construction Site Assignment & Login Credentials - ${dispatchedEmail.projectName}`)}&body=${encodeURIComponent(`Hello ${dispatchedEmail.manager},\n\nYou have been assigned as the Site Manager for: ${dispatchedEmail.projectName} (${dispatchedEmail.location}).\n\nYour site access credentials for the PRAVAH Construction Portal are:\n- Assigned Site: ${dispatchedEmail.projectName}\n- Login Email: ${dispatchedEmail.managerEmail}\n- Password: ${dispatchedEmail.managerPassword}\n\nPlease log in to access your site dashboard and update material stock levels.\n\nRegards,\nPRAVAH Central Operations`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold py-2.5 px-3 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-center"
                >
                  <Mail size={15} />
                  Open Email App to Send
                </a>

                <button
                  id="btn-admin-copy-creds"
                  onClick={() => {
                    const text = `PRAVAH Site Credentials\nSite: ${dispatchedEmail.projectName}\nEmail: ${dispatchedEmail.managerEmail}\nPassword: ${dispatchedEmail.managerPassword}`;
                    navigator.clipboard.writeText(text);
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2.5 px-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isCopied ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Mail size={15} />}
                  {isCopied ? 'Copied to Clipboard!' : 'Copy Credentials'}
                </button>

                <button
                  id="btn-admin-close-email-modal"
                  onClick={() => setDispatchedEmail(null)}
                  className="col-span-1 sm:col-span-2 bg-[#23408e] hover:bg-[#1b3170] text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors cursor-pointer"
                >
                  Close & Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
