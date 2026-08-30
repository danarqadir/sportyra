const isDev = import.meta.env.DEV;
const API_BASE = isDev ? "" : (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");
import type { NewsArticle } from "@workspace/api-client-react";

export type AccountUser = { id: number; name: string; email: string; role: string };

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() || "GET";
  const isStateChanging = method !== "GET" && method !== "HEAD";
  const adminToken = sessionStorage.getItem("sportyra_admin_token");
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(isStateChanging ? { "X-Requested-With": "XMLHttpRequest" } : {}),
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const accountApi = {
  me: () => request<AccountUser>("/api/auth/me"),
  login: (email: string, password: string) => request<AccountUser>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string) => request<AccountUser>("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) => request<void>("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  forgotPassword: (email: string) => request<{ message: string }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => request<{ message: string }>("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  listUsers: () => request<Array<{ id: number; name: string; email: string; role: string; active: boolean; mfaEnabled: boolean; createdAt: string }>>("/api/auth/users"),
  updateUserRole: (id: number, role: string) => request<{ id: number; name: string; email: string; role: string; active: boolean }>("/api/auth/users/" + id + "/role", { method: "PATCH", body: JSON.stringify({ role }) }),
  updateUserActive: (id: number, active: boolean) => request<{ id: number; name: string; email: string; role: string; active: boolean }>("/api/auth/users/" + id + "/active", { method: "PATCH", body: JSON.stringify({ active }) }),
  mfaStatus: () => request<{ enabled: boolean }>("/api/auth/mfa/status"),
  mfaSetup: () => request<{ secret: string; otpauthUrl: string; issuer: string }>("/api/auth/mfa/setup", { method: "POST" }),
  mfaEnable: (code: string) => request<{ enabled: boolean }>("/api/auth/mfa/verify", { method: "POST", body: JSON.stringify({ code }) }),
  mfaAuthenticate: (code: string) => request<{ ok: boolean }>("/api/auth/mfa/authenticate", { method: "POST", body: JSON.stringify({ code }) }),
  mfaDisable: (code: string) => request<{ enabled: boolean }>("/api/auth/mfa/disable", { method: "POST", body: JSON.stringify({ code }) }),
  analyticsSummary: () => request<{ since: string; totals: Array<{ eventType: string; total: number }>; topPages: Array<{ path: string; total: number }>; topArticles: Array<{ articleId: number | null; total: number }>; uniqueVisitors: number; dailyViews: Array<{ date: string; views: number }>; articleSummaries: Array<{ articleId: number | null; title: string | null; views: number }> }>("/api/analytics/summary"),
};

export const followsApi = {
  follow: (entityType: string, entityId: number) => request<{ followed: boolean; alreadyFollowing: boolean }>("/api/follows", { method: "POST", body: JSON.stringify({ entityType, entityId }) }),
  unfollow: (entityType: string, entityId: number) => request<{ unfollowed: boolean; wasFollowing: boolean }>(`/api/follows/${entityType}/${entityId}`, { method: "DELETE" }),
  check: (entityType: string, entityId: number) => request<{ following: boolean }>(`/api/follows/check/${entityType}/${entityId}`),
  count: (entityType: string, entityId: number) => request<{ count: number }>(`/api/follows/${entityType}/${entityId}/count`),
  my: (entityType?: string) => request<{ items: Array<{ id: number; entityType: string; entityId: number; createdAt: string }>; total: number }>(`/api/follows/my${entityType ? `?entityType=${entityType}` : ""}`),
};

let analyticsSession = "";
function getAnalyticsSession() {
  if (analyticsSession) return analyticsSession;
  const stored = localStorage.getItem("sportyra_analytics_session");
  if (stored) return (analyticsSession = stored);
  analyticsSession = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem("sportyra_analytics_session", analyticsSession);
  return analyticsSession;
}

export function trackEvent(eventType: "page_view" | "article_view" | "search" | "newsletter_signup" | "share" | "ad_impression" | "ad_click" | "sponsor_view" | "sponsor_click" | "affiliate_click" | "premium_gate" | "campaign_view" | "campaign_click" | "label_view" | "label_click", path = window.location.pathname, articleId?: number) {
  const params = new URLSearchParams(window.location.search);
  const partnerId = params.get("partnerId");
  const referralCode = params.get("ref") || params.get("referralCode");
  const body = {
    eventType, path, articleId, referrer: document.referrer || undefined,
    sessionId: getAnalyticsSession(),
    partnerId: partnerId ? Number(partnerId) : undefined,
    referralCode: referralCode || undefined,
  };
  void fetch(`${API_BASE}/api/analytics/events`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify(body), keepalive: true }).catch(() => undefined);
}

export function isServiceWorkerSupported() {
  return "serviceWorker" in navigator;
}

export async function registerServiceWorker() {
  if (!isServiceWorkerSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    return registration;
  } catch {
    return null;
  }
}

export async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return null;
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
}

