import { Icon } from './icons';

export function UserAvatar({
  name,
  avatarUrl,
  className,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  className: string;
}) {
  return (
    <span className={className} aria-hidden="true">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" />
      ) : name ? (
        name[0]?.toUpperCase()
      ) : (
        <Icon name="user" />
      )}
    </span>
  );
}
