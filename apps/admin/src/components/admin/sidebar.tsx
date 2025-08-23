'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { publicConfig } from '../../../lib/config';
import { UserInfo } from './user-info';

interface NavItem {
  label: string;
  href: string;
  icon: string;
  enabled: boolean;
}

export function AdminSidebar() {
  const pathname = usePathname();
  
  const navItems: NavItem[] = [
    { 
      label: 'Dashboard', 
      href: '/admin', 
      icon: '📊',
      enabled: true 
    },
    { 
      label: 'Playground', 
      href: '/admin/playground', 
      icon: '🎮',
      enabled: publicConfig.features.playground 
    },
    { 
      label: 'History', 
      href: '/admin/history', 
      icon: '📜',
      enabled: true 
    },
    { 
      label: 'Users', 
      href: '/admin/users', 
      icon: '👥',
      enabled: true 
    },
    { 
      label: 'Telemetry', 
      href: '/admin/telemetry', 
      icon: '📈',
      enabled: publicConfig.features.telemetry 
    },
    { 
      label: 'Pricing', 
      href: '/admin/pricing', 
      icon: '💰',
      enabled: publicConfig.features.pricing 
    },
    { 
      label: 'Settings', 
      href: '/admin/settings', 
      icon: '⚙️',
      enabled: publicConfig.features.settings 
    },
  ];

  return (
    <aside className="w-64 bg-gray-900 text-white min-h-screen flex flex-col relative">
      <div className="p-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <span>🤖</span>
          <span>{publicConfig.appName}</span>
        </h1>
        <p className="text-sm text-gray-400 mt-1">v{publicConfig.appVersion}</p>
      </div>
      
      <nav className="px-4">
        {navItems.map((item) => {
          if (!item.enabled) return null;
          
          const isActive = pathname === item.href || 
                          (item.href !== '/admin' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg mb-1
                transition-colors duration-200
                ${isActive 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }
              `}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto p-4 border-t border-gray-800">
        <UserInfo />
      </div>
    </aside>
  );
}