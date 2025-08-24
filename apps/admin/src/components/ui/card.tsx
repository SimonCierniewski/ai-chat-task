interface CardProps {
  title?: string;
  description?: string;
  value?: string | number;
  icon?: string;
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
}

export function Card({ title, description, value, icon, className = '', children, onClick }: CardProps) {
  return (
    <div 
      className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 overflow-hidden ${className}`}
      onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
          {description && (
            <p className="text-sm text-gray-500 mt-1">{description}</p>
          )}
          {value !== undefined && (
            <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
          )}
          {children}
        </div>
        {icon && (
          <span className="text-2xl sm:text-3xl flex-shrink-0">{icon}</span>
        )}
      </div>
    </div>
  );
}