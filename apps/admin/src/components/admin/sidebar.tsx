'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { publicConfig } from '../../../lib/config';
import { UserInfo } from './user-info';
import { ChevronLeft, ChevronRight, LayoutDashboard, Gamepad2, ScrollText, Users, TrendingUp, DollarSign, Settings } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  emoji: string;
  enabled: boolean;
}

export function AdminSidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState === 'true') {
      setIsCollapsed(true);
    }
  }, []);
  
  // Save collapsed state to localStorage
  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', newState.toString());
  };
  
  const navItems: NavItem[] = [
    { 
      label: 'Dashboard', 
      href: '/admin', 
      icon: <LayoutDashboard className="w-5 h-5" />,
      emoji: '📊',
      enabled: true 
    },
    { 
      label: 'Playground', 
      href: '/admin/playground', 
      icon: <Gamepad2 className="w-5 h-5" />,
      emoji: '🎮',
      enabled: publicConfig.features.playground 
    },
    { 
      label: 'History', 
      href: '/admin/history', 
      icon: <ScrollText className="w-5 h-5" />,
      emoji: '📜',
      enabled: true 
    },
    { 
      label: 'Users', 
      href: '/admin/users', 
      icon: <Users className="w-5 h-5" />,
      emoji: '👥',
      enabled: true 
    },
    { 
      label: 'Telemetry', 
      href: '/admin/telemetry', 
      icon: <TrendingUp className="w-5 h-5" />,
      emoji: '📈',
      enabled: publicConfig.features.telemetry 
    },
    { 
      label: 'Pricing', 
      href: '/admin/pricing', 
      icon: <DollarSign className="w-5 h-5" />,
      emoji: '💰',
      enabled: publicConfig.features.pricing 
    },
    { 
      label: 'Settings', 
      href: '/admin/settings', 
      icon: <Settings className="w-5 h-5" />,
      emoji: '⚙️',
      enabled: publicConfig.features.settings 
    },
  ];

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64'} bg-gray-900 text-white h-screen flex flex-col relative transition-all duration-300 ease-in-out flex-shrink-0`}>
      {/* Toggle Button */}
      <button
        onClick={toggleCollapse}
        className="absolute -right-3 top-8 bg-gray-800 text-white rounded-full p-1.5 hover:bg-gray-700 transition-colors z-10 border border-gray-700"
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
      
      {/* Header */}
      <div className={`${isCollapsed ? 'p-4' : 'p-6'} transition-all duration-300`}>
        <h1 className={`font-bold flex items-center gap-2 ${isCollapsed ? 'justify-center' : ''}`}>
          <span className="text-2xl">🤖</span>
          {!isCollapsed && (
            <>
              <span className="text-2xl">{publicConfig.appName}</span>
            </>
          )}
        </h1>
        {!isCollapsed && (
          <p className="text-sm text-gray-400 mt-1">v{publicConfig.appVersion}</p>
        )}
      </div>
      
      {/* Navigation */}
      <nav className={`${isCollapsed ? 'px-2' : 'px-4'} flex-1 overflow-y-auto`}>
        {navItems.map((item) => {
          if (!item.enabled) return null;
          
          const isActive = pathname === item.href || 
                          (item.href !== '/admin' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 rounded-lg mb-1
                transition-all duration-200
                ${isCollapsed ? 'px-3 py-3 justify-center' : 'px-4 py-3'}
                ${isActive 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }
              `}
              title={isCollapsed ? item.label : undefined}
            >
              <span className="text-xl flex-shrink-0">{item.emoji}</span>
              {!isCollapsed && (
                <span className="font-medium">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Info */}
      <div className={`border-t border-gray-800 ${isCollapsed ? 'p-2' : 'p-4'} flex-shrink-0`}>
        <UserInfo isCollapsed={isCollapsed} />
      </div>
    </aside>
  );
}
