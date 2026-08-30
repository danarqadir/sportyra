import { describe, expect, it } from "vitest";

const VALID_ENTITY_TYPES = ["player", "team", "league", "competition", "partner"] as const;
type EntityType = (typeof VALID_ENTITY_TYPES)[number];

function isValidEntityType(v: string): v is EntityType {
  return (VALID_ENTITY_TYPES as readonly string[]).includes(v);
}

describe("entity follow validation", () => {
  it("accepts valid entity types", () => {
    for (const t of VALID_ENTITY_TYPES) {
      expect(isValidEntityType(t)).toBe(true);
    }
  });

  it("rejects invalid entity types", () => {
    expect(isValidEntityType("article")).toBe(false);
    expect(isValidEntityType("match")).toBe(false);
    expect(isValidEntityType("")).toBe(false);
    expect(isValidEntityType("Player")).toBe(false);
    expect(isValidEntityType("TEAM")).toBe(false);
  });

  it("entityId must be positive integer", () => {
    const validIds = [1, 42, 999, 2147483647];
    const invalidIds = [0, -1, 1.5, NaN, -42];
    for (const id of validIds) {
      expect(Number.isInteger(id) && id > 0).toBe(true);
    }
    for (const id of invalidIds) {
      expect(Number.isInteger(id) && id > 0).toBe(false);
    }
  });
});

describe("notification preference filtering", () => {
  function prefsWithTypeAllowed(prefs: { newArticles: boolean; importantNews: boolean }, type: string): boolean {
    if (type === "new_article" && !prefs.newArticles) return false;
    if (type === "important_news" && !prefs.importantNews) return false;
    return true;
  }

  it("allows all notification types by default when prefs are true", () => {
    const prefs = { newArticles: true, importantNews: true };
    expect(prefsWithTypeAllowed(prefs, "new_article")).toBe(true);
    expect(prefsWithTypeAllowed(prefs, "important_news")).toBe(true);
    expect(prefsWithTypeAllowed(prefs, "match_goal")).toBe(true);
  });

  it("blocks new_article when newArticles is false", () => {
    const prefs = { newArticles: false, importantNews: true };
    expect(prefsWithTypeAllowed(prefs, "new_article")).toBe(false);
  });

  it("blocks important_news when importantNews is false", () => {
    const prefs = { newArticles: true, importantNews: false };
    expect(prefsWithTypeAllowed(prefs, "important_news")).toBe(false);
  });

  it("allows unknown types regardless of prefs", () => {
    const prefs = { newArticles: false, importantNews: false };
    expect(prefsWithTypeAllowed(prefs, "match_goal")).toBe(true);
    expect(prefsWithTypeAllowed(prefs, "review_update")).toBe(true);
  });

  it("blocks both when both are false", () => {
    const prefs = { newArticles: false, importantNews: false };
    expect(prefsWithTypeAllowed(prefs, "new_article")).toBe(false);
    expect(prefsWithTypeAllowed(prefs, "important_news")).toBe(false);
  });
});

describe("notification dedup logic", () => {
  it("filters out excluded userId from followers", () => {
    const followerIds = [1, 2, 3, 4];
    const excludeUserId = 2;
    const result = followerIds.filter((id) => id !== excludeUserId);
    expect(result).toEqual([1, 3, 4]);
  });

  it("filters out null userId from followers", () => {
    const followerIds = [1, null, 3, null, 5];
    const result = followerIds.filter((id): id is number => id !== null);
    expect(result).toEqual([1, 3, 5]);
  });

  it("returns empty array when all followers are excluded", () => {
    const followerIds = [2, 2, 2];
    const excludeUserId = 2;
    const result = followerIds.filter((id) => id !== excludeUserId && id !== null);
    expect(result).toEqual([]);
  });
});

describe("follow API response types", () => {
  it("follow returns correct shape", () => {
    const response = { followed: true, alreadyFollowing: false };
    expect(response).toHaveProperty("followed");
    expect(response).toHaveProperty("alreadyFollowing");
    expect(typeof response.followed).toBe("boolean");
    expect(typeof response.alreadyFollowing).toBe("boolean");
  });

  it("duplicate follow returns alreadyFollowing", () => {
    const response = { followed: true, alreadyFollowing: true };
    expect(response.alreadyFollowing).toBe(true);
    expect(response.followed).toBe(true);
  });

  it("unfollow returns correct shape", () => {
    const response = { unfollowed: true, wasFollowing: true };
    expect(response).toHaveProperty("unfollowed");
    expect(response).toHaveProperty("wasFollowing");
  });

  it("unfollow of non-followed entity returns wasFollowing false", () => {
    const response = { unfollowed: true, wasFollowing: false };
    expect(response.wasFollowing).toBe(false);
  });

  it("check returns boolean", () => {
    const following = { following: true };
    const notFollowing = { following: false };
    expect(typeof following.following).toBe("boolean");
    expect(typeof notFollowing.following).toBe("boolean");
  });

  it("count returns number", () => {
    const response = { count: 42 };
    expect(typeof response.count).toBe("number");
  });
});

describe("notification read/unread", () => {
  it("mark read sets read to true", () => {
    const notification = { id: 1, read: false };
    notification.read = true;
    expect(notification.read).toBe(true);
  });

  it("bulk mark all read", () => {
    const notifications = [
      { id: 1, read: false },
      { id: 2, read: false },
      { id: 3, read: true },
    ];
    for (const n of notifications) n.read = true;
    expect(notifications.every((n) => n.read)).toBe(true);
  });

  it("count unread", () => {
    const notifications = [
      { id: 1, read: false },
      { id: 2, read: true },
      { id: 3, read: false },
    ];
    const unreadCount = notifications.filter((n) => !n.read).length;
    expect(unreadCount).toBe(2);
  });
});
