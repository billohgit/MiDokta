import type { Person } from "./shared";

export default function Avatar({ person, size = 108, online }: { person: Person; size?: number; online?: boolean }) {
  const initials = `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`.toUpperCase();

  return (
    <div className="avatar-wrap" style={{ width: size, height: size }}>
      {person.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.avatarUrl} alt={initials} className="avatar-img" />
      ) : (
        <div className="avatar-initials" style={{ fontSize: size * 0.28 }}>
          {initials}
        </div>
      )}
      {online && <span className="avatar-dot" />}
    </div>
  );
}
