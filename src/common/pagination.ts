import { BadRequestException } from "@nestjs/common";

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

interface Positioned {
  id: string;
  created_at: string;
}

export function paginate<T extends Positioned>(
  all: T[],
  limit: number,
  cursor?: string,
): Page<T> {
  const sorted = [...all].sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
  );

  const after = cursor ? decodeCursor(cursor) : undefined;
  const rest = after
    ? sorted.filter(
        (item) =>
          item.created_at < after.created_at ||
          (item.created_at === after.created_at && item.id < after.id),
      )
    : sorted;

  const items = rest.slice(0, limit);
  const last = items.at(-1);
  const hasMore = rest.length > items.length;
  return { items, next_cursor: hasMore && last ? encodeCursor(last) : null };
}

function encodeCursor({ created_at, id }: Positioned): string {
  return Buffer.from(JSON.stringify({ created_at, id })).toString("base64url");
}

function decodeCursor(cursor: string): Positioned {
  try {
    const position = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      typeof position?.created_at === "string" &&
      typeof position?.id === "string"
    ) {
      return position;
    }
  } catch {
    // fall through to the error below
  }
  throw new BadRequestException("Invalid cursor");
}
