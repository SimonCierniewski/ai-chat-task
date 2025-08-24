'use client';

import { useAuth } from '@/providers/auth-provider';
import { publicConfig } from '../../../lib/config';
import { useState } from 'react';
import { User, LogOut } from 'lucide-react';

interface UserInfoProps {
  isCollapsed?: boolean;
}

export function UserInfo({ isCollapsed = false }: UserInfoProps) {
  const { user, profile, signOut, loading } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
      setSigningOut(false);
    }
  };

  if (loading) {
    if (isCollapsed) {
      return (
        <div className="flex justify-center">
          <User className="w-5 h-5 text-gray-500" />
        </div>
      );
    }
    return (
      <div className="text-xs text-gray-500">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    if (isCollapsed) {
      return (
        <div className="flex justify-center">
          <User className="w-5 h-5 text-gray-500" />
        </div>
      );
    }
    return (
      <div className="text-xs text-gray-500">
        <p>Not signed in</p>
      </div>
    );
  }

  // Collapsed view - show only icon and sign out button
  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div 
          className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800"
          title={`${user.email} (${profile?.role || 'user'})`}
        >
          <User className="w-5 h-5 text-gray-400" />
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50 hover:bg-gray-800 rounded"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Expanded view - show full information
  return (
    <div className="text-xs text-gray-400">
      <div className="mb-2">
        <p className="truncate" title={user.email}>
          {user.email}
        </p>
        <p className="text-gray-500">
          Role: <span className="font-medium text-green-400">{profile?.role || 'user'}</span>
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-gray-500">Region: {publicConfig.region}</p>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="text-gray-400 hover:text-white transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <LogOut className="w-3 h-3" />
          {signingOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}