export async function unsubscribeFromPush() {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  await subscription.unsubscribe();
  return subscription;
}

export async function getPushSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export const bookmarksApi = {
  list: () => request<{ items: Array<{ id: number; title: string; description: string; image: string; category: string; slug: string | null; tags: string[]; source: string; author: string; readingTime: number | null; publicationDate: string }>; total: number }>("/api/bookmarks"),
  add: (newsId: number) => request<{ id: number; newsId: number; createdAt: string }>(`/api/bookmarks/${newsId}`, { method: "POST" }),
  remove: (newsId: number) => request<void>(`/api/bookmarks/${newsId}`, { method: "DELETE" }),
  check: (newsId: number) => request<{ bookmarked: boolean }>(`/api/bookmarks/check/${newsId}`),
};

export const commentsApi = {
  list: (newsId: number, parentId?: number, page = 1, pageSize = 50) => request<{ items: Array<{ id: number; userId: number | null; newsId: number; parentId: number | null; body: string; authorName: string; authorEmail: string; reported: boolean; approved: boolean; removed: boolean; createdAt: string }>; page: number; pageSize: number; total: number; totalPages: number }>(`/api/comments/${newsId}${parentId ? `?parent_id=${parentId}` : ""}${parentId ? `&page=${page}&pageSize=${pageSize}` : `?page=${page}&pageSize=${pageSize}`}`),
  create: (newsId: number, data: { body: string; authorName: string; authorEmail: string; parentId?: number }) => request<{ id: number; body: string; authorName: string; createdAt: string }>(`/api/comments/${newsId}`, { method: "POST", body: JSON.stringify(data) }),
  remove: (commentId: number) => request<void>(`/api/comments/${commentId}`, { method: "DELETE" }),
  report: (commentId: number, reason: string) => request<void>(`/api/comments/${commentId}/report`, { method: "POST", body: JSON.stringify({ reason }) }),
  adminList: (reported?: boolean) => request<{ items: Array<{ id: number; newsId: number; body: string; authorName: string; reported: boolean; approved: boolean; removed: boolean; createdAt: string }>; total: number }>(`/api/admin/comments${reported ? "?reported=true" : ""}`),
  adminModerate: (commentId: number, data: { approved?: boolean; removed?: boolean }) => request<void>(`/api/admin/comments/${commentId}`, { method: "PATCH", body: JSON.stringify(data) }),
};

