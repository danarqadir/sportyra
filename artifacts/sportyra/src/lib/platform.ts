const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");

export type AccountUser = { id: number; name: string; email: string; role: string };

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() || "GET";
  const isStateChanging = method !== "GET" && method !== "HEAD";
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(isStateChanging ? { "X-Requested-With": "XMLHttpRequest" } : {}),
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
  listUsers: () => request<Array<{ id: number; name: string; email: string; role: string; active: boolean; createdAt: string }>>("/api/auth/users"),
  updateUserRole: (id: number, role: string) => request<{ id: number; name: string; email: string; role: string; active: boolean }>("/api/auth/users/" + id + "/role", { method: "PATCH", body: JSON.stringify({ role }) }),
  updateUserActive: (id: number, active: boolean) => request<{ id: number; name: string; email: string; role: string; active: boolean }>("/api/auth/users/" + id + "/active", { method: "PATCH", body: JSON.stringify({ active }) }),
  analyticsSummary: () => request<{ since: string; totals: Array<{ eventType: string; total: number }>; topPages: Array<{ path: string; total: number }>; topArticles: Array<{ articleId: number | null; total: number }>; uniqueVisitors: number; dailyViews: Array<{ date: string; views: number }>; articleSummaries: Array<{ articleId: number | null; title: string | null; views: number }> }>("/api/analytics/summary"),
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

export function trackEvent(eventType: "page_view" | "article_view" | "search" | "newsletter_signup" | "share", path = window.location.pathname, articleId?: number) {
  const body = { eventType, path, articleId, referrer: document.referrer || undefined, sessionId: getAnalyticsSession() };
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
  list: (newsId: number, parentId?: number) => request<Array<{ id: number; userId: number | null; newsId: number; parentId: number | null; body: string; authorName: string; authorEmail: string; reported: boolean; approved: boolean; removed: boolean; createdAt: string }>>(`/api/comments/${newsId}${parentId ? `?parent_id=${parentId}` : ""}`),
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
    return request<Array<{ id: number; homeTeam: { name: string; shortName: string | null; logoUrl: string | null } | null; awayTeam: { name: string; shortName: string | null; logoUrl: string | null } | null; homeScore: number | null; awayScore: number | null; status: string; matchDate: string; venue: string | null; competition: { name: string; slug: string } | null }>>(`/api/fixtures${qs ? `?${qs}` : ""}`);
  },
  upcoming: () => request<Array<{ id: number; homeTeam: { name: string; shortName: string | null; logoUrl: string | null } | null; awayTeam: { name: string; shortName: string | null; logoUrl: string | null } | null; homeScore: number | null; awayScore: number | null; status: string; matchDate: string; venue: string | null; competition: { name: string; slug: string } | null }>>("/api/fixtures/upcoming"),
  recent: () => request<Array<{ id: number; homeTeam: { name: string; shortName: string | null; logoUrl: string | null } | null; awayTeam: { name: string; shortName: string | null; logoUrl: string | null } | null; homeScore: number | null; awayScore: number | null; status: string; matchDate: string; venue: string | null; competition: { name: string; slug: string } | null }>>("/api/fixtures/recent"),
  competitions: () => request<{ items: Array<{ id: number; name: string; slug: string; country: string | null; sport: string; logoUrl: string | null }> }>("/api/competitions"),
  teams: (search?: string) => request<Array<{ id: number; name: string; slug: string; shortName: string | null; logoUrl: string | null; sport: string }>>(`/api/teams${search ? `?search=${encodeURIComponent(search)}` : ""}`),
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

export const navigationApi = {
  prevNext: (id: number) => request<{ previous: { id: number; title: string; slug: string | null; image: string; publicationDate: string } | null; next: { id: number; title: string; slug: string | null; image: string; publicationDate: string } | null }>(`/api/news/${id}/navigation`),
};

