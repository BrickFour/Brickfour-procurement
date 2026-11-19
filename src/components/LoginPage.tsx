import { useState, FormEvent } from 'react';
import { User, Project } from '../types';
import vyasLogo from '../images/vyas logo.png';
import {
  LogIn,
  KeyRound,
  Mail,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react';
import { motion } from 'motion/react';

interface LoginPageProps {
  users: User[];
  projects: Project[];
  onLoginSuccess: (user: User) => void;
  onRegisterAdmin?: (newAdmin: Omit<User, 'id'>) => void;
  isLiveDatabase?: boolean;
}

export default function LoginPage({
  users,
  projects,
  onLoginSuccess,
}: LoginPageProps) {
  // Login Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Primary Admin User
  const primaryAdmin: User = users.find((u) => u.role === 'admin') || {
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@vyasgroup.com',
    role: 'admin' as const,
    title: 'Chief Operations Administrator',
    phone: '+91 98200 11223',
  };

  // Site Managers for Quick Access (dummy labels: Site Manager 1, 2, 3)
  const siteManagers = users.filter((u) => u.role === 'site_manager');
  const smAccounts = [
    {
      label: 'Site Manager 1',
      user: siteManagers[0] || {
        id: 'sm-1',
        name: 'Site Manager 1',
        email: 'sitemanager1@vyasgroup.com',
        role: 'site_manager' as const,
        title: 'Site Manager (Project 1)',
        assignedProjectId: projects[0]?.id || 'proj-1',
      },
    },
    {
      label: 'Site Manager 2',
      user: siteManagers[1] || {
        id: 'sm-2',
        name: 'Site Manager 2',
        email: 'sitemanager2@vyasgroup.com',
        role: 'site_manager' as const,
        title: 'Site Manager (Project 2)',
        assignedProjectId: projects[1]?.id || 'proj-2',
      },
    },
    {
      label: 'Site Manager 3',
      user: siteManagers[2] || {
        id: 'sm-3',
        name: 'Site Manager 3',
        email: 'sitemanager3@vyasgroup.com',
        role: 'site_manager' as const,
        title: 'Site Manager (Project 3)',
        assignedProjectId: projects[2]?.id || 'proj-3',
      },
    },
  ];

  // Handle Login Attempt
  const handleLoginSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const rawEmail = loginEmail.trim().toLowerCase();
    const cleanPass = loginPassword.trim();

    if (!rawEmail) {
      setLoginError('Please enter an Email or select Quick Access.');
      return;
    }

    // 1. Direct Admin matching aliases
    const isAdminQuery =
      rawEmail === 'admin' ||
      rawEmail === 'admin@vyasgroup.com' ||
      rawEmail === 'admin@bhandar.com' ||
      rawEmail === 'admin@builderstore.com' ||
      rawEmail.startsWith('admin@') ||
      rawEmail === 'vikramaditya rao' ||
      rawEmail === 'vikram';

    if (isAdminQuery) {
      const isPassValid =
        !cleanPass ||
        !primaryAdmin.password ||
        primaryAdmin.password === cleanPass ||
        ['admin', 'admin123', 'brickfour', 'brickfour123', 'bhandar', 'bhandar123', 'site123password', 'password', '123456'].includes(cleanPass.toLowerCase());

      if (isPassValid) {
        onLoginSuccess(primaryAdmin);
        return;
      }
    }

    // 2. Direct Site Manager aliases (sm1, sm2, sm3, site manager 1, 2, 3)
    if (rawEmail === 'sm1' || rawEmail === 'sm-1' || rawEmail === 'site manager 1' || rawEmail.includes('sitemanager1')) {
      onLoginSuccess(smAccounts[0].user);
      return;
    }
    if (rawEmail === 'sm2' || rawEmail === 'sm-2' || rawEmail === 'site manager 2' || rawEmail.includes('sitemanager2')) {
      onLoginSuccess(smAccounts[1].user);
      return;
    }
    if (rawEmail === 'sm3' || rawEmail === 'sm-3' || rawEmail === 'site manager 3' || rawEmail.includes('sitemanager3')) {
      onLoginSuccess(smAccounts[2].user);
      return;
    }

    // 3. Match in registered users table (by email or full name)
    const matchedUser = users.find(
      (u) =>
        u.email.toLowerCase() === rawEmail ||
        u.name.toLowerCase() === rawEmail ||
        u.email.toLowerCase().split('@')[0] === rawEmail
    );

    if (matchedUser) {
      const isPassValid =
        !cleanPass ||
        !matchedUser.password ||
        matchedUser.password === cleanPass ||
        ['admin', 'admin123', 'brickfour', 'brickfour123', 'bhandar', 'bhandar123', 'site123password', 'password', '123456'].includes(cleanPass.toLowerCase());

      if (isPassValid) {
        onLoginSuccess(matchedUser);
        return;
      }
    }

    // 4. Match in site manager credentials assigned in projects
    const matchedProject = projects.find(
      (p) =>
        p.managerEmail?.toLowerCase() === rawEmail ||
        p.manager?.toLowerCase() === rawEmail ||
        p.name.toLowerCase().includes(rawEmail)
    );

    if (matchedProject) {
      const existingSM = users.find(
        (u) => u.email.toLowerCase() === rawEmail || u.name.toLowerCase() === matchedProject.manager.toLowerCase()
      );

      if (existingSM) {
        onLoginSuccess(existingSM);
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
        onLoginSuccess(newSMUser);
      }
      return;
    }

    // 5. Fallback password matching
    if (['admin', 'admin123', 'site123password', 'brickfour', 'bhandar', 'password'].includes(cleanPass.toLowerCase()) && users.length > 0) {
      const fallbackUser = users.find((u) => u.email.toLowerCase().includes(rawEmail) || u.name.toLowerCase().includes(rawEmail)) || primaryAdmin;
      onLoginSuccess(fallbackUser);
      return;
    }

    setLoginError('Invalid Email or Password. Enter valid credentials or click Quick Access.');
  };

  // Handle Quick Instant One-Click Login
  const handleDirectQuickLogin = (userToLogin: User) => {
    setLoginError('');
    onLoginSuccess(userToLogin);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col justify-between items-center p-4 sm:p-6 lg:p-8 font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Header Branding Bar (Completely clean without tags) */}
      <header className="w-full max-w-5xl flex items-center justify-between pt-2 pb-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <img
            src={vyasLogo}
            alt="Vyas Group logo"
            className="h-10 sm:h-12 w-auto object-contain"
          />
          <div className="hidden sm:block border-l border-slate-200 pl-3 py-0.5">
            <h1 className="text-lg font-logo uppercase tracking-tight">
              <span className="text-indigo-900">PRAVAH</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Construction Material Consumption & Supply Ledger Platform
            </p>
          </div>
        </div>
      </header>

      {/* Central Login Card */}
      <div className="w-full max-w-md my-auto py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-sm"
        >
          {/* Top Brand Accent Bar (Corporate Indigo gradient) */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-950 via-indigo-700 to-blue-600" />

          {/* Card Top: Logo instead of lock icon */}
          <div className="text-center mb-6 pt-2">
            <div className="flex items-center justify-center mb-3">
              <img
                src={vyasLogo}
                alt="Vyas Group logo"
                className="h-12 sm:h-14 w-auto object-contain"
              />
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Login
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Enter your credentials to access your account
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            {loginError && (
              <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs flex items-center gap-2.5 font-semibold">
                <AlertCircle size={16} className="text-indigo-600 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5"
              >
                <Mail size={13} className="text-indigo-600" /> Email
              </label>
              <input
                id="login-email"
                type="text"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="e.g. abc@example.com"
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl px-4 py-3 focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 focus:bg-white font-medium placeholder-slate-400 transition-all shadow-2xs"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5"
              >
                <KeyRound size={13} className="text-indigo-600" /> Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl pl-4 pr-11 py-3 focus:outline-hidden focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 focus:bg-white font-medium placeholder-slate-400 transition-all shadow-2xs"
                />
                <button
                  type="button"
                  id="btn-toggle-password-visibility"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-md transition-colors"
                  title={showPassword ? 'Hide password' : 'View password'}
                  aria-label={showPassword ? 'Hide password' : 'View password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              id="btn-login-submit"
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-extrabold text-sm py-3.5 rounded-xl shadow-md shadow-indigo-900/15 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
            >
              <LogIn size={16} /> Login
            </button>
          </form>

          {/* Quick Access (1-Click Instant Login: Admin + Site Manager 1, 2, 3) */}
          <div className="pt-5 mt-5 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                <span>⚡</span> Quick Access
              </span>
              <span className="text-[10px] text-slate-400 font-semibold">1-Click Sign In</span>
            </div>

            <div className="space-y-2">
              {/* Admin Button */}
              <button
                type="button"
                id="quick-access-admin"
                onClick={() => handleDirectQuickLogin(primaryAdmin)}
                className="w-full p-2.5 bg-slate-50 hover:bg-indigo-50/40 border border-slate-200 hover:border-indigo-300 rounded-xl flex items-center justify-between text-left cursor-pointer transition-all group"
                title="Click to log in immediately as Admin"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-950 to-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                    👑
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 group-hover:text-indigo-600 text-xs transition-colors">
                        Admin
                      </span>
                      <span className="text-[9px] bg-indigo-100 text-indigo-900 font-extrabold px-1.5 py-0.5 rounded border border-indigo-200">
                        Admin
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      admin@vyasgroup.com
                    </span>
                  </div>
                </div>
                <span className="text-[10px] bg-white group-hover:bg-indigo-600 text-indigo-600 group-hover:text-white font-extrabold px-2.5 py-1.5 rounded-lg border border-indigo-200 group-hover:border-transparent transition-all flex items-center gap-1">
                  <span>Sign In</span>
                  <ArrowRight size={11} />
                </span>
              </button>

              {/* Site Managers 1, 2, 3 Buttons */}
              {smAccounts.map((sm, index) => (
                <button
                  key={sm.user.id || `sm-${index}`}
                  type="button"
                  id={`quick-access-sm-${index + 1}`}
                  onClick={() => handleDirectQuickLogin(sm.user)}
                  className="w-full p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl flex items-center justify-between text-left cursor-pointer transition-all group"
                  title={`Click to log in immediately as ${sm.label}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 group-hover:bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0 transition-colors">
                      👷
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-xs">
                          {sm.label}
                        </span>
                        <span className="text-[9px] bg-slate-200/80 text-slate-700 font-bold px-1.5 py-0.5 rounded border border-slate-300">
                          Site Manager
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {sm.user.email}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] bg-white group-hover:bg-slate-900 text-slate-700 group-hover:text-white font-extrabold px-2.5 py-1.5 rounded-lg border border-slate-200 group-hover:border-transparent transition-all flex items-center gap-1">
                    <span>Sign In</span>
                    <ArrowRight size={11} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Footer Credentials & Policy Info */}
      <footer className="w-full max-w-5xl text-center text-xs text-slate-500 pt-4 pb-2 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-logo uppercase tracking-tight text-slate-800">
            <span className="text-indigo-900">PRAVAH</span>
          </span>
          <span className="font-medium text-slate-600">Materials Ledger</span>
          <span>&bull;</span>
          <span>Enterprise Site Inventory & Procurement</span>
        </div>
        <div className="text-slate-400 text-[11px]">
          Authorized Personnel Only &bull; All Transactions Audited
        </div>
      </footer>
    </div>
  );
}
