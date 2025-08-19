interface CardProps {
  title: string;
  description?: string;
  value?: string | number;
  icon?: string;
  className?: string;
  children?: React.ReactNode;
}

export function Card({ title, description, value, icon, className = '', children }: CardProps) {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {description && (
            <p className="text-sm text-gray-500 mt-1">{description}</p>
          )}
          {value !== undefined && (
            <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
          )}
          {children}
        </div>
        {icon && (
          <span className="text-3xl ml-4">{icon}</span>
        )}
      </div>
    </div>
  );
}