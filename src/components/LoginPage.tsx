import { useState, FormEvent } from 'react';
import { User, Project } from '../types';
const brandLogo = '/brickfour-logo.jpeg';
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

  // Site manager of a project: the linked user, or one built from the project's manager details
  const managerForProject = (p: Project): User =>
    users.find((u) => u.role === 'site_manager' && (u.id === p.managerId || u.assignedProjectId === p.id)) || {
      id: p.managerId || `sm-${p.id}`,
      name: p.manager || 'Site Manager',
      email: p.managerEmail || '',
      password: p.managerPassword,
      role: 'site_manager',
      title: `Site Manager (${p.name})`,
      assignedProjectId: p.id,
    };

  // Quick Access: one-click sign in for each project's site manager (admins and department staff always sign in with email + password)
  const smAccounts = projects.map((p) => ({ project: p, user: managerForProject(p) }));


  // Handle Login Attempt: exact email + exact password only
  const handleLoginSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const rawEmail = loginEmail.trim().toLowerCase();
    const pass = loginPassword;

    if (!rawEmail || !pass) {
      setLoginError('Please enter your Email and Password.');
      return;
    }

    // 1. Registered users (admins, site managers and department staff)
    const matchedUser = users.find((u) => (u.email || '').trim().toLowerCase() === rawEmail);
    if (matchedUser) {
      if (matchedUser.password && matchedUser.password === pass) {
        onLoginSuccess(matchedUser);
        return;
      }
      setLoginError('Invalid Email or Password.');
      return;
    }

    // 2. Site manager credentials stored on a project
    const matchedProject = projects.find(
      (p) => (p.managerEmail || '').trim().toLowerCase() === rawEmail && p.managerPassword && p.managerPassword === pass
    );
    if (matchedProject) {
      onLoginSuccess(managerForProject(matchedProject));
      return;
    }

    setLoginError('Invalid Email or Password.');
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
            src={brandLogo}
            alt="Brickfour logo"
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
                src={brandLogo}
                alt="Brickfour logo"
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

          {/* Quick Access (1-Click Instant Login: each project's Site Manager) */}
          {smAccounts.length > 0 && (
          <div className="pt-5 mt-5 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                <span>⚡</span> Quick Access
              </span>
              <span className="text-[10px] text-slate-400 font-semibold">1-Click Sign In</span>
            </div>

            <div className="space-y-2">
              {/* One Site Manager button per project */}
              {smAccounts.map((sm, index) => (
                <button
                  key={sm.project.id}
                  type="button"
                  id={`quick-access-sm-${index + 1}`}
                  onClick={() => handleDirectQuickLogin(sm.user)}
                  className="w-full p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl flex items-center justify-between text-left cursor-pointer transition-all group"
                  title={`Click to log in immediately as the Site Manager of ${sm.project.name}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 group-hover:bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0 transition-colors">
                      👷
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-xs">
                          {sm.project.name}
                        </span>
                        <span className="text-[9px] bg-slate-200/80 text-slate-700 font-bold px-1.5 py-0.5 rounded border border-slate-300">
                          Site Manager
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {sm.project.location}
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
          )}
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
