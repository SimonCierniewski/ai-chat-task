'use client';

import { useAuth } from '@/providers/auth-provider';
import { publicConfig } from '../../../lib/config';
import { useState } from 'react';

export function UserInfo() {
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
    return (
      <div className="text-xs text-gray-500">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-xs text-gray-500">
        <p>Not signed in</p>
      </div>
    );
  }

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
          className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
        >
          {signingOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}