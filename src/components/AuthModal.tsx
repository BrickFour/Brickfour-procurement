import { useState, FormEvent } from 'react';
const brandLogo = '/brickfour-logo.jpeg';
import { User, Project } from '../types';
import { ShieldCheck, HardHat, UserPlus, X, LogIn, CheckCircle2, Building2, KeyRound, Mail, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  projects?: Project[];
  currentUser: User;
  onSelectUser: (user: User) => void;
  onAddSiteManager: (newManager: Omit<User, 'id'>) => void;
  onLogout?: () => void;
}

export default function AuthModal({
  isOpen,
  onClose,
  users,
  projects = [],
  currentUser,
  onSelectUser,
  onAddSiteManager,
  onLogout,
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<'login' | 'quick' | 'add_sm'>('login');
  
  // Login credentials state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // New site manager form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('site123password');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');

  const adminUsers = users.filter((u) => u.role === 'admin');
  const siteManagers = users.filter((u) => u.role === 'site_manager');

  const handleCredentialLogin = (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const rawEmail = loginEmail.trim().toLowerCase();
    const cleanPass = loginPassword;

    if (!rawEmail || !cleanPass) {
      setLoginError('Please enter your Email ID and Password.');
      return;
    }

    // 1. Registered users: exact email + exact password
    const matchedUser = users.find((u) => (u.email || '').trim().toLowerCase() === rawEmail);

    if (matchedUser) {
      if (matchedUser.password && matchedUser.password === cleanPass) {
        onSelectUser(matchedUser);
        setLoginEmail('');
        setLoginPassword('');
        onClose();
        return;
      }
      setLoginError('Invalid Email ID or Password.');
      return;
    }

    // 2. Site manager credentials stored on a project
    const matchedProject = projects.find(
      (p) => (p.managerEmail || '').trim().toLowerCase() === rawEmail && p.managerPassword && p.managerPassword === cleanPass
    );

    if (matchedProject) {
      // Find user by name or create temporary manager session
      const existingSM = users.find(
        (u) => u.email.toLowerCase() === rawEmail || u.name.toLowerCase() === matchedProject.manager.toLowerCase()
      );
      if (existingSM) {
        onSelectUser(existingSM);
      } else {
        const newSMUser: User = {
          id: matchedProject.managerId || `sm-${Date.now()}`,
          name: matchedProject.manager,
          email: matchedProject.managerEmail || rawEmail,
          password: cleanPass || 'site123password',
          role: 'site_manager',
          title: `Site Manager (${matchedProject.name})`,
          assignedProjectId: matchedProject.id,
        };
        onSelectUser(newSMUser);
      }
      setLoginEmail('');
      setLoginPassword('');
      onClose();
      return;
    }

    setLoginError('Invalid Email ID or Password.');
  };

  const handleAddManager = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    const managerPass = password || 'site123password';

    onAddSiteManager({
      name,
      email,
      password: managerPass,
      phone,
      title: title || 'Site Engineer',
      role: 'site_manager',
    });

    // Auto trigger mailto dispatch
    try {
      const subject = encodeURIComponent(`[PRAVAH] Site Manager Account Credentials - ${name}`);
      const body = encodeURIComponent(
        `Hello ${name},\n\nYour Site Manager account has been registered on the PRAVAH Construction Site Portal.\n\nYour login credentials are:\n- Login Email: ${email}\n- Password: ${managerPass}\n- Designation: ${title || 'Site Engineer'}\n\nPlease log in to access your site dashboard and manage material stock.\n\nRegards,\nPRAVAH Central Operations`
      );
      window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    } catch {
      // Fallback
    }

    alert(`Site Manager account created! Credentials automatically dispatched to ${email}.\n\nEmail: ${email}\nPassword: ${managerPass}`);

    // Reset
    setName('');
    setEmail('');
    setPassword('site123password');
    setPhone('');
    setTitle('');
    setActiveTab('login');
  };

  const setSampleLogin = (e: string, p: string) => {
    setLoginEmail(e);
    setLoginPassword(p);
    setLoginError('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" id="auth-modal-backdrop">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <img
              src={brandLogo}
              alt="Brickfour logo"
              className="h-10 w-auto object-contain shrink-0"
            />
            <div>
              <h3 className="text-base font-logo uppercase tracking-tight flex items-center gap-1.5">
                <span><span className="text-indigo-900">PRAVAH</span></span>
                <span className="text-[10px] font-sans font-bold bg-indigo-50 border border-indigo-200 text-indigo-900 uppercase tracking-wider px-1.5 py-0.5 rounded-md">Auth</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">Site Managers log in using credentials provided by Admin</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onLogout && (
              <button
                id="btn-auth-modal-logout"
                type="button"
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
              >
                <LogIn size={13} className="rotate-180" /> Sign Out
              </button>
            )}
            <button
              id="close-auth-modal"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex bg-slate-100 p-1 rounded-2xl my-4">
          <button
            id="tab-auth-login"
            onClick={() => setActiveTab('login')}
            className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'login'
                ? 'bg-slate-950 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <KeyRound size={14} />
            Login with Password
          </button>
          <button
            id="tab-auth-quick"
            onClick={() => setActiveTab('quick')}
            className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'quick'
                ? 'bg-white text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-950'
            }`}
          >
            <ShieldCheck size={14} />
            Quick Switch Profiles
          </button>
          {currentUser.role === 'admin' && (
            <button
              id="tab-auth-add-sm"
              onClick={() => setActiveTab('add_sm')}
              className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'add_sm'
                  ? 'bg-white text-slate-950 shadow-xs'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <UserPlus size={14} />
              Register SM
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'login' && (
            <motion.div
              key="login-tab"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4"
            >
              <form onSubmit={handleCredentialLogin} className="space-y-3.5">
                {loginError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2 font-semibold">
                    <AlertCircle size={16} className="text-rose-600 shrink-0" />
                    {loginError}
                  </div>
                )}

                <div>
                  <label htmlFor="login-email-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Mail size={13} className="text-slate-500" /> Email ID *
                  </label>
                  <input
                    id="login-email-input"
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="e.g. name@brickfour.com"
                    className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-slate-950 focus:ring-1 focus:ring-slate-950/20"
                  />
                </div>

                <div>
                  <label htmlFor="login-password-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <KeyRound size={13} className="text-slate-500" /> Password *
                  </label>
                  <input
                    id="login-password-input"
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter password provided by Admin"
                    className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-slate-950 focus:ring-1 focus:ring-slate-950/20"
                  />
                </div>

                <button
                  id="btn-auth-login-submit"
                  type="submit"
                  className="w-full bg-slate-950 hover:bg-black text-white font-extrabold text-sm py-3 rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
                >
                  <LogIn size={16} /> Authenticate & Access System
                </button>
              </form>

              {/* Sample Admin and Site Manager Credentials Quick Fill Box */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-2 mt-4">
                <p className="font-extrabold text-slate-900 flex items-center gap-1.5 text-xs">
                  <KeyRound size={14} className="text-indigo-600" /> Admin Issued Credentials (Click to Autofill)
                </p>
                <div className="space-y-1.5 text-[11px]">
                  {siteManagers.slice(0, 3).map((sm) => (
                    <button
                      key={sm.id}
                      type="button"
                      onClick={() => setSampleLogin(sm.email, sm.password || 'site123password')}
                      className="w-full text-left p-2 bg-white hover:bg-emerald-50 border border-slate-200 rounded-xl flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div>
                        <span className="font-bold text-emerald-900">{sm.name}:</span>{' '}
                        <code className="text-slate-600">{sm.email}</code>
                      </div>
                      <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded">
                        pass: {sm.password || 'site123password'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'quick' && (
            <motion.div
              key="quick-tab"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-4 max-h-[55vh] overflow-y-auto pr-1"
            >
              {/* ADMIN ROLE SECTION */}
              <div>
                <div className="flex items-center gap-2 mb-2 text-indigo-900 font-extrabold text-xs uppercase tracking-wider">
                  <ShieldCheck size={16} className="text-indigo-600" />
                  Administrator (Oversight View)
                </div>

                <div className="grid gap-2">
                  {adminUsers.map((user) => {
                    const isSelected = currentUser.id === user.id;
                    return (
                      <button
                        key={user.id}
                        id={`user-select-${user.id}`}
                        onClick={() => {
                          onSelectUser(user);
                          onClose();
                        }}
                        className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                            {user.name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-950">{user.name}</span>
                              <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                Admin
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium">{user.email}</p>
                          </div>
                        </div>

                        {isSelected ? (
                          <div className="flex items-center gap-1 text-indigo-600 text-xs font-extrabold bg-indigo-100/80 px-2.5 py-1 rounded-lg">
                            <CheckCircle2 size={14} /> Active
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">Select</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SITE MANAGERS SECTION */}
              <div>
                <div className="flex items-center justify-between mb-2 mt-4 text-emerald-900 font-extrabold text-xs uppercase tracking-wider">
                  <span className="flex items-center gap-2">
                    <HardHat size={16} className="text-emerald-600" />
                    Site Managers
                  </span>
                  <span className="text-[11px] text-slate-500 lowercase font-medium">{siteManagers.length} active</span>
                </div>

                <div className="grid gap-2">
                  {siteManagers.map((user) => {
                    const isSelected = currentUser.id === user.id;
                    return (
                      <button
                        key={user.id}
                        id={`user-select-${user.id}`}
                        onClick={() => {
                          onSelectUser(user);
                          onClose();
                        }}
                        className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                            {user.name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-950">{user.name}</span>
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                Site Manager
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium">{user.email}</p>
                          </div>
                        </div>

                        {isSelected ? (
                          <div className="flex items-center gap-1 text-emerald-700 text-xs font-extrabold bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                            <CheckCircle2 size={14} /> Active
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">Select</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-1 mt-3">
                <p className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Building2 size={14} className="text-slate-700" /> Key Permissions Matrix
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px] font-medium text-slate-600">
                  <li><strong>Admin:</strong> Sees all projects, creates & assigns projects with site manager credentials, answers site queries. CANNOT add, consume or delete material stock.</li>
                  <li><strong>Site Manager:</strong> Logs in with admin-assigned credentials. Full rights to manage site stock levels and raise queries.</li>
                </ul>
              </div>
            </motion.div>
          )}

          {activeTab === 'add_sm' && (
            <motion.form
              key="add-sm-tab"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onSubmit={handleAddManager}
              className="space-y-3 mt-2"
            >
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-semibold">
                Admin Feature: Register a standalone Site Manager and set their login password.
              </div>

              <div>
                <label htmlFor="sm-name" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  id="sm-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-slate-950"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sm-email" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Email ID *
                  </label>
                  <input
                    id="sm-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. sitemanager@brickfour.com"
                    className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-slate-950"
                  />
                </div>

                <div>
                  <label htmlFor="sm-password" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Set Login Password *
                  </label>
                  <input
                    id="sm-password"
                    type="text"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="e.g. site123pass"
                    className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-slate-950 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sm-phone" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Contact Phone
                  </label>
                  <input
                    id="sm-phone"
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 00000"
                    className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-slate-950"
                  />
                </div>

                <div>
                  <label htmlFor="sm-title" className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Designation Title
                  </label>
                  <input
                    id="sm-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Assistant Site Engineer"
                    className="w-full bg-white border border-slate-300 text-slate-950 text-sm rounded-xl px-3.5 py-2.5 focus:outline-hidden focus:border-slate-950"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex gap-2.5">
                <button
                  id="btn-cancel-add-sm"
                  type="button"
                  onClick={() => setActiveTab('login')}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-add-sm"
                  type="submit"
                  className="flex-1 bg-slate-950 hover:bg-black text-white text-xs font-extrabold py-2.5 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Save Credentials
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