export const moderationApi = {
  report: (targetType: "article" | "comment", targetId: number, reason: string, details?: string) => request<{ id: number; status: string; createdAt: string }>("/api/moderation/report", { method: "POST", body: JSON.stringify({ targetType, targetId, reason, details }) }),
  adminList: (status?: string) => request<{ items: Array<{ id: number; reporterId: number | null; targetType: string; targetId: number; reason: string; status: string; createdAt: string }>; total: number }>(`/api/admin/moderation${status ? `?status=${status}` : ""}`),
  adminReview: (reportId: number, status: "reviewed" | "dismissed", resolution?: string) => request<void>(`/api/admin/moderation/${reportId}`, { method: "PATCH", body: JSON.stringify({ status, resolution }) }),
};

export const playersApi = {
  list: (params?: { search?: string; position?: string; club?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.position) q.set("position", params.position);
    if (params?.club) q.set("club", params.club);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<{ items: Array<{ id: number; name: string; slug: string; nationality: string | null; dateOfBirth: string | null; position: string | null; club: string | null; shirtNumber: number | null; photoUrl: string | null; biography: string | null; goals: number; assists: number; appearances: number; trophies: string[]; isDemo: boolean }>; total: number }>(`/api/players${qs ? `?${qs}` : ""}`);
  },
  get: (slug: string) => request<{ id: number; name: string; slug: string; nationality: string | null; dateOfBirth: string | null; position: string | null; club: string | null; shirtNumber: number | null; photoUrl: string | null; biography: string | null; goals: number; assists: number; appearances: number; trophies: string[]; isDemo: boolean }>(`/api/players/${slug}`),
};

export const matchesApi = {
  list: (params?: { filter?: string; status?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.filter) q.set("filter", params.filter);
    if (params?.status) q.set("status", params.status);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<{ items: Array<{ id: number; homeTeamName: string; awayTeamName: string; homeTeamLogo: string | null; awayTeamLogo: string | null; homeScore: number | null; awayScore: number | null; status: string; minute: number | null; matchDate: string; venue: string | null; competitionName: string | null; competitionLogo: string | null; isDemo: boolean }>; total: number }>(`/api/matches${qs ? `?${qs}` : ""}`);
  },
  get: (id: number) => request<{ id: number; homeTeamName: string; awayTeamName: string; homeScore: number | null; awayScore: number | null; status: string; minute: number | null; matchDate: string; venue: string | null; competitionName: string | null; events: Array<{ id: number; eventType: string; minute: number | null; playerName: string | null; teamSide: string | null; detail: string | null }>; stats: { possession: unknown; shots: unknown; shotsOnTarget: unknown; corners: unknown; fouls: unknown } | null; lineups: Array<{ teamSide: string; formation: string | null; lineup: unknown }> }>(`/api/matches/${id}`),
};

export const transfersApi = {
  list: (params?: { status?: string; club?: string; search?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.club) q.set("club", params.club);
    if (params?.search) q.set("search", params.search);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request<{ items: Array<{ id: number; playerName: string; fromClub: string; toClub: string; fee: string | null; status: string; transferType: string | null; transferDate: string | null; source: string | null; confidence: number | null; isDemo: boolean }>; total: number }>(`/api/transfers${qs ? `?${qs}` : ""}`);
  },
};

export const predictionsApi = {
  submit: (userId: number, matchId: number, prediction: string, homeScorePred?: number, awayScorePred?: number) => request<{ id: number }>(`/api/predictions`, { method: "POST", body: JSON.stringify({ userId, matchId, prediction, homeScorePred, awayScorePred }) }),
  userPredictions: (userId: number) => request<{ items: Array<{ id: number; matchId: number; prediction: string; homeScorePred: number | null; awayScorePred: number | null; points: number | null; result: string | null; createdAt: string }> }>(`/api/predictions/user/${userId}`),
  leaderboard: () => request<{ items: Array<{ id: number; userId: number; username: string; totalPoints: number; correctPredictions: number; totalPredictions: number; position: number }> }>(`/api/leaderboard`),
};

export const standingsApi = {
  get: (league: string) =>
    request<{ league: string; country: string | null; items: Array<{ position: number | null; name: string; slug: string; badge: string | null; played: number | null; won: number | null; drawn: number | null; lost: number | null; goalsFor: number | null; goalsAgainst: number | null; goalDifference: number | null; points: number | null; form: string[]; zone: string }> }>(`/api/team-pages/standings?league=${encodeURIComponent(league)}`),
  leagues: () =>
    request<{ items: Array<{ league: string; country: string; teamCount: number }> }>("/api/team-pages/leagues"),
};

