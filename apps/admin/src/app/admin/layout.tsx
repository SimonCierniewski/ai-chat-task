import { AdminSidebar } from '@/components/admin/sidebar';
import { validatePublicConfig } from '../../../lib/config';

// Validate config on app initialization
validatePublicConfig();

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar />
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}