export const fixturesApi = {
  list: (params?: { status?: string; competitionId?: number; teamId?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.competitionId) q.set("competitionId", String(params.competitionId));
    if (params?.teamId) q.set("teamId", String(params.teamId));
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<{ items: Array<{ id: number; homeTeam: { name: string; shortName: string | null; logoUrl: string | null } | null; awayTeam: { name: string; shortName: string | null; logoUrl: string | null } | null; homeScore: number | null; awayScore: number | null; status: string; matchDate: string; venue: string | null; competition: { name: string; slug: string } | null }> }>(`/api/fixtures${qs ? `?${qs}` : ""}`);
  },
  upcoming: () => request<{ items: Array<{ id: number; homeTeam: { name: string; shortName: string | null; logoUrl: string | null } | null; awayTeam: { name: string; shortName: string | null; logoUrl: string | null } | null; homeScore: number | null; awayScore: number | null; status: string; matchDate: string; venue: string | null; competition: { name: string; slug: string } | null }> }>(`/api/fixtures/upcoming`),
  recent: () => request<{ items: Array<{ id: number; homeTeam: { name: string; shortName: string | null; logoUrl: string | null } | null; awayTeam: { name: string; shortName: string | null; logoUrl: string | null } | null; homeScore: number | null; awayScore: number | null; status: string; matchDate: string; venue: string | null; competition: { name: string; slug: string } | null }> }>(`/api/fixtures/recent`),
  competitions: (search?: string) => request<{ items: Array<{ id: number; name: string; slug: string; country: string | null; sport: string; logoUrl: string | null }> }>(`/api/competitions${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  createCompetition: (data: { name: string; slug: string; country?: string; sport?: string; logoUrl?: string }) => request<{ id: number }>(`/api/competitions`, { method: "POST", body: JSON.stringify(data) }),
  teams: (search?: string) => request<{ items: Array<{ id: number; name: string; slug: string; shortName: string | null; logoUrl: string | null; sport: string }> }>(`/api/teams${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  createTeam: (data: { name: string; slug: string; shortName?: string; logoUrl?: string; sport?: string }) => request<{ id: number }>(`/api/teams`, { method: "POST", body: JSON.stringify(data) }),
};

export const notificationsApi = {
  list: (unread?: boolean) => request<{ items: Array<{ id: number; type: string; title: string; message: string; link: string | null; read: boolean; createdAt: string }>; total: number; unreadCount: number }>(`/api/user/notifications${unread ? "?unread=true" : ""}`),
  markRead: (notificationId: number) => request<void>(`/api/user/notifications/${notificationId}/read`, { method: "PATCH" }),
  markAllRead: () => request<void>("/api/user/notifications/read-all", { method: "POST" }),
  count: () => request<{ total: number; unread: number }>("/api/user/notifications/count"),
  preferences: () => request<{ newArticles: boolean; importantNews: boolean; weeklyDigest: boolean; emailNotifications: boolean; pushNotifications: boolean }>("/api/user/notification-preferences"),
  updatePreferences: (prefs: { newArticles?: boolean; importantNews?: boolean; weeklyDigest?: boolean; emailNotifications?: boolean; pushNotifications?: boolean }) => request<void>("/api/user/notification-preferences", { method: "PUT", body: JSON.stringify(prefs) }),
};

export const trendingApi = {
  articles: (limit?: number) => request<Array<{ id: number; title: string; slug: string | null; image: string; category: string; description: string; source: string; author: string; readingTime: number | null; publicationDate: string; tags: string[] }>>(`/api/news/trending${limit ? `?limit=${limit}` : ""}`),
  categories: (limit?: number) => request<Array<{ category: string; views: number }>>(`/api/news/trending/categories${limit ? `?limit=${limit}` : ""}`),
};

export const feedApi = {
  get: (params?: { language?: string; page?: number; pageSize?: number; category?: string; tag?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.language) q.set("language", params.language);
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.category) q.set("category", params.category);
    if (params?.tag) q.set("tag", params.tag);
    if (params?.search) q.set("search", params.search);
    const qs = q.toString();
    return request<{ items: NewsArticle[]; page: number; pageSize: number; total: number; totalPages: number; personalized: boolean }>(`/api/news/feed${qs ? `?${qs}` : ""}`);
  },
};

export const navigationApi = {
  prevNext: (id: number) => request<{ previous: { id: number; title: string; slug: string | null; image: string; publicationDate: string } | null; next: { id: number; title: string; slug: string | null; image: string; publicationDate: string } | null }>(`/api/news/${id}/navigation`),
};

export const moderationApi = {
  report: (targetType: "article" | "comment", targetId: number, reason: string, details?: string) => request<{ id: number; status: string; createdAt: string }>("/api/moderation/report", { method: "POST", body: JSON.stringify({ targetType, targetId, reason, details }) }),
  adminList: (status?: string) => request<{ items: Array<{ id: number; reporterId: number | null; targetType: string; targetId: number; reason: string; status: string; createdAt: string }>; total: number }>(`/api/admin/moderation${status ? `?status=${status}` : ""}`),
  adminReview: (reportId: number, status: "reviewed" | "dismissed", resolution?: string) => request<void>(`/api/admin/moderation/${reportId}`, { method: "PATCH", body: JSON.stringify({ status, resolution }) }),
};

export const auditLogApi = {
  list: (params?: { userId?: number; action?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.userId) q.set("userId", String(params.userId));
    if (params?.action) q.set("action", params.action);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<{ items: Array<{ id: number; userId: number | null; action: string; targetType: string | null; targetId: number | null; details: string | null; createdAt: string }>; total: number }>(`/api/admin/audit-log${qs ? `?${qs}` : ""}`);
  },
};

export const playersApi = {
  list: (params?: { search?: string; position?: string; club?: string; limit?: number; page?: number; pageSize?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.position) q.set("position", params.position);
    if (params?.club) q.set("club", params.club);
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    const qs = q.toString();
    return request<{ items: Array<{ id: number; name: string; slug: string; nationality: string | null; dateOfBirth: string | null; position: string | null; club: string | null; shirtNumber: number | null; photoUrl: string | null; biography: string | null; goals: number; assists: number; appearances: number; minutes: number; yellowCards: number; redCards: number; trophies: string[]; isDemo: boolean }>; total: number; page: number; pageSize: number }>(`/api/players${qs ? `?${qs}` : ""}`);
  },
  get: (slug: string) => request<{ id: number; name: string; slug: string; nationality: string | null; dateOfBirth: string | null; position: string | null; club: string | null; shirtNumber: number | null; photoUrl: string | null; biography: string | null; goals: number; assists: number; appearances: number; minutes: number; yellowCards: number; redCards: number; trophies: string[]; isDemo: boolean }>(`/api/players/${slug}`),
  topScorers: (limit?: number) => {
    const q = new URLSearchParams();
    if (limit) q.set("limit", String(limit));
    const qs = q.toString();
    return request<{ items: Array<{ id: number; name: string; slug: string; nationality: string | null; position: string | null; club: string | null; goals: number; assists: number; appearances: number; minutes: number; yellowCards: number; redCards: number }>; total: number }>(`/api/players/top-scorers${qs ? `?${qs}` : ""}`);
  },
  create: (data: { name: string; slug: string; nationality?: string; dateOfBirth?: string; position?: string; club?: string; shirtNumber?: number; photoUrl?: string; biography?: string; goals?: number; assists?: number; appearances?: number; trophies?: string[] }) => request<{ id: number }>(`/api/players`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Record<string, unknown>) => request<{ id: number }>(`/api/players/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/api/players/${id}`, { method: "DELETE" }),
};

export const matchesApi = {
  list: (params?: { filter?: string; status?: string; search?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.filter) q.set("filter", params.filter);
    if (params?.status) q.set("status", params.status);
    if (params?.search) q.set("search", params.search);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<{ items: Array<{ id: number; homeTeamName: string; awayTeamName: string; homeTeamLogo: string | null; awayTeamLogo: string | null; homeScore: number | null; awayScore: number | null; status: string; minute: number | null; matchDate: string; venue: string | null; competitionName: string | null; competitionLogo: string | null; isDemo: boolean }>; total: number }>(`/api/matches${qs ? `?${qs}` : ""}`);
  },
  get: (id: number) => request<{ id: number; homeTeamName: string; awayTeamName: string; homeTeamLogo: string | null; awayTeamLogo: string | null; homeScore: number | null; awayScore: number | null; status: string; minute: number | null; matchDate: string; venue: string | null; competitionName: string | null; competitionLogo: string | null; events: Array<{ id: number; eventType: string; minute: number | null; playerName: string | null; teamSide: string | null; detail: string | null }>; stats: { possession: unknown; shots: unknown; shotsOnTarget: unknown; corners: unknown; fouls: unknown } | null; lineups: Array<{ teamSide: string; formation: string | null; lineup: unknown }> }>(`/api/matches/${id}`),
  create: (data: { homeTeamName: string; awayTeamName: string; matchDate: string; status?: string; venue?: string; competitionName?: string; homeScore?: number; awayScore?: number; homeTeamLogo?: string; awayTeamLogo?: string; competitionLogo?: string }) => request<{ id: number }>(`/api/matches`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Record<string, unknown>) => request<{ id: number }>(`/api/matches/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/api/matches/${id}`, { method: "DELETE" }),
};

export const transfersApi = {
  list: (params?: { status?: string; club?: string; search?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.club) q.set("club", params.club);
    if (params?.search) q.set("search", params.search);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<{ items: Array<{ id: number; playerName: string; fromClub: string; toClub: string; fee: string | null; status: string; transferType: string | null; transferDate: string | null; source: string | null; confidence: number | null; isDemo: boolean; playerPhoto: string | null; fromClubLogo: string | null; toClubLogo: string | null }>; total: number }>(`/api/transfers${qs ? `?${qs}` : ""}`);
  },
  create: (data: { playerName: string; fromClub: string; toClub: string; fee?: string; status?: string; transferType?: string; transferDate?: string; source?: string; confidence?: number }) => request<{ id: number }>(`/api/transfers`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Record<string, unknown>) => request<{ id: number }>(`/api/transfers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/api/transfers/${id}`, { method: "DELETE" }),
};

export const predictionsApi = {
  submit: (matchId: number, prediction: string, homeScorePred?: number, awayScorePred?: number) => request<{ id: number }>(`/api/predictions`, { method: "POST", body: JSON.stringify({ matchId, prediction, homeScorePred, awayScorePred }) }),
  userPredictions: () => request<{ items: Array<{ id: number; matchId: number; prediction: string; homeScorePred: number | null; awayScorePred: number | null; points: number | null; result: string | null; createdAt: string }> }>(`/api/predictions/me`),
  leaderboard: () => request<{ items: Array<{ id: number; userId: number; username: string; totalPoints: number; correctPredictions: number; totalPredictions: number; position: number }> }>(`/api/leaderboard`),
};

export const standingsApi = {
  get: (league: string) =>
    request<{ league: string; country: string | null; items: Array<{ position: number | null; name: string; slug: string; badge: string | null; played: number | null; won: number | null; drawn: number | null; lost: number | null; goalsFor: number | null; goalsAgainst: number | null; goalDifference: number | null; points: number | null; form: string[]; zone: string }> }>(`/api/team-pages/standings?league=${encodeURIComponent(league)}`),
  leagues: () =>
    request<{ items: Array<{ league: string; country: string; teamCount: number; logoUrl: string | null }> }>("/api/team-pages/leagues"),
};

export const teamPagesApi = {
  list: (params?: { country?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.country) q.set("country", params.country);
    if (params?.search) q.set("search", params.search);
    const qs = q.toString();
    return request<{ items: Array<{ id: number; name: string; slug: string; shortName: string | null; country: string; league: string; badge: string | null; description: string | null; founded: number | null; stadium: string | null; leaguePosition: number | null; isDemo: boolean }>; total: number }>(`/api/team-pages${qs ? `?${qs}` : ""}`);
  },
  get: (slug: string) => request<{ id: number; name: string; slug: string; shortName: string | null; country: string; league: string; badge: string | null; description: string | null; founded: number | null; stadium: string | null; capacity: number | null; leaguePosition: number | null; points: number | null; played: number | null; won: number | null; drawn: number | null; lost: number | null; goalsFor: number | null; goalsAgainst: number | null; isDemo: boolean; squad: Array<{ id: number; name: string; slug: string; nationality: string | null; position: string | null; shirtNumber: number | null; photoUrl: string | null; goals: number; assists: number; appearances: number }>; recentMatches: Array<{ id: number; homeTeamName: string; awayTeamName: string; homeTeamLogo: string | null; awayTeamLogo: string | null; homeScore: number | null; awayScore: number | null; status: string; matchDate: string; venue: string | null; competitionName: string | null }>; upcomingMatches: Array<{ id: number; homeTeamName: string; awayTeamName: string; homeTeamLogo: string | null; awayTeamLogo: string | null; matchDate: string; venue: string | null; competitionName: string | null }>; relatedTransfers: Array<{ id: number; playerName: string; fromClub: string; toClub: string; fee: string | null; status: string; transferDate: string | null; playerPhoto: string | null; fromClubLogo: string | null; toClubLogo: string | null }>; relatedNews: Array<{ id: number; title: string; slug: string | null; image: string; description: string; category: string; author: string; publicationDate: string; tags: string[] }>; form: string[] }>(`/api/team-pages/${slug}`),
  update: (id: number, data: Record<string, unknown>) => request<{ id: number }>(`/api/team-pages/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
};

export type PartnerAnalytics = {
  totalClicks: number;
  uniqueVisitors: number;
  totalPageViews: number;
  dailyClicks: Array<{ date: string; clicks: number; uniqueVisitors: number }>;
  topLinks: Array<{ targetUrl: string; clicks: number; uniqueVisitors: number }>;
  topSources: Array<{ utmSource: string; clicks: number }>;
  topMediums: Array<{ utmMedium: string; clicks: number }>;
  topCampaigns: Array<{ utmCampaign: string; clicks: number }>;
  referralLinks: Array<{ id: number; code: string; targetUrl: string; label: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; clickCount: number; active: boolean; createdAt: string }>;
  dateRange: { from: string; to: string };
};

export type PartnerStats = {
  partnerId: number; name: string; referralCode: string; status: string;
  totalClicks: number; totalEarnings: string; paidEarnings: string; recentClicks: number;
  commissionRate: string; createdAt: string;
  periodClicks: number; periodUniqueVisitors: number; periodEarnings: string;
};

export type AdminPartnerAnalytics = {
  totalPartners: number; activePartners: number; pendingPartners: number; rejectedPartners: number; suspendedPartners: number;
  totalClicks: number; totalEarnings: string; totalPaid: string;
  periodClicks: number; periodUniqueVisitors: number; periodRegistrations: number;
  dailyOverview: Array<{ date: string; clicks: number; uniqueVisitors: number }>;
  topPartners: Array<{ id: number; name: string; referralCode: string; totalClicks: number; totalEarnings: string }>;
  dateRange: { from: string; to: string };
};

function dateRangeParams(from?: string, to?: string) {
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export const partnerApi = {
  search: (search?: string, limit?: number) => request<{ items: Array<{ id: number; name: string; bio: string | null; avatar: string | null; website: string | null; totalClicks: number; createdAt: string }>; total: number }>(`/api/partners/search${search ? `?search=${encodeURIComponent(search)}${limit ? `&limit=${limit}` : ""}` : limit ? `?limit=${limit}` : ""}`),
  recordClick: (code: string, data?: { fingerprint?: string; url?: string }) => request<{ ok: boolean; deduplicated?: boolean }>(`/api/ref/${encodeURIComponent(code)}`, { method: "POST", body: JSON.stringify(data || {}) }),
  me: () => request<any>("/api/partners/me"),
  stats: (from?: string, to?: string) => request<PartnerStats>(`/api/partners/stats${dateRangeParams(from, to)}`),
  clicks: (limit?: number, from?: string, to?: string) => request<{ items: Array<any>; total: number }>(`/api/partners/clicks?limit=${limit || 50}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`),
  earnings: (limit?: number, from?: string, to?: string) => request<{ items: Array<any>; total: string }>(`/api/partners/earnings?limit=${limit || 50}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`),
  analytics: (from?: string, to?: string) => request<PartnerAnalytics>(`/api/partners/analytics${dateRangeParams(from, to)}`),
  referralLinks: () => request<{ items: Array<any>; total: number }>("/api/partners/links"),
  createReferralLink: (targetUrl: string, label?: string, utmSource?: string, utmMedium?: string, utmCampaign?: string) => request<any>("/api/partners/referral-link", { method: "POST", body: JSON.stringify({ targetUrl, label, utmSource, utmMedium, utmCampaign }) }),
  updateLink: (id: number, data: { active?: boolean; label?: string }) => request<any>(`/api/partners/links/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  apply: (data: { name: string; email: string; website?: string; bio?: string; avatar?: string; facebook?: string; instagram?: string; tiktok?: string; youtube?: string; phone?: string; address?: string }) => request<{ message: string; partnerId: number; referralCode: string }>("/api/partners/apply", { method: "POST", body: JSON.stringify(data) }),
  getPartner: (identifier: string) => request<any>(`/api/partners/${identifier}`),
  getPartnerArticles: (identifier: string, params?: { page?: number; pageSize?: number }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    const qs = q.toString();
    return request<{ partnerId: number; partnerName: string; partnerAvatar: string | null; page: number; pageSize: number; total: number; totalPages: number; items: Array<any> }>(`/api/partners/${identifier}/articles${qs ? `?${qs}` : ""}`);
  },
  updatePartnerProfile: (data: { bio?: string; avatar?: string; facebook?: string; instagram?: string; tiktok?: string; youtube?: string; phone?: string; address?: string }) => request<any>("/api/partners/me", { method: "PATCH", body: JSON.stringify(data) }),
  listArticles: (params?: { page?: number; pageSize?: number; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.status) q.set("status", params.status);
    const qs = q.toString();
    return request<{ items: Array<any>; page: number; pageSize: number; total: number; totalPages: number }>(`/api/partner/news${qs ? `?${qs}` : ""}`);
  },
  getArticle: (id: number) => request<any>(`/api/partner/news/${id}`),
  createArticle: (data: { title: string; description: string; body?: string; image: string; category: string; language: string; source: string; tags?: string[]; slug?: string; metaTitle?: string; metaDescription?: string; publicationDate?: string }) => request<any>("/api/partner/news", { method: "POST", body: JSON.stringify(data) }),
  updateArticle: (id: number, data: Record<string, unknown>) => request<any>(`/api/partner/news/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  submitArticle: (id: number) => request<any>(`/api/partner/news/${id}/submit`, { method: "POST" }),
  deleteArticle: (id: number) => request<void>(`/api/partner/news/${id}`, { method: "DELETE" }),
};

export const adminPartnerApi = {
  list: (limit?: number) => request<{ items: Array<any>; total: number }>(`/api/admin/partners${limit ? `?limit=${limit}` : ""}`),
  create: (data: { name: string; email: string; website?: string; bio?: string; avatar?: string; facebook?: string; instagram?: string; tiktok?: string; youtube?: string; phone?: string; address?: string; commission_rate?: string; status?: string }) => request<any>("/api/admin/partners", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Record<string, unknown>) => request<any>(`/api/admin/partners/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  approve: (id: number) => request<any>(`/api/admin/partners/${id}/approve`, { method: "POST" }),
  reject: (id: number, reason?: string) => request<any>(`/api/admin/partners/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
  suspend: (id: number, reason?: string) => request<any>(`/api/admin/partners/${id}/suspend`, { method: "POST", body: JSON.stringify({ reason }) }),
  reactivate: (id: number) => request<any>(`/api/admin/partners/${id}/reactivate`, { method: "POST" }),
  stats: (from?: string, to?: string) => request<AdminPartnerAnalytics>(`/api/admin/partners/stats${dateRangeParams(from, to)}`),
  clicks: (id: number, limit?: number, from?: string, to?: string) => request<{ items: Array<any>; total: number }>(`/api/admin/partners/${id}/clicks?limit=${limit || 50}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`),
  earnings: (id: number, limit?: number, from?: string, to?: string) => request<{ items: Array<any>; total: number }>(`/api/admin/partners/${id}/earnings?limit=${limit || 50}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`),
  payout: (partnerId: number, amount: string, method?: string, notes?: string) => request<any>("/api/admin/partners/payouts", { method: "POST", body: JSON.stringify({ partnerId, amount, method, notes }) }),
};

export const adminReviewApi = {
  listReviews: (params?: { status?: string; page?: number; pageSize?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    const qs = q.toString();
    return request<{ items: Array<any>; page: number; total: number; totalPages: number }>(`/api/admin/news/reviews${qs ? `?${qs}` : ""}`);
  },
  approve: (id: number) => request<any>(`/api/admin/news/${id}/approve`, { method: "POST" }),
  reject: (id: number, reviewNote?: string) => request<any>(`/api/admin/news/${id}/reject`, { method: "POST", body: JSON.stringify({ reviewNote }) }),
};

export const contentLabelsApi = {
  list: (params?: { page?: number; pageSize?: number; labelType?: string; activeOnly?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.labelType) q.set("labelType", params.labelType);
    if (params?.activeOnly) q.set("activeOnly", "true");
    const qs = q.toString();
    return request<{ items: Array<{ id: number; newsId: number | null; labelType: string; label: string | null; url: string | null; metadata: any; startsAt: string | null; expiresAt: string | null; active: boolean; partnerId: number | null; campaignId: number | null; createdBy: number | null; createdAt: string; updatedAt: string }>; total: number; page: number; pageSize: number; totalPages: number }>(`/api/admin/content-labels${qs ? `?${qs}` : ""}`);
  },
  forArticle: (newsId: number) => request<{ items: Array<{ id: number; newsId: number | null; labelType: string; label: string | null; url: string | null; metadata: any; active: boolean; partnerId: number | null; campaignId: number | null }> }>(`/api/content-labels/${newsId}`),
  create: (data: { newsId?: number; labelType: string; label?: string; url?: string; active?: boolean; partnerId?: number; campaignId?: number; startsAt?: string; expiresAt?: string; metadata?: any }) => request<any>("/api/admin/content-labels", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Record<string, unknown>) => request<any>(`/api/admin/content-labels/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/api/admin/content-labels/${id}`, { method: "DELETE" }),
};

export const adsApi = {
  list: (params?: { page?: number; pageSize?: number; location?: string; activeOnly?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.location) q.set("location", params.location);
    if (params?.activeOnly) q.set("activeOnly", "true");
    const qs = q.toString();
    return request<{ items: Array<{ id: number; name: string; slot: string | null; location: string; adType: string; priority: number; active: boolean; width: number | null; height: number | null; targetUrl: string | null; imageUrl: string | null; altText: string | null; impressions: number; clicks: number; partnerId: number | null; campaignId: number | null; startsAt: string | null; expiresAt: string | null; createdBy: number | null; createdAt: string; updatedAt: string }>; total: number; page: number; pageSize: number; totalPages: number }>(`/api/admin/ads${qs ? `?${qs}` : ""}`);
  },
  placements: (location: string) => request<{ items: Array<{ id: number; name: string; slot: string | null; location: string; adType: string; priority: number; active: boolean; width: number | null; height: number | null; targetUrl: string | null; imageUrl: string | null; altText: string | null; impressions: number; clicks: number; partnerId: number | null; campaignId: number | null }> }>(`/api/ads/placements?location=${encodeURIComponent(location)}`),
  create: (data: { name: string; slot?: string; location: string; adType?: string; priority?: number; active?: boolean; width?: number; height?: number; targetUrl?: string; imageUrl?: string; altText?: string; partnerId?: number; campaignId?: number; startsAt?: string; expiresAt?: string }) => request<any>("/api/admin/ads", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Record<string, unknown>) => request<any>(`/api/admin/ads/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/api/admin/ads/${id}`, { method: "DELETE" }),
  track: (adId: number, eventType: "impression" | "click", sessionId?: string, partnerId?: number, campaignId?: number, articleId?: number) => request<void>("/api/ads/track", { method: "POST", body: JSON.stringify({ adId, eventType, sessionId, partnerId, campaignId, articleId }) }),
  stats: (id: number) => request<{ ad: any; impressions: number; clicks: number; periodImpressions: number; periodClicks: number; ctr: string; dailyEvents: Array<{ date: string; impressions: number; clicks: number }> }>(`/api/admin/ads/${id}/stats`),
};

export const campaignsApi = {
  list: (params?: { page?: number; pageSize?: number; status?: string; type?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.pageSize) q.set("pageSize", String(params.pageSize));
    if (params?.status) q.set("status", params.status);
    if (params?.type) q.set("type", params.type);
    if (params?.search) q.set("search", params.search);
    const qs = q.toString();
    return request<{ items: Array<{ id: number; name: string; description: string | null; type: string; status: string; partnerId: number | null; budget: string | null; spend: string; targetImpressions: number | null; actualImpressions: number; targetClicks: number | null; actualClicks: number; startsAt: string | null; endsAt: string | null; metadata: any; createdBy: number | null; createdAt: string; updatedAt: string }>; total: number; page: number; pageSize: number; totalPages: number }>(`/api/admin/campaigns${qs ? `?${qs}` : ""}`);
  },
  stats: () => request<{ statusCounts: Array<{ status: string; total: number }>; typeCounts: Array<{ type: string; total: number }>; totalBudget: string; totalSpend: string; totalImpressions: number; totalClicks: number }>("/api/admin/campaigns/stats"),
  get: (id: number) => request<any>(`/api/admin/campaigns/${id}`),
  create: (data: { name: string; description?: string; type?: string; status?: string; partnerId?: number; budget?: string; targetImpressions?: number; targetClicks?: number; startsAt?: string; endsAt?: string; metadata?: any }) => request<any>("/api/admin/campaigns", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Record<string, unknown>) => request<any>(`/api/admin/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/api/admin/campaigns/${id}`, { method: "DELETE" }),
};

export const monetizationApi = {
  track: (eventType: string, articleId?: number, adId?: number, partnerId?: number, campaignId?: number, metadata?: any) => {
    const sessionId = getAnalyticsSession();
    void fetch(`${API_BASE}/api/monetization/events`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify({ eventType, articleId, adId, partnerId, campaignId, sessionId, metadata }), keepalive: true }).catch(() => undefined);
  },
  summary: (days?: number) => request<{ since: string; eventTypeTotals: Array<{ eventType: string; total: number }>; dailyTrends: Array<{ date: string; eventType: string; total: number }>; topArticles: Array<{ articleId: number | null; total: number }>; topPartners: Array<{ partnerId: number | null; total: number }> }>(`/api/admin/monetization/summary${days ? `?days=${days}` : ""}`),
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
