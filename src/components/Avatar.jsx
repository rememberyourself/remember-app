import { avatarUrl } from '../utils/api';

const SIZES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-20 h-20 text-2xl',
};

export default function Avatar({ name, avatar, size = 'lg', className = '' }) {
  const sizeClass = SIZES[size] || SIZES.lg;
  const url = avatarUrl(avatar);

  if (url) {
    return (
      <img
        src={url}
        alt={name || ''}
        className={`${sizeClass} rounded-full object-cover border-2 border-forest-600 ${className}`}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-forest-700 flex items-center justify-center border-2 border-forest-600 ${className}`}>
      {name?.charAt(0)?.toUpperCase() || '?'}
    </div>
  );
}