export const teamPagesApi = {
  list: (params?: { country?: string; search?: string }) => {
    const q = new URLSearchParams();
    if (params?.country) q.set("country", params.country);
    if (params?.search) q.set("search", params.search);
    const qs = q.toString();
    return request<{ items: Array<{ id: number; name: string; slug: string; shortName: string | null; country: string; league: string; badge: string | null; description: string | null; founded: number | null; stadium: string | null; leaguePosition: number | null; isDemo: boolean }>; total: number }>(`/api/team-pages${qs ? `?${qs}` : ""}`);
  },
  get: (slug: string) => request<{ id: number; name: string; slug: string; shortName: string | null; country: string; league: string; badge: string | null; description: string | null; founded: number | null; stadium: string | null; capacity: number | null; leaguePosition: number | null; points: number | null; played: number | null; won: number | null; drawn: number | null; lost: number | null; goalsFor: number | null; goalsAgainst: number | null; isDemo: boolean; squad: Array<{ id: number; name: string; slug: string; nationality: string | null; position: string | null; shirtNumber: number | null; goals: number; assists: number; appearances: number }>; recentMatches: Array<{ id: number; homeTeamName: string; awayTeamName: string; homeScore: number | null; awayScore: number | null; status: string; matchDate: string; venue: string | null; competitionName: string | null }>; upcomingMatches: Array<{ id: number; homeTeamName: string; awayTeamName: string; matchDate: string; venue: string | null; competitionName: string | null }>; relatedTransfers: Array<{ id: number; playerName: string; fromClub: string; toClub: string; fee: string | null; status: string; transferDate: string | null }>; relatedNews: Array<{ id: number; title: string; slug: string | null; image: string; description: string; category: string; author: string; publicationDate: string; tags: string[] }>; form: string[] }>(`/api/team-pages/${slug}`),
};

export const partnerApi = {
  recordClick: (code: string, data?: { fingerprint?: string; url?: string }) => request<{ ok: boolean; deduplicated?: boolean }>(`/api/ref/${encodeURIComponent(code)}`, { method: "POST", body: JSON.stringify(data || {}) }),
  me: () => request<any>("/api/partners/me"),
  stats: () => request<{ partnerId: number; name: string; referralCode: string; status: string; totalClicks: number; totalEarnings: string; paidEarnings: string; recentClicks: number; commissionRate: string; createdAt: string }>("/api/partners/stats"),
  clicks: (limit?: number) => request<{ items: Array<any>; total: number }>(`/api/partners/clicks${limit ? `?limit=${limit}` : ""}`),
  earnings: (limit?: number) => request<{ items: Array<any>; total: string }>(`/api/partners/earnings${limit ? `?limit=${limit}` : ""}`),
  createReferralLink: (targetUrl: string, label?: string) => request<any>("/api/partners/referral-link", { method: "POST", body: JSON.stringify({ targetUrl, label }) }),
};

export const adminPartnerApi = {
  list: (limit?: number) => request<{ items: Array<any>; total: number }>(`/api/admin/partners${limit ? `?limit=${limit}` : ""}`),
  create: (data: { name: string; email: string; website?: string; social_handle?: string; commission_rate?: string }) => request<any>("/api/admin/partners", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Record<string, unknown>) => request<any>(`/api/admin/partners/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deactivate: (id: number) => request<any>(`/api/admin/partners/${id}/deactivate`, { method: "PATCH" }),
  stats: () => request<{ totalPartners: number; activePartners: number; totalClicks: number; totalEarnings: string; totalPaid: string }>("/api/admin/partners/stats"),
  clicks: (id: number, limit?: number) => request<{ items: Array<any>; total: number }>(`/api/admin/partners/${id}/clicks${limit ? `?limit=${limit}` : ""}`),
  earnings: (id: number, limit?: number) => request<{ items: Array<any>; total: number }>(`/api/admin/partners/${id}/earnings${limit ? `?limit=${limit}` : ""}`),
  payout: (partnerId: number, amount: string, method?: string, notes?: string) => request<any>("/api/admin/partners/payouts", { method: "POST", body: JSON.stringify({ partnerId, amount, method, notes }) }),
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
