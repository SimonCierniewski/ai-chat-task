'use client';

import { useState } from 'react';
import { AdminHeader } from '@/components/admin/header';
import { Card } from '@/components/ui/card';
import { publicConfig } from '../../../../lib/config';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    memoryTopK: 10,
    memoryTokenBudget: 1500,
    clipSentences: 2,
    minRelevanceScore: 0.7,
    rateLimitWindow: 60000,
    rateLimitMax: 100,
    sseHeartbeatMs: 10000,
    defaultModel: 'gpt-4o-mini',
  });

  const handleSave = () => {
    console.log('Saving settings:', settings);
    // In production, this would call the API
  };

  return (
    <>
      <AdminHeader 
        title="Settings" 
        subtitle="Configure system parameters and behavior"
      />
      
      <div className="p-8">
        {/* Environment Info */}
        <Card title="Environment Information" icon="ℹ️" className="mb-8">
          <div className="mt-4 space-y-2">
            <div className="flex justify-between py-2 border-b">
              <span className="text-sm font-medium text-gray-600">App Version</span>
              <span className="text-sm text-gray-900">{publicConfig.appVersion}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-sm font-medium text-gray-600">Region</span>
              <span className="text-sm text-gray-900">{publicConfig.region}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-sm font-medium text-gray-600">API Base URL</span>
              <span className="text-sm text-gray-900">{publicConfig.apiBaseUrl}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm font-medium text-gray-600">Supabase URL</span>
              <span className="text-sm text-gray-900">{publicConfig.supabaseUrl || 'Not configured'}</span>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Memory Settings */}
          <Card title="Memory Configuration" icon="🧠">
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Top K Results
                </label>
                <input
                  type="number"
                  value={settings.memoryTopK}
                  onChange={(e) => setSettings({ ...settings, memoryTopK: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="text-xs text-gray-500 mt-1">Number of memory results to retrieve</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Memory Token Budget
                </label>
                <input
                  type="number"
                  value={settings.memoryTokenBudget}
                  onChange={(e) => setSettings({ ...settings, memoryTokenBudget: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="text-xs text-gray-500 mt-1">Maximum tokens for memory context</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Clip Sentences
                </label>
                <input
                  type="number"
                  value={settings.clipSentences}
                  onChange={(e) => setSettings({ ...settings, clipSentences: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="text-xs text-gray-500 mt-1">Max sentences per memory item</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Relevance Score
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={settings.minRelevanceScore}
                  onChange={(e) => setSettings({ ...settings, minRelevanceScore: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="text-xs text-gray-500 mt-1">Minimum score for memory relevance (0-1)</p>
              </div>
            </div>
          </Card>

          {/* System Settings */}
          <Card title="System Configuration" icon="⚙️">
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rate Limit Window (ms)
                </label>
                <input
                  type="number"
                  value={settings.rateLimitWindow}
                  onChange={(e) => setSettings({ ...settings, rateLimitWindow: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="text-xs text-gray-500 mt-1">Time window for rate limiting</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rate Limit Max Requests
                </label>
                <input
                  type="number"
                  value={settings.rateLimitMax}
                  onChange={(e) => setSettings({ ...settings, rateLimitMax: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="text-xs text-gray-500 mt-1">Max requests per window</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SSE Heartbeat Interval (ms)
                </label>
                <input
                  type="number"
                  value={settings.sseHeartbeatMs}
                  onChange={(e) => setSettings({ ...settings, sseHeartbeatMs: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                <p className="text-xs text-gray-500 mt-1">Keep-alive interval for SSE connections</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Model
                </label>
                <select
                  value={settings.defaultModel}
                  onChange={(e) => setSettings({ ...settings, defaultModel: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="gpt-4o-mini">GPT-4 Mini</option>
                  <option value="gpt-4o">GPT-4</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Default AI model for chat</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Save Button */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </>
  );
}