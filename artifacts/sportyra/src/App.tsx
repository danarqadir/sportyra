import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type React from "react";
import {
  ArrowUpRight, Bell, Check, CheckCircle2, CircleAlert, Clipboard, Facebook, Globe2,
  LayoutDashboard, Link2, LogOut, Menu, Pencil, Plus, Search, Send, Star, Trash2,
  Twitter, Moon, Sun, Users, Eye, BarChart3, Clock, Shield, Key, UserPlus, ChevronDown, X,
  Bookmark, BookmarkCheck, List, ChevronLeft, ChevronRight, MessageSquare, Flag,
  Calendar, MapPin, Trophy, TrendingUp, Filter, ArrowUpDown, RefreshCw, Heart,
  ExternalLink, Hash, AlertTriangle, Settings, FileText, Activity, Wifi, Database,
} from "lucide-react";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { Route, Switch, useLocation } from "wouter";
import { Router as WouterRouter } from "wouter";
import { Toaster, toast } from "sonner";
import {
  createNews, deleteNews, featureNews, getNews, getNewsSummary, getRelatedNews,
  listNews, publishNews, subscribeNewsletter, updateNews, setBaseUrl, setAuthTokenGetter,
} from "@workspace/api-client-react";
import type { NewsArticle, NewsInput } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBoundary } from "@/components/error-boundary";
import { accountApi, trackEvent, request, bookmarksApi, commentsApi, fixturesApi, notificationsApi, trendingApi, navigationApi, moderationApi, playersApi, matchesApi, transfersApi, predictionsApi, teamPagesApi, standingsApi, partnerApi, adminPartnerApi } from "@/lib/platform";
import DOMPurify from "dompurify";
import NotFound from "@/pages/not-found";

type Lang = "en" | "ar" | "ku";
type Category = "football" | "champions-league" | "international" | "basketball" | "tennis" | "motorsport";
type FormState = NewsInput;

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: 1 } },
});
const apiBase = (import.meta.env.VITE_API_BASE_URL || "").trim();
setBaseUrl(apiBase || null);
setAuthTokenGetter(() => sessionStorage.getItem("sportyra_admin_token"));

const categories: { id: Category | string; en: string; ar: string; ku: string; image: string }[] = [
  { id: "football", en: "Football", ar: "كرة القدم", ku: "Fûtbol", image: "/football-editorial.png" },
  { id: "champions-league", en: "Champions League", ar: "دوري الأبطال", ku: "Lîgey Qirazan", image: "/football-editorial.png" },
  { id: "international", en: "International", ar: "الدولية", ku: "Navneteweyî", image: "/football-editorial.png" },
  { id: "basketball", en: "Basketball", ar: "كرة السلة", ku: "Basktelebol", image: "/basketball-editorial.png" },
  { id: "tennis", en: "Tennis", ar: "التنس", ku: "Tenîs", image: "/tennis-editorial.png" },
  { id: "motorsport", en: "Motorsport", ar: "رياضات السيارات", ku: "Sporta motoran", image: "/motorsport-editorial.png" },
];

const copy = {
  en: {
    latest: "Latest news", featured: "Featured news", search: "Search news", noNews: "No published stories yet",
    noNewsText: "The newsroom is ready. Published stories will appear here.", all: "All coverage",
    other: "Other sports", subscribe: "Subscribe", subscribed: "You're on the list", email: "Your email address",
    briefing: "The Sportyra briefing", briefingText: "A smarter way to keep up with sport.", admin: "Newsroom",
    login: "Admin access", token: "Admin token", enter: "Enter newsroom", logout: "Sign out", dashboard: "Dashboard",
    newArticle: "New article", save: "Save article", update: "Update article", cancel: "Cancel", title: "Headline",
    description: "Description", image: "Image", category: "Category", language: "Language", source: "Source",
    author: "Author", date: "Publication date", published: "Published", draft: "Draft", featuredLabel: "Featured",
    actions: "Actions", edit: "Edit", delete: "Delete", publish: "Publish", total: "Total", drafts: "Drafts",
    emptyAdmin: "No articles yet", required: "Please complete all required fields.", verification: "Verification first",
    brandLine: "Independent sports journalism, globally minded.", hero: "The sports desk, without the noise.",
    heroText: "A clear home for verified sports reporting, useful context, and the competitions you follow most.",
    tags: "Tags", upload: "Upload image", uploading: "Uploading…", copyLink: "Copy link", copied: "Copied",
    related: "Related stories", previous: "Previous", next: "Next", sort: "Sort", newest: "Newest first",
    oldest: "Oldest first", titleSort: "Title A–Z", share: "Share", alerts: "Alerts", enableAlerts: "Enable story alerts", alertsEnabled: "Story alerts on", emailError: "Please enter a valid email address.", account: "Account", loginAccount: "Sign in", registerAccount: "Create account", name: "Full name", password: "Password", logoutAccount: "Sign out", accountWelcome: "Your Sportyra account", noAccount: "Don't have an account?", haveAccount: "Already have an account?", register: "Register", signIn: "Sign in", authRequired: "Please sign in to continue.", articleBody: "Article body", readTime: "min read",
    analyticsOverview: "Analytics Overview", uniqueVisitors: "Unique Visitors", pageViews: "Page Views", articleViews: "Article Views", dailyViews: "Daily Views",
    changePassword: "Change Password", currentPassword: "Current password", newPassword: "New password", forgotPassword: "Forgot password?", resetPassword: "Reset Password", resetSent: "Reset link sent (check server logs)", resetToken: "Reset token", submitReset: "Submit Reset", passwordChanged: "Password changed successfully",
    userManagement: "User Management", role: "Role", status: "Status", updateRole: "Update Role",
    darkMode: "Dark mode", lightMode: "Light mode", slug: "URL slug", metaTitle: "SEO title", metaDescription: "SEO description", readingTime: "Reading time",
    trending: "Trending", tableOfContents: "Table of contents", onThisPage: "On this page",
    comments: "Comments", leaveComment: "Leave a comment", commentName: "Name", commentEmail: "Email", commentBody: "Your comment", postComment: "Post comment", commentPosted: "Comment posted", reportComment: "Report", noComments: "No comments yet. Be the first to share your thoughts.",
    savedArticles: "Saved articles", saveArticle: "Save article", articleSaved: "Article saved", articleRemoved: "Article removed", noSavedArticles: "No saved articles yet.",
    fixtures: "Fixtures", upcoming: "Upcoming", recentResults: "Recent results", live: "Live", scheduled: "Scheduled", finished: "Finished", postponed: "Postponed", vs: "vs", noFixtures: "No fixtures available.",
    advancedSearch: "Advanced search", sortBy: "Sort by", filterCategory: "Filter by category", filterDate: "Filter by date", dateFrom: "From", dateTo: "To", searchPlaceholder: "Search articles, authors, tags...",
    notifications: "Notifications", markAllRead: "Mark all as read", noNotifications: "No notifications", unread: "unread",
    moderation: "Moderation", reportArticle: "Report article", reportReason: "Reason", reportDetails: "Details (optional)", submitReport: "Submit report", reportSubmitted: "Report submitted",
    preferences: "Preferences", notificationPrefs: "Notification preferences", newArticleAlerts: "New article alerts", importantAlerts: "Important news alerts", emailAlerts: "Email notifications", pushAlerts: "Push notifications",
    bookmarksTab: "Saved", profileTab: "Profile", settingsTab: "Settings",
    prevArticle: "Previous article", nextArticle: "Next article", updated: "Updated",
    systemHealth: "System health", apiStatus: "API status", dbStatus: "Database status", appStatus: "Application status",
    liveScores: "Live scores", transfers: "Transfers", players: "Players", predictions: "Predictions",
    matchCenter: "Match center", allMatches: "All matches", liveNow: "Live now",
    transferCenter: "Transfer center", confirmed: "Confirmed", rumour: "Rumour", negotiating: "Negotiating", completed: "Completed",
    playerProfiles: "Player profiles", position: "Position", nationality: "Nationality", club: "Club", shirtNumber: "Shirt #",
    goals: "Goals", assists: "Assists", appearances: "Appearances", trophies: "Trophies", biography: "Biography", careerHistory: "Career history",
    makePrediction: "Make prediction", leaderboard: "Leaderboard", yourPredictions: "Your predictions", points: "Points", correct: "Correct",
    predictHome: "Home win", predictDraw: "Draw", predictAway: "Away win", predictionSubmitted: "Prediction submitted!", alreadyPredicted: "Already predicted this match",
    smartTrending: "Trending now", trendingScore: "Trending", scorePrediction: "Score prediction", matchMinute: "min",
    home: "Home", away: "Away", matchStats: "Match statistics", lineups: "Lineups", events: "Events",
    yellowCard: "Yellow card", redCard: "Red card", goal: "Goal", substitution: "Substitution",
    from: "From", to: "To", fee: "Fee", transferType: "Transfer type", permanent: "Permanent", loan: "Loan", free: "Free",
    positionFilter: "Position", goalkeeper: "Goalkeeper", defender: "Defender", midfielder: "Midfielder", forward: "Forward",
    noMatches: "No matches found.", noTransfers: "No transfers found.", noPlayers: "No players found.", noPredictions: "No predictions yet.",
    teams: "Teams", allTeams: "All teams", teamProfile: "Team profile", squad: "Squad", leagueTable: "League position", matchHistory: "Match history", relatedNews: "Related news", relatedTransfers: "Transfers", founded: "Founded", stadium: "Stadium", capacity: "Capacity", country: "Country", league: "League", form: "Form", shirtNo: "#", noTeams: "No teams found.", noSquad: "No squad data available.", demoData: "Demo data",
    standings: "League Standings", pos: "Pos", team: "Team", gd: "GD", pts: "Pts",
    championsLeagueZone: "Champions League", europaLeagueZone: "Europa League",
    conferenceLeagueZone: "Conference League", relegationZone: "Relegation",
    noStandings: "No standings data available.", selectLeague: "Select a league",
    viewStandings: "View standings", mp: "MP", w: "W", d: "D", l: "L", gf: "GF", ga: "GA",
  },
  ar: {
    latest: "أحدث الأخبار", featured: "أبرز الأخبار", search: "البحث في الأخبار", noNews: "لا توجد أخبار منشورة بعد",
    noNewsText: "غرفة الأخبار جاهزة. ستظهر الأخبار المنشورة هنا.", all: "كل التغطية", other: "رياضات أخرى",
    subscribe: "اشترك", subscribed: "تم تسجيلك", email: "بريدك الإلكتروني", briefing: "موجز سبورتيرا",
    briefingText: "طريقة أذكى لمتابعة الرياضة.", admin: "غرفة الأخبار", login: "دخول الإدارة", token: "رمز الإدارة",
    enter: "دخول غرفة الأخبار", logout: "تسجيل الخروج", dashboard: "لوحة التحكم", newArticle: "خبر جديد",
    save: "حفظ الخبر", update: "تحديث الخبر", cancel: "إلغاء", title: "العنوان", description: "الوصف",
    image: "الصورة", category: "القسم", language: "اللغة", source: "المصدر", author: "الكاتب",
    date: "تاريخ النشر", published: "منشور", draft: "مسودة", featuredLabel: "مميز", actions: "الإجراءات",
    edit: "تعديل", delete: "حذف", publish: "نشر", total: "الإجمالي", drafts: "المسودات",
    emptyAdmin: "لا توجد أخبار بعد", required: "يرجى إكمال الحقول المطلوبة.", verification: "التوثيق أولاً",
    brandLine: "صحافة رياضية مستقلة بنظرة عالمية.", hero: "غرفة الرياضة، بلا ضجيج.",
    heroText: "مساحة واضحة للأخبار الرياضية الموثقة والسياق المفيد والبطولات التي تتابعها أكثر.", tags: "الوسوم",
    upload: "رفع صورة", uploading: "جار الرفع…", copyLink: "نسخ الرابط", copied: "تم النسخ", related: "أخبار ذات صلة",
    previous: "السابق", next: "التالي", sort: "ترتيب", newest: "الأحدث أولاً", oldest: "الأقدم أولاً",
    titleSort: "العنوان أ–ي", share: "مشاركة", alerts: "التنبيهات", enableAlerts: "تفعيل تنبيهات الأخبار", alertsEnabled: "تنبيهات الأخبار مفعلة", emailError: "يرجى إدخال بريد إلكتروني صحيح.", account: "الحساب", loginAccount: "تسجيل الدخول", registerAccount: "إنشاء حساب", name: "الاسم الكامل", password: "كلمة المرور", logoutAccount: "تسجيل الخروج", accountWelcome: "حسابك في Sportyra", noAccount: "ليس لديك حساب؟", haveAccount: "لديك حساب بالفعل؟", register: "تسجيل", signIn: "دخول", authRequired: "يرجى تسجيل الدخول للمتابعة.", articleBody: "نص المقال", readTime: "دقيقة قراءة",
    analyticsOverview: "نظرة عامة على التحليلات", uniqueVisitors: "زوار فريدون", pageViews: "مشاهدات الصفحة", articleViews: "مشاهدات المقالات", dailyViews: "المشاهدات اليومية",
    changePassword: "تغيير كلمة المرور", currentPassword: "كلمة المرور الحالية", newPassword: "كلمة المرور الجديدة", forgotPassword: "نسيت كلمة المرور؟", resetPassword: "إعادة تعيين كلمة المرور", resetSent: "تم إرسال رابط إعادة التعيين", resetToken: "رمز إعادة التعيين", submitReset: "إرسال", passwordChanged: "تم تغيير كلمة المرور بنجاح",
    userManagement: "إدارة المستخدمين", role: "الدور", status: "الحالة", updateRole: "تحديث الدور",
    darkMode: "الوضع الداكن", lightMode: "الوضع الفاتح", slug: "رابط URL", metaTitle: "عنوان SEO", metaDescription: "وصف SEO", readingTime: "وقت القراءة",
    trending: "الرائج", tableOfContents: "جدول المحتويات", onThisPage: "على هذه الصفحة",
    comments: "التعليقات", leaveComment: "اترك تعليق", commentName: "الاسم", commentEmail: "البريد الإلكتروني", commentBody: "تعليقك", postComment: "نشر التعليق", commentPosted: "تم نشر التعليق", reportComment: "إبلاغ", noComments: "لا تعليقات بعد. كن أول من يشارك أفكاره.",
    savedArticles: "المقالات المحفوظة", saveArticle: "حفظ المقال", articleSaved: "تم حفظ المقال", articleRemoved: "تمت إزالة المقال", noSavedArticles: "لا توجد مقالات محفوظة بعد.",
    fixtures: "المباريات", upcoming: "القادمة", recentResults: "النتائج الأخيرة", live: "مباشر", scheduled: "مجدول", finished: "منتهي", postponed: "مؤجل", vs: "ضد", noFixtures: "لا توجد مباريات.",
    advancedSearch: "بحث متقدم", sortBy: "ترتيب حسب", filterCategory: "تصفية حسب القسم", filterDate: "تصفية حسب التاريخ", dateFrom: "من", dateTo: "إلى", searchPlaceholder: "ابحث عن مقالات، مؤلفين، وسوم...",
    notifications: "الإشعارات", markAllRead: "تعيين الكل كمقروء", noNotifications: "لا إشعارات", unread: "غير مقروء",
    moderation: "الإشراف", reportArticle: "الإبلاغ عن مقال", reportReason: "السبب", reportDetails: "التفاصيل (اختياري)", submitReport: "إرسال البلاغ", reportSubmitted: "تم إرسال البلاغ",
    preferences: "التفضيلات", notificationPrefs: "تفضيلات الإشعارات", newArticleAlerts: "تنبيهات المقالات الجديدة", importantAlerts: "تنبيهات الأخبار المهمة", emailAlerts: "إشعارات البريد الإلكتروني", pushAlerts: "الإشعارات الفورية",
    bookmarksTab: "المحفوظات", profileTab: "الملف الشخصي", settingsTab: "الإعدادات",
    prevArticle: "المقال السابق", nextArticle: "المقال التالي", updated: "محدث",
    systemHealth: "حالة النظام", apiStatus: "حالة API", dbStatus: "حالة قاعدة البيانات", appStatus: "حالة التطبيق",
    liveScores: "المباريات المباشرة", transfers: "الانتقالات", players: "اللاعبون", predictions: "التنبؤات",
    matchCenter: "مركز المباريات", allMatches: "جميع المباريات", liveNow: "مباشر الآن",
    transferCenter: "مركز الانتقالات", confirmed: "مؤكد", rumour: "شائعة", negotiating: "قيد التفاوض", completed: "مكتمل",
    playerProfiles: "ملفات اللاعبين", position: "المركز", nationality: "الجنسية", club: "النادي", shirtNumber: "رقم القميص",
    goals: "الأهداف", assists: "التمريرات", appearances: "المباريات", trophies: "البطولات", biography: "السيرة الذاتية", careerHistory: "المسيرة المهنية",
    makePrediction: "تنبأ", leaderboard: "المتصدرين", yourPredictions: "تنبؤاتك", points: "النقاط", correct: "صحيحة",
    predictHome: "فوز أصحاب الأرض", predictDraw: "تعادل", predictAway: "فوز الضيوف", predictionSubmitted: "تم إرسال التنبؤ!", alreadyPredicted: "تنبؤت بهذه المباراة بالفعل",
    smartTrending: "الأكثر رواجاً", trendingScore: "الشعبية", scorePrediction: "تنبؤ النتيجة", matchMinute: "دقيقة",
    home: "الأصل", away: "الضيف", matchStats: "إحصائيات المباراة", lineups: "التشكيل", events: "الأحداث",
    yellowCard: "بطاقة صفراء", redCard: "بطاقة حمراء", goal: "هدف", substitution: "تبديل",
    from: "من", to: "إلى", fee: "المبلغ", transferType: "نوع الانتقال", permanent: "دائم", loan: "إعارة", free: "مجاني",
    positionFilter: "المركز", goalkeeper: "حارس مرمى", defender: "مدافع", midfielder: "لاعب وسط", forward: "مهاجم",
    noMatches: "لا توجد مباريات.", noTransfers: "لا توجد انتقالات.", noPlayers: "لا يوجد لاعبون.", noPredictions: "لا تنبؤات بعد.",
    teams: "الفرق", allTeams: "جميع الفرق", teamProfile: "ملف الفريق", squad: "القائمة", leagueTable: "الترتيب في الدوري", matchHistory: "سجل المباريات", relatedNews: "أخبار ذات صلة", relatedTransfers: "الانتقالات", founded: "سنة التأسيس", stadium: "الملعب", capacity: "السعة", country: "الدولة", league: "الدوري", form: "المستوى", shirtNo: "#", noTeams: "لا توجد فرق.", noSquad: "لا تتوفر بيانات القائمة.", demoData: "بيانات تجريبية",
    standings: "ترتيب الفرق", pos: "المركز", team: "الفريق", gd: "ف.أ", pts: "النقاط",
    championsLeagueZone: "دوري الأبطال", europaLeagueZone: "الدوري الأوروبي",
    conferenceLeagueZone: "دوري المؤتمر", relegationZone: "الهبوط",
    noStandings: "لا تتوفر بيانات الترتيب.", selectLeague: "اختر الدوري",
    viewStandings: "عرض الترتيب", mp: "م", w: "ر", d: "ت", l: "خ", gf: "ه.ل", ga: "ه.ع",
  },
  ku: {
    latest: "Newsên din", featured: "Newsên sêwirî", search: "Lêgerîn", noNews: "Hîn newsên weşanî neyê",
    noNewsText: "Odaya nûçeyan amade ye. Newsên weşanî li vir daxwezin.", all: "Hemû berfirehî",
    other: "Wiriyatên din", subscribe: "Abone be", subscribed: "Te qeyd kiriye", email: "Navnîşana emaila te",
    briefing: "Rêkûştina Sportyra", briefingText: "Rêkewiya pir zanîr ji bo şopankirina wiriyatê.", admin: "Odaya nûçeyan",
    login: "Gihiştina admin", token: "Nasnameya admin", enter: "Meke odaya nûçeyan", logout: "Derkev", dashboard: "Dashboard",
    newArticle: "Nûçeke nû", save: "Tomar bike", update: "Nûve bike", cancel: "Betal", title: "Sernivîs",
    description: "Ravekirin", image: "Wêne", category: "Kategorî", language: "Ziman", source: "Çavkanî",
    author: "Nivîskar", date: "Rojê weşanê", published: "Weşandî", draft: "Têkî", featuredLabel: "Sêwirî",
    actions: "Kiryar", edit: "Biguherîne", delete: "Jê bibe", publish: "Weşîne", total: "Hemû", drafts: "Têkî",
    emptyAdmin: "Hîn nûçe tune", required: "Ji kerema xwe hemû qutiyên pêwîst temam bike.", verification: "Piştî tesdîqkirinê",
    brandLine: "Rûnîsînê Sportî ya serbest, di aliyê cîhanê de.", hero: "Masmêkariya wiriyatê, bêdengîyê.",
    heroText: "Derfetek zîn ji bo raporkirina wiriyatê ya piştrexistî, kontekstê faydalî, û turnûyayên ku tu zêdetir şopankirî.",
    tags: "Etîket", upload: "Wêne barke", uploading: "Tê barandin…", copyLink: "Girêdanê kopî bike", copied: "Kopî kiriye",
    related: "Nûçeên belavkirî", previous: "Pêş", next: "Paş", sort: "Rêz bike", newest: "Nûtreten pêş",
    oldest: "Kevnîn pêş", titleSort: "Sernivîs A–Z", share: "Parve bike", alerts: "Hişyarî", enableAlerts: "Hişyariyên nûçeyan çalak bike", alertsEnabled: "Hişyariyên nûçeyan çalak e", emailError: "Ji kerema xwe navnîşana emailê veşartinî binivîse.", account: "Hisab", loginAccount: "Têkev", registerAccount: "Hisab biafirîne", name: "Navê tewîl", password: "Nasname", logoutAccount: "Derkev", accountWelcome: "Hisaba te ya Sportyra", noAccount: "Hisabê te nîne?", haveAccount: "Hisabê te heye?", register: "Qeyd be", signIn: "Têkev", authRequired: "Ji kerema xwe têkeve bo berdewamkirinê.", articleBody: "Body", readTime: "deqîq xwînê",
    analyticsOverview: "Pêşkêştiya analytics", uniqueVisitors: "Sarneşan", pageViews: "Dîtina rûperê", articleViews: "Dîtina nûçeyan", dailyViews: "Dîtina rojane",
    changePassword: "Nasname biguherîne", currentPassword: "Nasname ya niha", newPassword: "Nasnameya nû", forgotPassword: "Nasname forgot?", resetPassword: "Nasnameya nû biguherîne", resetSent: "Girêdana reset hatiye (logên serverê control bike)", resetToken: "Nasnameya reset", submitReset: "Reset bişîne", passwordChanged: "Nasnameya bi ser ket",
    userManagement: "Rêveberiya bikarhêneran", role: "Role", status: "Rewş", updateRole: "Role nûve bike",
    darkMode: "Moda tarîk", lightMode: "Moda ronahî", slug: "URL slug", metaTitle: "Sernivîsa SEO", metaDescription: "Ravekariya SEO", readingTime: "Demê xwînê",
    trending: "Trend", tableOfContents: "Tabloya nivîsê", onThisPage: "Li vir",
    comments: "Şîrove", leaveComment: "Şîroveyê binivîse", commentName: "Nav", commentEmail: "Email", commentBody: "Şîroveya te", postComment: "Şîroveyê weşîne", commentPosted: "Şîroveya hat weşanîn", reportComment: "Rapor bike", noComments: "Hîn şîrove tune. Bûyekî yekem be ku dîtinê pêşkêş bike.",
    savedArticles: "Nûçeyên tomarkirî", saveArticle: "Nûçeyê tomar bike", articleSaved: "Nûçe hatiye tomarkirin", articleRemoved: "Nûçe hatiye jêbirin", noSavedArticles: "Hîn nûçeyên tomarkirî tune.",
    fixtures: "Maç", upcoming: "Li bendê", recentResults: "Encamên dawî", live: "Zindî", scheduled: "Daxuyanî", finished: "Bidiçûn", postponed: "Herak kiriye", vs: "diqile", noFixtures: "Maç tune.",
    advancedSearch: "Lêgerîna pêşketî", sortBy: "Li pelê re", filterCategory: "Kategorî ya pelê", filterDate: "Rojê pelê", dateFrom: "Ji", dateTo: "Hatta", searchPlaceholder: "Lêgerîn nûçe, nivîskar, etîket...",
    notifications: "Dengê", markAllRead: "Hemû wek xwendî nîşan bike", noNotifications: "Deng tune", unread: "ne xwendî",
    moderation: "Destekkirin", reportArticle: "Nûçeyê rapor bike", reportReason: "Aborî", reportDetails: "Kîtek (ixtiyarî)", submitReport: "Rapor bişîne", reportSubmitted: "Rapor hat weşanîn",
    preferences: "Terîx", notificationPrefs: "Terîxên dengê", newArticleAlerts: "Hişyariyên nûçeyên nû", importantAlerts: "Hişyariyên nûçeyên girîng", emailAlerts: "Dengên email", pushAlerts: "Dengên push",
    bookmarksTab: "Tomarkirî", profileTab: "Profîl", settingsTab: "Mîheng",
    prevArticle: "Nûçeya berê", nextArticle: "Nûçeya paş", updated: "Nûve kiriye",
    systemHealth: "Tenduristiya pergala", apiStatus: "Rewşa API", dbStatus: "Rewşa databasê", appStatus: "Rewşa sepanê",
    liveScores: "Maçên zindî", transfers: "Guherîn", players: "Lîkaran", predictions: "Bêjênan",
    matchCenter: "Navenda maçê", allMatches: "Hemû maç", liveNow: "Niha zindî",
    transferCenter: "Navenda guherînê", confirmed: "Bêrewş", rumour: "Qossis", negotiating: "Diaxwere", completed: "Tam kirî",
    playerProfiles: "Profîlên lîkar", position: "Pozîsyon", nationality: "Nijad", club: "Kulîp", shirtNumber: "Hejmarê benîşanê",
    goals: "Gol", assists: "Alîkari", appearances: "Maç", trophies: "Trophî", biography: "Dîrok", careerHistory: "Dîroka karrierê",
    makePrediction: "Bêjêne", leaderboard: "Serenivîsk", yourPredictions: "Bêjênat", points: "Xal", correct: "Rast",
    predictHome: "Beriya xwe bawer bike", predictDraw: "Hêl be", predictAway: "Beriya dawî bawer bike", predictionSubmitted: "Bêjêna te hat ste forkirin!", alreadyPredicted: "Di vê maçê de êdî bêjêna te heye",
    smartTrending: "Trendê niha", trendingScore: "Guhartî", scorePrediction: "PêŞbîna skorê", matchMinute: "deqîqe",
    home: "Dorî", away: "Dawî", matchStats: "Asta maçê", lineups: "Formasyon", events: "Bûyer",
    yellowCard: "Kartê zerî", redCard: "Kartê sor", goal: "Gol", substitution: "Guhertin",
    from: "Ji", to: "Bo", fee: "Bac", transferType: "Çereyê guherînê", permanent: "Mengî", loan: "Qarz", free: "Belaş",
    positionFilter: "Pozîsyon", goalkeeper: "Parêzer", defender: "Bêkesî", midfielder: "Navendî", forward: "Pêşî",
    noMatches: "Maç tune.", noTransfers: "Guherîn tune.", noPlayers: "Lîkar tune.", noPredictions: "Hîn bêjêne tune.",
    teams: "Tîm", allTeams: "Hemû tîm", teamProfile: "Profîla tîmê", squad: "Lîstikvan", leagueTable: "Rewîtina lig li ser lîstikê", matchHistory: "Dîrokê maçan", relatedNews: "Nûçeyên têkildar", relatedTransfers: "Guherîn", founded: "Sala bûyînê", stadium: "Stadyom", capacity: "Tedrûstî", country: "Welat", league: "Lîg", form: "Form", shirtNo: "#", noTeams: "Tîm tune.", noSquad: "Daneyê lîstikvan tune.", demoData: "Daneyê demokezî",
    standings: "Rêzîna Lîgê", pos: "Pozîsyon", team: "Tîm", gd: "F.O", pts: "Xal",
    championsLeagueZone: "Lîgey Qirazan", europaLeagueZone: "Lîgey Ewropayê",
    conferenceLeagueZone: "Lîgey Mûtebêtî", relegationZone: "Danûstîn",
    noStandings: "Daneyê rêzîn tune.", selectLeague: "Lîgêk hilbijêre",
    viewStandings: "Rêzînê binêre", mp: "Maç", w: "K", d: "T", l: "J", gf: "G.L", ga: "G.R",
  },
} as const;

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "story";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/^HTTP \d+ [^:]+:\s*/, "") : "Something went wrong.";
}

function useSeo({ title, description, image, canonical, jsonLd }: {
  title: string; description: string; image?: string; canonical?: string; jsonLd?: Record<string, unknown>;
}) {
  useEffect(() => {
    document.title = title;
    document.documentElement.lang = title.includes("العربية") ? "ar" : "en";
    const setMeta = (selector: string, content: string) => {
      let node = document.head.querySelector<HTMLMetaElement>(selector);
      if (!node) {
        node = document.createElement("meta");
        if (selector.startsWith('meta[name="')) node.name = selector.slice(11, -2);
        else node.setAttribute("property", selector.slice(10, -2));
        document.head.appendChild(node);
      }
      node.content = content;
    };
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:type"]', title.includes("Sportyra News —") ? "website" : "article");
    setMeta('meta[property="og:url"]', canonical || window.location.href);
    if (image) setMeta('meta[property="og:image"]', image);
    if (image) setMeta('meta[name="twitter:image"]', image);
    setMeta('meta[name="twitter:card"]', image ? "summary_large_image" : "summary");
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    let canonicalLink = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalLink) { canonicalLink = document.createElement("link"); canonicalLink.rel = "canonical"; document.head.appendChild(canonicalLink); }
    canonicalLink.href = canonical || window.location.href;
    const old = document.head.querySelector('script[data-sportyra-jsonld]');
    old?.remove();
    if (jsonLd) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.sportyraJsonld = "true";
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }
    return () => { document.head.querySelector('script[data-sportyra-jsonld]')?.remove(); };
  }, [title, description, image, canonical, jsonLd]);
}

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("sportyra_dark");
    if (stored !== null) return stored === "true";
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("sportyra_dark", String(dark));
  }, [dark]);
  return [dark, setDark] as const;
}

function Logo() {
  return <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center bg-[hsl(var(--primary))] font-display text-xl font-bold text-white">S</span><span className="font-display text-2xl font-bold tracking-[-.08em]">sportyra<span className="text-[hsl(var(--primary))]">.</span></span></div>;
}

function DarkModeToggle({ dark, setDark }: { dark: boolean; setDark: (v: boolean) => void }) {
  const t = copy.en;
  return <button onClick={() => setDark(!dark)} title={dark ? t.lightMode : t.darkMode} aria-label={dark ? t.lightMode : t.darkMode} className="hidden h-10 w-10 items-center justify-center border border-[hsl(var(--foreground)/.18)] sm:flex">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>;
}

function NotificationButton({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    setEnabled(true);
    const base = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");
    const stream = new EventSource(`${base}/api/notifications/stream`);
    const handler = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { title: string; url: string };
        const notification = new Notification(payload.title, { body: "New Sportyra story", icon: "/favicon.svg" });
        notification.onclick = () => { window.open(payload.url, "_self"); };
      } catch { /* ignore malformed server events */ }
    };
    stream.addEventListener("new-story", handler as EventListener);
    return () => stream.close();
  }, [enabled]);
  if (typeof Notification === "undefined") return null;
  const enable = async () => {
    const permission = await Notification.requestPermission();
    setEnabled(permission === "granted");
  };
  return <button onClick={enable} title={enabled ? t.alertsEnabled : t.enableAlerts} aria-label={enabled ? t.alertsEnabled : t.enableAlerts} className={`hidden h-10 w-10 items-center justify-center border border-[hsl(var(--foreground)/.18)] sm:flex ${enabled ? "text-[hsl(var(--primary))]" : ""}`}><Bell size={16} /></button>;
}

function Header({ lang, setLang, onSearch, dark, setDark }: { lang: Lang; setLang: (lang: Lang) => void; onSearch: () => void; dark: boolean; setDark: (v: boolean) => void }) {
  const t = copy[lang];
  const [mobileOpen, setMobileOpen] = useState(false);
  return <header className="sticky top-0 z-30 border-b border-[hsl(var(--foreground)/.15)] bg-[hsl(var(--background)/.94)] backdrop-blur-md">
    <div className="mx-auto flex h-[70px] max-w-[1440px] items-center justify-between gap-4 px-5 lg:px-12">
      <a href="/" aria-label="Sportyra"><Logo /></a>
      <nav className="hidden items-center gap-7 lg:flex">{[
        { href: "/#latest", label: t.latest },
        { href: "/#football", label: "Football" },
        { href: "/live-scores", label: t.liveScores },
        { href: "/transfers", label: t.transfers },
        { href: "/players", label: t.players },
        { href: "/predictions", label: t.predictions },
        { href: "/teams", label: t.teams },
        { href: "/standings", label: t.standings },
      ].map((link) =>
        <a key={link.href} href={link.href} className="nav-link text-[11px] font-bold uppercase tracking-[.12em] text-[hsl(var(--foreground)/.75)]">
          {link.label}
        </a>)}</nav>
      <div className="flex items-center gap-2">
        <button onClick={onSearch} className="hidden h-10 w-10 items-center justify-center border border-[hsl(var(--foreground)/.18)] sm:flex" aria-label={t.search}><Search size={17} /></button>
        <a href="/admin" className="hidden h-10 items-center gap-2 border border-[hsl(var(--foreground)/.18)] px-3 text-[10px] font-bold uppercase sm:flex"><LayoutDashboard size={14} />{t.admin}</a><a href="/account" className="hidden h-10 items-center border border-[hsl(var(--foreground)/.18)] px-3 text-[10px] font-bold uppercase sm:flex">{t.account}</a>
        <NotificationButton lang={lang} />
        <DarkModeToggle dark={dark} setDark={setDark} />
        <button onClick={() => setLang(lang === "en" ? "ar" : lang === "ar" ? "ku" : "en")} className="flex h-10 items-center gap-2 border border-[hsl(var(--foreground)/.18)] px-3 text-[11px] font-bold"><Globe2 size={15} />{lang === "en" ? "عربي" : lang === "ar" ? "Ku" : "EN"}</button>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="flex h-10 w-10 items-center justify-center border border-[hsl(var(--foreground)/.18)] lg:hidden" aria-label="Menu"><Menu size={18} /></button>
      </div>
    </div>
    {mobileOpen && <div className="border-t border-[hsl(var(--foreground)/.10)] bg-[hsl(var(--background))] px-5 py-4 lg:hidden">
      <div className="flex flex-col gap-3">
        <button onClick={() => { onSearch(); setMobileOpen(false); }} className="flex items-center gap-2 py-2 text-left text-sm font-bold uppercase"><Search size={15} />{t.search}</button>
        <a href="/live-scores" className="py-2 text-sm font-bold uppercase">{t.liveScores}</a>
        <a href="/transfers" className="py-2 text-sm font-bold uppercase">{t.transfers}</a>
        <a href="/players" className="py-2 text-sm font-bold uppercase">{t.players}</a>
        <a href="/predictions" className="py-2 text-sm font-bold uppercase">{t.predictions}</a>
        <a href="/teams" className="py-2 text-sm font-bold uppercase">{t.teams}</a>
        <a href="/standings" className="py-2 text-sm font-bold uppercase">{t.standings}</a>
        <a href="/admin" className="py-2 text-sm font-bold uppercase">{t.admin}</a>
        <a href="/account" className="py-2 text-sm font-bold uppercase">{t.account}</a>
      </div>
    </div>}
  </header>;
}

function PageNav({ page, totalPages, onChange, lang }: { page: number; totalPages: number; onChange: (page: number) => void; lang: Lang }) {
  if (totalPages < 2) return null;
  const t = copy[lang];
  return <div className="mt-8 flex items-center justify-center gap-2">
    <Button variant="outline" disabled={page === 1} onClick={() => onChange(page - 1)}>{t.previous}</Button>
    <span className="px-3 font-mono-sport text-xs">{page} / {totalPages}</span>
    <Button variant="outline" disabled={page === totalPages} onClick={() => onChange(page + 1)}>{t.next}</Button>
  </div>;
}

function NewsCard({ article, lang, large = false }: { article: NewsArticle; lang: Lang; large?: boolean }) {
  const label = categories.find((category) => category.id === article.category);
  const fallbackSrc = label?.image || "/football-editorial.png";
  const slug = article.slug || slugify(article.title);
  return <a href={`/article/${article.id}/${slug}`} className={`story-card group block overflow-hidden border border-[hsl(var(--foreground)/.12)] bg-[hsl(var(--card))] ${large ? "lg:col-span-2" : ""}`}>
    <div className={`relative overflow-hidden ${large ? "aspect-[16/8]" : "aspect-[16/10]"}`}>
      <img loading="lazy" decoding="async" src={article.image} alt={article.title} className="story-image h-full w-full object-cover" onError={(event) => { const img = event.currentTarget; if (img.src !== fallbackSrc) img.src = fallbackSrc; }} />
      <span className="absolute left-3 top-3 bg-[hsl(var(--accent))] px-2 py-1 font-mono-sport text-[9px] font-bold uppercase">{label?.[lang] || article.category}</span>
    </div>
    <div className="p-5">
      <div className="mb-3 flex items-center gap-2 font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]"><span>{article.source}</span><span>•</span><span>{new Date(article.publicationDate).toLocaleDateString(lang === "ar" ? "ar" : "en-US")}</span>{article.readingTime && <><span>•</span><span>{article.readingTime} {copy[lang].readTime}</span></>}</div>
      <h3 className={`font-display font-bold leading-[1.02] tracking-[-.045em] ${large ? "text-2xl sm:text-3xl lg:text-5xl" : "text-xl sm:text-2xl"}`}>{article.title}</h3>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{article.description}</p>
      {article.tags.length > 0 && <div className="mt-4 flex gap-1.5 overflow-x-auto scrollbar-none">{article.tags.slice(0, 4).map((tag) => <span key={tag} className="flex-shrink-0 border border-[hsl(var(--foreground)/.1)] px-2 py-0.5 font-mono-sport text-[8px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{tag}</span>)}</div>}
    </div>
  </a>;
}

function NewsCardSkeleton({ large = false }: { large?: boolean }) {
  return <div className={`overflow-hidden border border-[hsl(var(--foreground)/.12)] bg-[hsl(var(--card))] ${large ? "lg:col-span-2" : ""}`}>
    <div className={`skeleton ${large ? "aspect-[16/8]" : "aspect-[16/10]"}`} />
    <div className="p-5 space-y-3">
      <div className="skeleton h-3 w-32" />
      <div className={`skeleton ${large ? "h-10 w-3/4" : "h-7 w-2/3"}`} />
      <div className="skeleton h-4 w-full" />
      <div className="skeleton h-4 w-2/3" />
    </div>
  </div>;
}

function AdSlot({ slot = "" }: { slot?: string }) {
  const enabled = import.meta.env.VITE_ADS_ENABLED === "true";
  const client = import.meta.env.VITE_ADSENSE_CLIENT;
  useEffect(() => {
    if (!enabled || !client) return;
    const existing = document.querySelector('script[data-sportyra-ads]');
    if (!existing) {
      const script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.sportyraAds = "true";
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      document.head.appendChild(script);
    }
    try { (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle = (window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle || []; (window as unknown as { adsbygoogle: unknown[] }).adsbygoogle.push({}); } catch { /* provider script may not be ready yet */ }
  }, [enabled, client]);
  if (!enabled || !client) return null;
  return <div className="my-8 overflow-hidden border border-dashed p-3" aria-label="Advertisement"><ins className="adsbygoogle" style={{ display: "block", minHeight: 90 }} data-ad-client={client} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" /></div>;
}

function TagFilter({ tags, activeTag, onSelect, allLabel }: { tags: string[]; activeTag: string; onSelect: (tag: string) => void; allLabel: string }) {
  const [showAll, setShowAll] = useState(false);
  const MAX = 8;
  const visible = showAll ? tags : tags.slice(0, MAX);
  const hidden = tags.length - MAX;
  return <div className="mb-6"><div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none md:flex-wrap md:overflow-visible"><span className="flex-shrink-0 font-mono-sport text-[10px] uppercase opacity-60">Tags</span><button onClick={() => onSelect("")} className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 font-mono-sport text-[9px] uppercase tracking-wide transition ${activeTag === "" ? "border-[hsl(var(--foreground))] bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : "border-[hsl(var(--foreground)/.15)] hover:border-[hsl(var(--foreground)/.4)]"}`}>{allLabel}</button>{visible.map((item) => <button key={item} onClick={() => onSelect(item)} className={`flex-shrink-0 rounded-full border px-2.5 py-0.5 font-mono-sport text-[9px] uppercase tracking-wide transition ${activeTag === item ? "border-[hsl(var(--foreground))] bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : "border-[hsl(var(--foreground)/.15)] hover:border-[hsl(var(--foreground)/.4)]"}`}>{item}</button>)}{!showAll && hidden > 0 && <button onClick={() => setShowAll(true)} className="flex-shrink-0 rounded-full border border-dashed border-[hsl(var(--foreground)/.25)] px-2.5 py-0.5 font-mono-sport text-[9px] uppercase tracking-wide text-[hsl(var(--muted-foreground))] transition hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]">+{hidden} More</button>}{showAll && <button onClick={() => setShowAll(false)} className="flex-shrink-0 rounded-full border border-dashed border-[hsl(var(--foreground)/.25)] px-2.5 py-0.5 font-mono-sport text-[9px] uppercase tracking-wide text-[hsl(var(--muted-foreground))] transition hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]">Less</button>}</div></div>;
}

function Home() {
  const [lang, setLang] = useState<Lang>("en");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [dark, setDark] = useDarkMode();
  const t = copy[lang];
  useSeo({ title: "Sportyra News — Independent sports journalism", description: t.brandLine, jsonLd: { "@context": "https://schema.org", "@type": "NewsMediaOrganization", name: "Sportyra News", url: window.location.origin, logo: `${window.location.origin}/favicon.svg` } });
  useEffect(() => { trackEvent("page_view"); }, []);
  const news = useQuery({
    queryKey: ["public-news", lang, category, tag, query, page],
    queryFn: () => listNews({ language: lang, published: true, category: category || undefined, tag: tag || undefined, search: query || undefined, page, pageSize: 9 }),
  });
  const articles = news.data?.items ?? [];
  const featured = articles.filter((article) => article.featured);
  const lead = featured[0] || articles[0];
  const rest = articles.filter((article) => article.id !== lead?.id);
  const availableTags = [...new Set(articles.flatMap((article) => article.tags))].sort();
  return <div className="sportyra-shell min-h-screen" dir={lang === "ar" ? "rtl" : "ltr"}>
    <Header lang={lang} setLang={setLang} onSearch={() => setSearchOpen(true)} dark={dark} setDark={setDark} />
    <main id="main-content">
      <section className="mx-auto max-w-[1440px] px-5 pb-10 pt-10 lg:px-12 lg:pt-16">
        <div className="mb-8 flex flex-col justify-between gap-5 border-b border-[hsl(var(--foreground)/.18)] pb-5 sm:flex-row sm:items-end">
          <div><p className="mb-3 flex items-center gap-2 font-mono-sport text-[10px] uppercase tracking-[.16em] text-[hsl(var(--primary))]"><span className="h-2 w-2 rounded-full bg-[hsl(var(--primary))]" />{t.verification}</p><h1 className="max-w-5xl font-display text-[clamp(3rem,7vw,6.7rem)] font-bold leading-[.88] tracking-[-.08em]">{t.hero}</h1></div>
          <p className="max-w-xs text-sm leading-6 text-[hsl(var(--muted-foreground))]">{t.brandLine}</p>
        </div>
        {lead ? <div className="grid gap-7 lg:grid-cols-[1.7fr_1fr]"><NewsCard article={lead} lang={lang} large /><aside className="flex flex-col justify-between border-t-4 border-[hsl(var(--primary))] bg-[hsl(var(--secondary))] p-7"><div><p className="font-mono-sport text-[10px] uppercase tracking-[.16em]">SPORTYRA / NEWSROOM</p><h2 className="mt-12 font-display text-4xl font-bold leading-none tracking-[-.06em]">{t.featured}</h2></div><p className="max-w-sm text-sm leading-6 text-[hsl(var(--secondary-foreground)/.75)]">{t.heroText}</p></aside></div>
          : <div className="border border-dashed p-10 text-center"><CircleAlert className="mx-auto mb-4 text-[hsl(var(--primary))]" /><h2 className="font-display text-3xl font-bold">{t.noNews}</h2><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{news.isLoading ? "Loading…" : news.isError ? errorMessage(news.error) : t.noNewsText}</p></div>}
      </section>
      <section id="latest" className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12 lg:py-16">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b-2 border-[hsl(var(--foreground))] pb-4"><div><p className="font-mono-sport text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">02 / Coverage</p><h2 className="font-display text-4xl font-bold tracking-[-.06em]">{t.latest}</h2></div>
          <div className="flex max-w-full flex-wrap gap-2">{[{ id: "", en: t.all, ar: t.all, ku: t.all }, ...categories].map((item) => <button key={item.id} onClick={() => { setCategory(item.id); setPage(1); setTag(""); }} className={`whitespace-nowrap border px-3 py-2 text-[10px] font-bold uppercase ${category === item.id ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white" : ""}`}>{item[lang]}</button>)}</div>
        </div>
        {availableTags.length > 0 && <TagFilter tags={availableTags} activeTag={tag} onSelect={(item) => { setTag(item); setPage(1); }} allLabel={t.all} />}
        {rest.length ? <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{rest.map((article) => <NewsCard key={article.id} article={article} lang={lang} />)}</div> : news.isLoading ? <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <NewsCardSkeleton key={i} />)}</div> : !lead && <div className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noNews}</div>}
        <PageNav page={news.data?.page ?? page} totalPages={news.data?.totalPages ?? 0} onChange={setPage} lang={lang} />
      </section>
      <TrendingSection lang={lang} />
      <FixturesSection lang={lang} />
      <AdSlot slot={import.meta.env.VITE_ADSENSE_HOME_SLOT || ""} />
      <section id="other-sports" className="bg-[hsl(var(--foreground))] py-10 text-[hsl(var(--background))]"><div className="mx-auto max-w-[1440px] px-5 lg:px-12"><div className="flex items-center justify-between gap-4"><h2 className="font-display text-3xl font-bold">{t.other}</h2><span className="font-mono-sport text-[9px] uppercase opacity-60">Live editorial feed</span></div></div></section>
      <section className="mx-auto max-w-[1440px] px-5 py-14 lg:px-12"><div className="relative overflow-hidden bg-[hsl(var(--primary))] p-8 text-white lg:p-14"><div className="relative max-w-2xl"><p className="mb-4 font-mono-sport text-[10px] uppercase">{t.briefing}</p><h2 className="font-display text-4xl font-bold leading-none sm:text-6xl">{t.briefingText}</h2><Newsletter lang={lang} /></div></div></section>
    </main>
    <Footer lang={lang} />{searchOpen && <SearchPanel lang={lang} value={query} setValue={setQuery} onClose={() => setSearchOpen(false)} />}
  </div>;
}

function Newsletter({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const mutation = useMutation({ mutationFn: (data: { email: string }) => subscribeNewsletter(data), onSuccess: () => { setDone(true); trackEvent("newsletter_signup"); } });
  return <form onSubmit={(event) => { event.preventDefault(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error(t.emailError); return; } mutation.mutate({ email }); }} className="mt-8 flex max-w-xl flex-col gap-2 sm:flex-row">
    <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t.email} className="min-h-12 flex-1 border border-white/30 bg-white/10 px-4 text-sm outline-none placeholder:text-white/65" />
    <button disabled={mutation.isPending || done} className="flex min-h-12 items-center justify-center gap-2 bg-[hsl(var(--foreground))] px-5 text-xs font-bold uppercase text-white">{done ? t.subscribed : mutation.isPending ? "…" : t.subscribe}<Send size={15} /></button>
    {mutation.isError && <span className="text-xs text-white">{errorMessage(mutation.error)}</span>}
  </form>;
}

function TrendingSection({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const trending = useQuery({ queryKey: ["trending"], queryFn: () => trendingApi.articles(5) });
  if (!trending.data || trending.data.length === 0) return null;
  return <section className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12 lg:py-16"><div className="border-b-2 border-[hsl(var(--foreground))] pb-4 mb-7 flex items-end justify-between"><div><p className="font-mono-sport text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]"><TrendingUp size={12} className="inline" /> TRENDING</p><h2 className="font-display text-4xl font-bold tracking-[-.06em]">{t.trending}</h2></div></div><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{trending.data.map((article, i) => { const slug = article.slug || slugify(article.title); const label = categories.find((c) => c.id === article.category); return <a key={article.id} href={`/article/${article.id}/${slug}`} className="group flex gap-4 border-b pb-4 last:border-0"><span className="font-display text-4xl font-bold text-[hsl(var(--foreground)/.15)] group-hover:text-[hsl(var(--primary))]">{String(i + 1).padStart(2, "0")}</span><div><div className="flex items-center gap-2 font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]"><span>{label?.[lang] || article.category}</span>{article.readingTime && <><span>•</span><span>{article.readingTime} {t.readTime}</span></>}</div><h3 className="mt-1 font-display text-base font-bold leading-tight group-hover:text-[hsl(var(--primary))]">{article.title}</h3></div></a>; })}</div></section>;
}

function FixturesSection({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const upcoming = useQuery({ queryKey: ["fixtures-upcoming"], queryFn: () => fixturesApi.upcoming() });
  const recent = useQuery({ queryKey: ["fixtures-recent"], queryFn: () => fixturesApi.recent() });
  if (!upcoming.data && !recent.data) return null;
  const formatDate = (d: string) => new Date(d).toLocaleDateString(lang === "ar" ? "ar" : lang === "ku" ? "ku" : "en-US", { weekday: "short", month: "short", day: "numeric" });
  return <section className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12 lg:py-16"><div className="grid gap-8 lg:grid-cols-2">
    <div><div className="border-b-2 border-[hsl(var(--foreground))] pb-4 mb-5"><p className="font-mono-sport text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]"><Calendar size={12} className="inline" /> SCHEDULE</p><h2 className="font-display text-3xl font-bold tracking-[-.06em]">{t.upcoming}</h2></div><div className="space-y-3">{upcoming.data && upcoming.data.length > 0 ? upcoming.data.map((f) => <div key={f.id} className="flex items-center justify-between border-b py-3"><div className="text-center min-w-[80px]"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{formatDate(f.matchDate)}</p><p className="font-mono-sport text-[10px] uppercase font-bold text-[hsl(var(--primary))]">{f.status}</p></div><div className="flex items-center gap-3 flex-1 px-4"><div className="text-right flex-1"><p className="font-display text-sm font-bold">{f.homeTeam?.shortName || f.homeTeam?.name || "TBD"}</p></div><span className="font-mono-sport text-xs font-bold text-[hsl(var(--muted-foreground))]">{f.homeScore !== null && f.awayScore !== null ? `${f.homeScore} - ${f.awayScore}` : t.vs}</span><div className="flex-1"><p className="font-display text-sm font-bold">{f.awayTeam?.shortName || f.awayTeam?.name || "TBD"}</p></div></div>{f.competition && <span className="font-mono-sport text-[8px] uppercase text-[hsl(var(--muted-foreground))]">{f.competition.name}</span>}</div>) : <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noFixtures}</p>}</div></div>
    <div><div className="border-b-2 border-[hsl(var(--foreground))] pb-4 mb-5"><p className="font-mono-sport text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]"><Trophy size={12} className="inline" /> RESULTS</p><h2 className="font-display text-3xl font-bold tracking-[-.06em]">{t.recentResults}</h2></div><div className="space-y-3">{recent.data && recent.data.length > 0 ? recent.data.map((f) => <div key={f.id} className="flex items-center justify-between border-b py-3"><div className="text-center min-w-[80px]"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{formatDate(f.matchDate)}</p></div><div className="flex items-center gap-3 flex-1 px-4"><div className="text-right flex-1"><p className="font-display text-sm font-bold">{f.homeTeam?.shortName || f.homeTeam?.name || "TBD"}</p></div><span className="font-mono-sport text-xs font-bold">{f.homeScore !== null && f.awayScore !== null ? `${f.homeScore} - ${f.awayScore}` : "—"}</span><div className="flex-1"><p className="font-display text-sm font-bold">{f.awayTeam?.shortName || f.awayTeam?.name || "TBD"}</p></div></div>{f.competition && <span className="font-mono-sport text-[8px] uppercase text-[hsl(var(--muted-foreground))]">{f.competition.name}</span>}</div>) : <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noFixtures}</p>}</div></div>
  </div></section>;
}

function SearchPanel({ lang, value, setValue, onClose }: { lang: Lang; value: string; setValue: (value: string) => void; onClose: () => void }) {
  const t = copy[lang];
  const [debouncedValue, setDebouncedValue] = useState(value);
  const [filterCat, setFilterCat] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [recentSearches, setRecentSearches] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("sportyra_recent_searches") || "[]"); } catch { return []; } });
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), 300);
    return () => window.clearTimeout(timer);
  }, [value]);
  useEffect(() => {
    if (debouncedValue.trim().length < 3) return;
    const timer = window.setTimeout(() => trackEvent("search"), 700);
    return () => window.clearTimeout(timer);
  }, [debouncedValue]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  const result = useQuery({ queryKey: ["search", lang, debouncedValue, filterCat, sortBy], queryFn: () => listNews({ language: lang, published: true, search: debouncedValue, category: filterCat || undefined, page: 1, pageSize: 8 }), enabled: debouncedValue.trim().length > 1 });
  const results = result.data?.items ?? [];
  const saveSearch = (term: string) => { if (!term.trim()) return; const updated = [term, ...recentSearches.filter((s) => s !== term)].slice(0, 8); setRecentSearches(updated); localStorage.setItem("sportyra_recent_searches", JSON.stringify(updated)); };
  return <div className="fixed inset-0 z-50 bg-black/60 px-5 pt-[8vh] overflow-y-auto" onClick={onClose}><div className="mx-auto max-w-3xl bg-[hsl(var(--card))] p-6" onClick={(event) => event.stopPropagation()}><div className="flex justify-between"><span className="font-mono-sport text-[10px] uppercase">{t.advancedSearch}</span><button onClick={onClose} aria-label="Close search"><X /></button></div><div className="mt-4 flex gap-3 border-b-2 border-[hsl(var(--primary))] py-3"><Search /><input autoFocus value={value} onChange={(event) => { setValue(event.target.value); if (event.target.value.trim().length > 2) saveSearch(event.target.value.trim()); }} className="w-full bg-transparent text-xl outline-none" placeholder={t.searchPlaceholder} /></div>
      <div className="mt-3 flex flex-wrap gap-2"><select className="h-9 border bg-transparent px-2 text-xs" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}><option value="">{t.all}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c[lang]}</option>)}</select><select className="h-9 border bg-transparent px-2 text-xs" value={sortBy} onChange={(e) => setSortBy(e.target.value)}><option value="newest">{t.newest}</option><option value="oldest">{t.oldest}</option><option value="title">{t.titleSort}</option></select></div>
      {!value.trim() && recentSearches.length > 0 && <div className="mt-4"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))] mb-2">Recent searches</p><div className="flex flex-wrap gap-2">{recentSearches.map((s) => <button key={s} onClick={() => setValue(s)} className="border px-3 py-1 text-xs hover:bg-[hsl(var(--foreground))] hover:text-[hsl(var(--background))]">{s}</button>)}</div></div>}
      <div className="mt-5 grid gap-3">{result.isFetching && value.trim().length > 1 ? <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading…</p> : results.length > 0 ? results.map((article) => { const slug = article.slug || slugify(article.title); const label = categories.find((c) => c.id === article.category); return <a key={article.id} href={`/article/${article.id}/${slug}`} className="flex gap-3 border-b py-3"><img loading="lazy" src={article.image} alt={article.title} className="h-16 w-20 flex-shrink-0 object-cover" /><div><span className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{label?.[lang] || article.category} • {article.source}</span><p className="font-display font-bold text-sm">{article.title}</p></div></a>; }) : value.trim().length > 1 ? <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noNews}</p> : null}</div></div></div>;
}

function ShareControls({ article, label }: { article: NewsArticle; label: string }) {
  const [copied, setCopied] = useState(false);
  const slug = article.slug || slugify(article.title);
  const url = `${window.location.origin}/article/${article.id}/${slug}`;
  const share = (target: string) => { trackEvent("share", window.location.pathname, article.id); window.open(target, "_blank", "noopener,noreferrer,width=600,height=500"); };
  return <div className="flex flex-wrap items-center gap-2" aria-label={label}>
    <span className="mr-1 font-mono-sport text-[10px] uppercase opacity-60">{label}</span>
    <button className="border p-2" aria-label="Share on X" onClick={() => share(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(article.title)}`)}><Twitter size={16} /></button>
    <button className="border p-2" aria-label="Share on Facebook" onClick={() => share(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`)}><Facebook size={16} /></button>
    <button className="border p-2" aria-label="Copy article link" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? <Check size={16} /> : <Link2 size={16} />}</button>
  </div>;
}

function RichTextEditor({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [localValue, setLocalValue] = useState(value);
  useEffect(() => { setLocalValue(value); }, [value]);
  const execCmd = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    ref.current?.focus();
  }, []);
  const handleInput = useCallback(() => {
    const text = ref.current?.innerText || "";
    setLocalValue(text);
    onChange(text);
  }, [onChange]);
  return <div className="border bg-[hsl(var(--background))]">
    <div className="flex flex-wrap gap-1 border-b bg-[hsl(var(--muted))] p-1">
      <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("bold"); }} className="rounded px-2 py-1 text-xs font-bold hover:bg-[hsl(var(--background))]" title="Bold">B</button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("italic"); }} className="rounded px-2 py-1 text-xs italic hover:bg-[hsl(var(--background))]" title="Italic">I</button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("underline"); }} className="rounded px-2 py-1 text-xs underline hover:bg-[hsl(var(--background))]" title="Underline">U</button>
      <span className="mx-1 w-px bg-[hsl(var(--foreground)/.2)]" />
      <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("insertUnorderedList"); }} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--background))]" title="Bullet list">• List</button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("insertOrderedList"); }} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--background))]" title="Numbered list">1. List</button>
      <span className="mx-1 w-px bg-[hsl(var(--foreground)/.2)]" />
      <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("formatBlock", "h2"); }} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--background))]" title="Heading">H2</button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("formatBlock", "blockquote"); }} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--background))]" title="Quote">"</button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); execCmd("removeFormat"); }} className="rounded px-2 py-1 text-xs hover:bg-[hsl(var(--background))]" title="Clear formatting">✕</button>
    </div>
    <div ref={ref} contentEditable suppressContentEditableWarning onInput={handleInput}
      className="min-h-48 p-4 text-sm leading-relaxed outline-none prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(localValue || "") }}
      data-placeholder={placeholder || "Write your article here..."}
      style={{ minHeight: "12rem" }}
    />
  </div>;
}

function Article({ id }: { id: number }) {
  const [lang, setLang] = useState<Lang>("en");
  const [dark, setDark] = useDarkMode();
  const article = useQuery({ queryKey: ["article", id], queryFn: () => getNews(id) });
  const related = useQuery({ queryKey: ["related", id], queryFn: () => getRelatedNews(id), enabled: Boolean(article.data) });
  const navigation = useQuery({ queryKey: ["navigation", id], queryFn: () => navigationApi.prevNext(id), enabled: Boolean(article.data) });
  const bookmarkCheck = useQuery({ queryKey: ["bookmark", id], queryFn: () => bookmarksApi.check(id), retry: false });
  const bookmarkMutation = useMutation({ mutationFn: async () => { if (bookmarkCheck.data?.bookmarked) await bookmarksApi.remove(id); else await bookmarksApi.add(id); }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bookmark", id] }); toast.success(bookmarkCheck.data?.bookmarked ? t.articleRemoved : t.articleSaved); } });
  const commentsQuery = useQuery({ queryKey: ["comments", id], queryFn: () => commentsApi.list(id), enabled: Boolean(article.data) });
  const [commentName, setCommentName] = useState("");
  const [commentEmail, setCommentEmail] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const commentMutation = useMutation({ mutationFn: () => commentsApi.create(id, { body: commentBody, authorName: commentName, authorEmail: commentEmail }), onSuccess: () => { setCommentBody(""); toast.success(t.commentPosted); queryClient.invalidateQueries({ queryKey: ["comments", id] }); } });
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const reportMutation = useMutation({ mutationFn: () => moderationApi.report("article", id, reportReason), onSuccess: () => { setShowReport(false); setReportReason(""); toast.success(t.reportSubmitted); } });
  const t = copy[lang];
  const seoData = article.data;
  const seoSlug = seoData?.slug || (seoData ? slugify(seoData.title) : "");
  useSeo({
    title: seoData ? `${seoData.metaTitle || seoData.title} — Sportyra News` : "Sportyra News",
    description: seoData?.metaDescription || seoData?.description || t.brandLine,
    image: seoData?.image,
    canonical: seoData ? `${window.location.origin}/article/${seoData.id}/${seoSlug}` : undefined,
    jsonLd: seoData ? {
      "@context": "https://schema.org", "@type": "NewsArticle", headline: seoData.title, description: seoData.description,
      image: [seoData.image], datePublished: seoData.publicationDate, dateModified: seoData.updatedAt,
      author: { "@type": "Person", name: seoData.author }, publisher: { "@type": "Organization", name: "Sportyra News", logo: { "@type": "ImageObject", url: `${window.location.origin}/favicon.svg` } },
      mainEntityOfPage: `${window.location.origin}/article/${seoData.id}/${seoSlug}`, wordCount: (seoData.body || seoData.description).split(/\s+/).length,
      timeRequired: `PT${seoData.readingTime || 1}M`,
    } : undefined,
  });
  useEffect(() => { if (article.data?.id) trackEvent("article_view", window.location.pathname, article.data.id); }, [article.data?.id]);
  if (article.isLoading) return <div className="min-h-screen" dir="ltr"><Header lang={lang} setLang={setLang} onSearch={() => { }} dark={dark} setDark={setDark} /><main id="main-content" className="mx-auto max-w-[1000px] px-5 py-12 lg:py-20"><div className="space-y-6"><div className="skeleton h-4 w-40" /><div className="skeleton h-[clamp(3rem,7vw,5.5rem)] w-3/4" /><div className="skeleton h-6 w-full" /><div className="skeleton h-6 w-5/6" /><div className="skeleton aspect-video w-full" /></div></main></div>;
  if (article.isError || !article.data) return <NotFound />;
  const data: NewsArticle = article.data;
  const articleImageFallback = "/football-editorial.png";
  const headings = data.body ? Array.from(new DOMParser().parseFromString(data.body, "text/html").querySelectorAll("h2, h3")).map((el) => ({ text: el.textContent || "", level: el.tagName.toLowerCase(), id: (el.textContent || "").toLowerCase().replace(/[^a-z0-9]+/g, "-") })) : [];
  return <div className="min-h-screen" dir={lang === "ar" || lang === "ku" ? "rtl" : "ltr"}><Header lang={lang} setLang={setLang} onSearch={() => { }} dark={dark} setDark={setDark} /><main id="main-content" className="mx-auto max-w-[1000px] px-5 py-12 lg:py-20"><AdSlot slot={import.meta.env.VITE_ADSENSE_ARTICLE_SLOT || ""} /><a href="/" className="font-mono-sport text-xs uppercase text-[hsl(var(--primary))]">← Sportyra</a><p className="mt-10 font-mono-sport text-[10px] uppercase text-[hsl(var(--muted-foreground))]">{data.source} • {new Date(data.publicationDate).toLocaleString(lang === "ar" ? "ar" : lang === "ku" ? "ku" : "en-US")}{data.readingTime && <> • {data.readingTime} {t.readTime}</>}</p><h1 className="mt-4 font-display text-[clamp(2rem,5vw,5.5rem)] font-bold leading-[.94] tracking-[-.06em]">{data.title}</h1><p className="mt-6 text-lg leading-8 text-[hsl(var(--muted-foreground))]">{data.description}</p>
    <div className="mt-4 flex flex-wrap items-center gap-3 border-b pb-5"><span className="font-mono-sport text-xs">{data.author} · {data.source}</span><ShareControls article={data} label={t.share} /><button onClick={() => bookmarkMutation.mutate()} className={`flex items-center gap-1 border p-2 text-xs ${bookmarkCheck.data?.bookmarked ? "bg-[hsl(var(--primary))] text-white" : ""}`}>{bookmarkCheck.data?.bookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}{bookmarkCheck.data?.bookmarked ? t.articleSaved : t.saveArticle}</button><button onClick={() => setShowReport(!showReport)} className="flex items-center gap-1 border p-2 text-xs"><Flag size={14} />{t.reportArticle}</button></div>
    {showReport && <div className="my-4 border bg-[hsl(var(--secondary))] p-4"><label className="block text-xs font-bold">{t.reportReason}<Input className="mt-1 h-11" value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder={t.reportReason} /></label><Button className="mt-3" onClick={() => reportMutation.mutate()} disabled={!reportReason.trim()}>{t.submitReport}</Button></div>}
    {headings.length > 1 && <div className="my-6 border-l-2 border-[hsl(var(--primary)/.3)] bg-[hsl(var(--secondary))] p-4"><p className="mb-2 font-mono-sport text-[10px] uppercase text-[hsl(var(--primary))]">{t.tableOfContents}</p><nav className="space-y-1">{headings.map((h, i) => <a key={i} href={`#${h.id}`} className={`block text-sm hover:text-[hsl(var(--primary))] ${h.level === "h3" ? "pl-4" : ""}`}>{h.text}</a>)}</nav></div>}
    <img decoding="async" fetchPriority="high" src={data.image} alt={data.title} className="mt-6 aspect-video w-full object-cover" onError={(event) => { const img = event.currentTarget; if (img.src !== articleImageFallback) img.src = articleImageFallback; }} />
    {data.body && <div className="prose prose-lg mt-10 max-w-none leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.body) }} />}
    {data.tags.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{data.tags.map((tag) => <span key={tag} className="rounded-full border px-3 py-1 text-xs">#{tag}</span>)}</div>}
    <div className="mt-8 flex flex-wrap items-center justify-between gap-5 border-t border-b py-5"><span className="font-mono-sport text-xs">{data.author} · {data.source}</span><ShareControls article={data} label={t.share} /></div>
    {navigation.data && (navigation.data.previous || navigation.data.next) && <div className="mt-10 grid gap-4 sm:grid-cols-2">{navigation.data.previous && <a href={`/article/${navigation.data.previous.id}/${navigation.data.previous.slug || slugify(navigation.data.previous.title)}`} className="group border p-4 transition hover:border-[hsl(var(--primary))]"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]"><ChevronLeft size={12} className="inline" /> {t.prevArticle}</p><p className="mt-2 font-display text-sm font-bold leading-tight group-hover:text-[hsl(var(--primary))]">{navigation.data.previous.title}</p></a>}{navigation.data.next && <a href={`/article/${navigation.data.next.id}/${navigation.data.next.slug || slugify(navigation.data.next.title)}`} className="group border p-4 text-right transition hover:border-[hsl(var(--primary))]"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{t.nextArticle} <ChevronRight size={12} className="inline" /></p><p className="mt-2 font-display text-sm font-bold leading-tight group-hover:text-[hsl(var(--primary))]">{navigation.data.next.title}</p></a>}</div>}
    <section className="mt-12"><h2 className="mb-5 font-display text-3xl font-bold">{t.comments} ({commentsQuery.data?.length || 0})</h2><div className="mb-6 border bg-[hsl(var(--secondary))] p-4"><h3 className="mb-3 font-display text-lg font-bold">{t.leaveComment}</h3><div className="grid gap-3 sm:grid-cols-2"><Input className="h-11" placeholder={t.commentName} value={commentName} onChange={(e) => setCommentName(e.target.value)} /><Input className="h-11" placeholder={t.commentEmail} type="email" value={commentEmail} onChange={(e) => setCommentEmail(e.target.value)} /></div><Textarea className="mt-3 min-h-24" placeholder={t.commentBody} value={commentBody} onChange={(e) => setCommentBody(e.target.value)} /><Button className="mt-3" onClick={() => commentMutation.mutate()} disabled={!commentBody.trim() || !commentName.trim() || !commentEmail.trim() || commentMutation.isPending}>{commentMutation.isPending ? "…" : t.postComment}</Button></div><div className="space-y-4">{commentsQuery.data && commentsQuery.data.length > 0 ? commentsQuery.data.filter((c) => !c.parentId).map((comment) => <div key={comment.id} className="border-b pb-4"><div className="flex items-center gap-2"><span className="font-display text-sm font-bold">{comment.authorName}</span><span className="font-mono-sport text-[9px] text-[hsl(var(--muted-foreground))]">{new Date(comment.createdAt).toLocaleDateString()}</span></div><p className="mt-2 text-sm leading-6">{comment.body}</p><button onClick={() => { commentsApi.report(comment.id, "inappropriate"); toast.success(t.reportSubmitted); }} className="mt-1 flex items-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]"><Flag size={10} />{t.reportComment}</button></div>) : <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noComments}</p>}</div></section>
    <section className="mt-14">{related.data && related.data.length > 0 && <><h2 className="mb-5 font-display text-3xl font-bold">{t.related}</h2><div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3">{related.data.map((item) => <NewsCard key={item.id} article={item} lang={lang} />)}</div></>}</section></main></div>;
}

const emptyForm: FormState = { title: "", description: "", body: "", image: "/football-editorial.png", category: "football", language: "en", source: "", author: "Sportyra", publicationDate: new Date().toISOString(), featured: false, published: false, tags: [] };

async function uploadArticleImage(file: File) {
  const token = sessionStorage.getItem("sportyra_admin_token");
  const response = await fetch(`${apiBase}/api/storage/uploads/request-url`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || ""}`, "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }) });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Could not request an upload URL");
  const payload = await response.json() as { uploadURL: string; objectPath: string };
  const upload = await fetch(payload.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
  if (!upload.ok) throw new Error("Could not upload image");
  return `${apiBase}/api/storage${payload.objectPath}`;
}

function Admin() {
  const [token, setToken] = useState(sessionStorage.getItem("sportyra_admin_token") || "");
  const [authed, setAuthed] = useState(Boolean(token));
  const [editing, setEditing] = useState<NewsArticle | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"newest" | "oldest" | "title">("newest");
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<"articles" | "analytics" | "users" | "comments" | "moderation" | "fixtures" | "matches" | "transfers" | "players" | "health" | "partners">("articles");
  const t = copy[form.language];
  const summary = useQuery({ queryKey: ["summary"], queryFn: getNewsSummary, enabled: authed });
  const analytics = useQuery({ queryKey: ["analytics-summary"], queryFn: accountApi.analyticsSummary, enabled: authed });
  const news = useQuery({ queryKey: ["admin-news", filter, page], queryFn: () => listNews({ search: filter || undefined, published: undefined, page, pageSize: 10 }), enabled: authed });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: accountApi.listUsers, enabled: authed && tab === "users" });
  const adminComments = useQuery({ queryKey: ["admin-comments"], queryFn: () => commentsApi.adminList(), enabled: authed && tab === "comments" });
  const adminModeration = useQuery({ queryKey: ["admin-moderation"], queryFn: () => moderationApi.adminList(), enabled: authed && tab === "moderation" });
  const adminFixtures = useQuery({ queryKey: ["admin-fixtures"], queryFn: () => fixturesApi.list(), enabled: authed && tab === "fixtures" });
  const adminMatches = useQuery({ queryKey: ["admin-matches"], queryFn: () => matchesApi.list({ limit: 50 }), enabled: authed && tab === "matches" });
  const adminTransfers = useQuery({ queryKey: ["admin-transfers"], queryFn: () => transfersApi.list({ limit: 50 }), enabled: authed && tab === "transfers" });
  const adminPlayers = useQuery({ queryKey: ["admin-players"], queryFn: () => playersApi.list({ limit: 50 }), enabled: authed && tab === "players" });
  const healthCheck = useQuery({ queryKey: ["health"], queryFn: () => request<{ status: string; database: string; uptime: number; version: string }>("/api/healthz"), enabled: authed && tab === "health" });
  const articles = useMemo(() => [...(news.data?.items ?? [])].sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "oldest" ? a.publicationDate.localeCompare(b.publicationDate) : b.publicationDate.localeCompare(a.publicationDate)), [news.data?.items, sort]);
  const save = useMutation({ mutationFn: (data: FormState) => editing ? updateNews(editing.id, data) : createNews(data), onSuccess: () => { toast.success("Saved"); setEditing(null); setForm(emptyForm); queryClient.invalidateQueries({ queryKey: ["admin-news"] }); queryClient.invalidateQueries({ queryKey: ["summary"] }); }, onError: (error) => toast.error(errorMessage(error)) });
  const del = useMutation({ mutationFn: (id: number) => deleteNews(id), onSuccess: () => { toast.success("Deleted"); queryClient.invalidateQueries({ queryKey: ["admin-news"] }); queryClient.invalidateQueries({ queryKey: ["summary"] }); } });
  const pub = useMutation({ mutationFn: ({ id, published }: { id: number; published: boolean }) => publishNews(id, { published }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-news"] }) });
  const feat = useMutation({ mutationFn: ({ id, featured }: { id: number; featured: boolean }) => featureNews(id, { featured }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-news"] }) });
  const roleUpdate = useMutation({ mutationFn: ({ id, role }: { id: number; role: string }) => accountApi.updateUserRole(id, role), onSuccess: () => { toast.success("Role updated"); queryClient.invalidateQueries({ queryKey: ["admin-users"] }); }, onError: (error) => toast.error(errorMessage(error)) });
  const activeUpdate = useMutation({ mutationFn: ({ id, active }: { id: number; active: boolean }) => accountApi.updateUserActive(id, active), onSuccess: () => { toast.success("Status updated"); queryClient.invalidateQueries({ queryKey: ["admin-users"] }); }, onError: (error) => toast.error(errorMessage(error)) });
  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const login = async () => {
    if (!token.trim()) { toast.error("Admin token required"); return; }
    try {
      const response = await fetch(`${apiBase}/api/auth/validate-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.trim()}`, "X-Requested-With": "XMLHttpRequest" },
      });
      if (!response.ok) { toast.error("Invalid admin token"); return; }
    } catch { }
    sessionStorage.setItem("sportyra_admin_token", token.trim());
    setAuthTokenGetter(() => sessionStorage.getItem("sportyra_admin_token"));
    setAuthed(true);
  };
  const logout = () => { sessionStorage.removeItem("sportyra_admin_token"); setAuthed(false); };
  if (!authed) return <div className="min-h-screen p-5" dir="ltr"><div className="mx-auto mt-24 max-w-md border bg-[hsl(var(--card))] p-8"><Logo /><h1 className="mt-10 font-display text-4xl font-bold">{copy.en.login}</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Use the secure SPORTYRA_ADMIN_TOKEN configured on the server.</p><Input className="mt-6 h-12" type="password" placeholder={copy.en.token} value={token} onChange={(event) => setToken(event.target.value)} onKeyDown={(event) => event.key === "Enter" && login()} /><Button className="mt-3 w-full" onClick={login}>{copy.en.enter}</Button><a href="/" className="mt-5 block text-center text-sm">← Back to site</a></div></div>;
  const startEdit = (article: NewsArticle) => { setEditing(article); setForm({ title: article.title, description: article.description, body: article.body ?? undefined, image: article.image, category: article.category, language: article.language, source: article.source, author: article.author, tags: article.tags, slug: article.slug ?? undefined, readingTime: article.readingTime ?? undefined, metaTitle: article.metaTitle ?? undefined, metaDescription: article.metaDescription ?? undefined, publicationDate: new Date(article.publicationDate).toISOString(), featured: article.featured, published: article.published }); };
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!form.title.trim() || !form.description.trim() || !form.image.trim() || !form.category || !form.source.trim() || !form.author.trim()) { toast.error(t.required); return; } save.mutate(form); };

  const dailyViews = analytics.data?.dailyViews || [];
  const maxDailyViews = Math.max(1, ...dailyViews.map((d) => d.views));

  return <div className="min-h-screen bg-[hsl(var(--background))]" dir="ltr"><header className="border-b bg-[hsl(var(--card))]"><div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 lg:px-10"><Logo /><div className="flex items-center gap-2"><a href="/" className="border px-3 py-2 text-xs">View site</a><button onClick={logout} className="flex items-center gap-2 border px-3 py-2 text-xs"><LogOut size={14} />{copy.en.logout}</button></div></div></header>
    <main className="mx-auto max-w-[1440px] p-5 lg:p-10"><div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="font-mono-sport text-[10px] uppercase text-[hsl(var(--primary))]">{copy.en.dashboard}</p><h1 className="font-display text-5xl font-bold tracking-[-.06em]">{copy.en.admin}</h1></div><Button onClick={() => { setEditing(null); setForm(emptyForm); }}><Plus size={16} /> {copy.en.newArticle}</Button></div>
      <div className="mb-8 grid gap-4 grid-cols-2 sm:grid-cols-4">{[["total", summary.data?.total || 0], ["published", summary.data?.published || 0], ["drafts", summary.data?.drafts || 0], ["featured", summary.data?.featured || 0]].map(([key, value]) => <div key={key} className="border bg-[hsl(var(--card))] p-4 sm:p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{key}</p><p className="mt-2 font-display text-2xl sm:text-4xl font-bold">{value}</p></div>)}</div>

      <div className="mb-6 flex gap-1 border-b overflow-x-auto">
        {[["articles", "Articles", "📰"] as const, ["analytics", "Analytics", "📊"] as const, ["users", "Users", "👥"] as const, ["comments", "Comments", "💬"] as const, ["moderation", "Moderation", "🛡️"] as const, ["fixtures", "Fixtures", "🏆"] as const, ["matches", "Matches", "⚽"] as const, ["transfers", "Transfers", "🔄"] as const, ["players", "Players", "👤"] as const, ["health", "Health", "⚡"] as const, ["partners", "Partners", "🤝"] as const].map(([id, label, icon]) => <button key={id} onClick={() => setTab(id as typeof tab)} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold uppercase whitespace-nowrap ${tab === id ? "border-[hsl(var(--primary))] text-[hsl(var(--primary))]" : ""}`}>{icon} {label}</button>)}
      </div>

      {tab === "analytics" && <div className="mb-8">
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <div className="border bg-[hsl(var(--card))] p-5"><div className="flex items-center gap-2 mb-2"><Eye size={16} className="text-[hsl(var(--primary))]" /><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{copy.en.pageViews}</p></div><p className="font-display text-3xl font-bold">{analytics.data?.totals.find((t) => t.eventType === "page_view")?.total || 0}</p></div>
          <div className="border bg-[hsl(var(--card))] p-5"><div className="flex items-center gap-2 mb-2"><Users size={16} className="text-[hsl(var(--primary))]" /><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{copy.en.uniqueVisitors}</p></div><p className="font-display text-3xl font-bold">{analytics.data?.uniqueVisitors || 0}</p></div>
          <div className="border bg-[hsl(var(--card))] p-5"><div className="flex items-center gap-2 mb-2"><BarChart3 size={16} className="text-[hsl(var(--primary))]" /><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{copy.en.articleViews}</p></div><p className="font-display text-3xl font-bold">{analytics.data?.totals.find((t) => t.eventType === "article_view")?.total || 0}</p></div>
        </div>
        {dailyViews.length > 0 && <div className="border bg-[hsl(var(--card))] p-5 mb-6">
          <p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))] mb-4">{copy.en.dailyViews} (30 days)</p>
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {dailyViews.map((d) => <div key={d.date} className="flex-1 bg-[hsl(var(--primary))]" style={{ height: `${(d.views / maxDailyViews) * 100}%`, minHeight: 2 }} title={`${d.date}: ${d.views} views`} />)}
          </div>
          <div className="mt-2 flex justify-between font-mono-sport text-[8px] text-[hsl(var(--muted-foreground))]"><span>{dailyViews[0]?.date}</span><span>{dailyViews[dailyViews.length - 1]?.date}</span></div>
        </div>}
        {analytics.data?.articleSummaries && analytics.data.articleSummaries.length > 0 && <div className="border bg-[hsl(var(--card))] p-5">
          <p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))] mb-4">Top Articles</p>
          <div className="space-y-2">{analytics.data.articleSummaries.map((item) => <div key={item.articleId} className="flex items-center justify-between border-b py-2 text-sm"><span className="truncate">{item.title || `Article #${item.articleId}`}</span><span className="ml-4 font-mono-sport text-xs font-bold">{item.views}</span></div>)}</div>
        </div>}
      </div>}

      {tab === "users" && <div className="mb-8">
        <div className="border bg-[hsl(var(--card))] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-[hsl(var(--muted))]"><th className="px-4 py-3 text-left font-mono-sport text-[9px] uppercase">Name</th><th className="px-4 py-3 text-left font-mono-sport text-[9px] uppercase">Email</th><th className="px-4 py-3 text-left font-mono-sport text-[9px] uppercase">Role</th><th className="px-4 py-3 text-left font-mono-sport text-[9px] uppercase">Status</th><th className="px-4 py-3 text-left font-mono-sport text-[9px] uppercase">Actions</th></tr></thead>
              <tbody>{(users.data || []).map((user) => <tr key={user.id} className="border-b"><td className="px-4 py-3 font-bold">{user.name}</td><td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">{user.email}</td><td className="px-4 py-3"><select className="border bg-transparent px-2 py-1 text-xs" value={user.role} onChange={(e) => roleUpdate.mutate({ id: user.id, role: e.target.value })}><option value="user">User</option><option value="editor">Editor</option><option value="admin">Admin</option></select></td><td className="px-4 py-3"><span className={`text-xs font-bold ${user.active ? "text-green-600" : "text-red-600"}`}>{user.active ? "Active" : "Inactive"}</span></td><td className="px-4 py-3"><button className="border px-2 py-1 text-xs" onClick={() => activeUpdate.mutate({ id: user.id, active: !user.active })}>{user.active ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody>
            </table>
          </div>
          {(!users.data || users.data.length === 0) && <p className="p-5 text-center text-sm text-[hsl(var(--muted-foreground))]">No users found.</p>}
        </div>
      </div>}

      {tab === "comments" && <div className="mb-8"><div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))] mb-4">COMMENTS ({adminComments.data?.total || 0})</p>{adminComments.data && adminComments.data.items.length > 0 ? adminComments.data.items.map((c) => <div key={c.id} className="border-b py-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="font-bold text-sm">{c.authorName}</span><span className="font-mono-sport text-[9px] text-[hsl(var(--muted-foreground))]">Article #{c.newsId}</span>{c.reported && <span className="bg-red-100 px-2 py-0.5 text-[9px] font-bold text-red-700">REPORTED</span>}</div><div className="flex gap-1"><button className="border px-2 py-1 text-[10px]" onClick={() => { commentsApi.adminModerate(c.id, { approved: !c.approved }); queryClient.invalidateQueries({ queryKey: ["admin-comments"] }); }}>{c.approved ? "Unapprove" : "Approve"}</button><button className="border px-2 py-1 text-[10px]" onClick={() => { commentsApi.adminModerate(c.id, { removed: true }); queryClient.invalidateQueries({ queryKey: ["admin-comments"] }); }}>Remove</button></div></div><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{c.body}</p></div>) : <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">No comments yet.</p>}</div></div>}

      {tab === "moderation" && <div className="mb-8"><div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))] mb-4">MODERATION QUEUE ({adminModeration.data?.total || 0})</p>{adminModeration.data && adminModeration.data.items.length > 0 ? adminModeration.data.items.map((r) => <div key={r.id} className="border-b py-3"><div className="flex items-center justify-between"><div><span className={`inline-block px-2 py-0.5 text-[9px] font-bold uppercase ${r.status === "pending" ? "bg-yellow-100 text-yellow-700" : r.status === "reviewed" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>{r.status}</span><span className="ml-2 text-xs text-[hsl(var(--muted-foreground))]">{r.targetType} #{r.targetId}</span></div><div className="flex gap-1">{r.status === "pending" && <><button className="border px-2 py-1 text-[10px]" onClick={() => { moderationApi.adminReview(r.id, "reviewed"); queryClient.invalidateQueries({ queryKey: ["admin-moderation"] }); }}>Review</button><button className="border px-2 py-1 text-[10px]" onClick={() => { moderationApi.adminReview(r.id, "dismissed"); queryClient.invalidateQueries({ queryKey: ["admin-moderation"] }); }}>Dismiss</button></>}</div></div><p className="mt-1 text-sm">Reason: {r.reason}</p><p className="font-mono-sport text-[9px] text-[hsl(var(--muted-foreground))]">{new Date(r.createdAt).toLocaleString()}</p></div>) : <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">No reports.</p>}</div></div>}

      {tab === "fixtures" && <div className="mb-8"><div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))] mb-4">FIXTURES ({adminFixtures.data?.length || 0})</p>{adminFixtures.data && adminFixtures.data.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-[hsl(var(--muted))]"><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Date</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Home</th><th className="px-3 py-2 text-center font-mono-sport text-[9px] uppercase">Score</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Away</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Status</th></tr></thead><tbody>{adminFixtures.data.map((f) => <tr key={f.id} className="border-b"><td className="px-3 py-2 text-xs">{new Date(f.matchDate).toLocaleDateString()}</td><td className="px-3 py-2 text-xs font-bold">{f.homeTeam?.name || "TBD"}</td><td className="px-3 py-2 text-center text-xs font-bold">{f.homeScore !== null ? `${f.homeScore} - ${f.awayScore}` : "—"}</td><td className="px-3 py-2 text-xs font-bold">{f.awayTeam?.name || "TBD"}</td><td className="px-3 py-2"><span className={`text-[9px] font-bold uppercase ${f.status === "finished" ? "text-green-600" : f.status === "live" ? "text-red-600" : ""}`}>{f.status}</span></td></tr>)}</tbody></table></div> : <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">No fixtures yet.</p>}</div></div>}

      {tab === "matches" && <div className="mb-8"><div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))] mb-4">MATCHES ({adminMatches.data?.total || 0})</p>{adminMatches.data && adminMatches.data.items.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-[hsl(var(--muted))]"><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Competition</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Home</th><th className="px-3 py-2 text-center font-mono-sport text-[9px] uppercase">Score</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Away</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Status</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Date</th></tr></thead><tbody>{adminMatches.data.items.map((m) => <tr key={m.id} className="border-b"><td className="px-3 py-2 text-xs">{m.competitionName || "—"}</td><td className="px-3 py-2 text-xs font-bold">{m.homeTeamName}</td><td className="px-3 py-2 text-center text-xs font-bold">{m.homeScore !== null ? `${m.homeScore} - ${m.awayScore}` : "—"}</td><td className="px-3 py-2 text-xs font-bold">{m.awayTeamName}</td><td className="px-3 py-2"><span className={`text-[9px] font-bold uppercase ${m.status === "finished" ? "text-green-600" : m.status === "live" ? "text-red-600" : ""}`}>{m.status}</span></td><td className="px-3 py-2 text-xs">{new Date(m.matchDate).toLocaleDateString()}</td></tr>)}</tbody></table></div> : <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">No matches yet.</p>}</div></div>}

      {tab === "transfers" && <div className="mb-8"><div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))] mb-4">TRANSFERS ({adminTransfers.data?.total || 0})</p>{adminTransfers.data && adminTransfers.data.items.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-[hsl(var(--muted))]"><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Player</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">From</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">To</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Fee</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Status</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Confidence</th></tr></thead><tbody>{adminTransfers.data.items.map((tr) => <tr key={tr.id} className="border-b"><td className="px-3 py-2 text-xs font-bold">{tr.playerName}</td><td className="px-3 py-2 text-xs">{tr.fromClub}</td><td className="px-3 py-2 text-xs">{tr.toClub}</td><td className="px-3 py-2 text-xs">{tr.fee || "—"}</td><td className="px-3 py-2"><span className={`text-[9px] font-bold uppercase ${tr.status === "confirmed" || tr.status === "completed" ? "text-green-600" : tr.status === "rumour" ? "text-blue-600" : tr.status === "negotiating" ? "text-amber-600" : ""}`}>{tr.status}</span></td><td className="px-3 py-2 text-xs">{tr.confidence}%</td></tr>)}</tbody></table></div> : <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">No transfers yet.</p>}</div></div>}

      {tab === "players" && <div className="mb-8"><div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))] mb-4">PLAYERS ({adminPlayers.data?.total || 0})</p>{adminPlayers.data && adminPlayers.data.items.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-[hsl(var(--muted))]"><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Name</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Position</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Club</th><th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">Nationality</th><th className="px-3 py-2 text-center font-mono-sport text-[9px] uppercase">Goals</th><th className="px-3 py-2 text-center font-mono-sport text-[9px] uppercase">Assists</th></tr></thead><tbody>{adminPlayers.data.items.map((pl) => <tr key={pl.id} className="border-b"><td className="px-3 py-2 text-xs font-bold">{pl.name}</td><td className="px-3 py-2 text-xs">{pl.position || "—"}</td><td className="px-3 py-2 text-xs">{pl.club || "—"}</td><td className="px-3 py-2 text-xs">{pl.nationality || "—"}</td><td className="px-3 py-2 text-center text-xs font-bold">{pl.goals}</td><td className="px-3 py-2 text-center text-xs font-bold">{pl.assists}</td></tr>)}</tbody></table></div> : <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">No players yet.</p>}</div></div>}

      {tab === "health" && <div className="mb-8"><div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))] mb-4">SYSTEM HEALTH</p><div className="grid gap-4 sm:grid-cols-2"><div className="flex items-center gap-3 border p-4"><Wifi size={20} className={healthCheck.data?.status === "ok" ? "text-green-600" : "text-red-600"} /><div><p className="text-xs font-bold">API</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{healthCheck.data?.status || "Checking..."}</p></div></div><div className="flex items-center gap-3 border p-4"><Database size={20} className={healthCheck.data?.database === "ok" ? "text-green-600" : "text-red-600"} /><div><p className="text-xs font-bold">Database</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{healthCheck.data?.database || "Checking..."}</p></div></div><div className="flex items-center gap-3 border p-4"><Activity size={20} className="text-green-600" /><div><p className="text-xs font-bold">Uptime</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{healthCheck.data?.uptime ? `${Math.floor(healthCheck.data.uptime / 60)}m` : "—"}</p></div></div><div className="flex items-center gap-3 border p-4"><FileText size={20} className="text-blue-600" /><div><p className="text-xs font-bold">Version</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{healthCheck.data?.version || "—"}</p></div></div></div></div></div>}

      {tab === "partners" && (() => {
        const partnerStats = useQuery({ queryKey: ["admin-partner-stats"], queryFn: () => adminPartnerApi.stats(), enabled: authed });
        const partnerList = useQuery({ queryKey: ["admin-partner-list"], queryFn: () => adminPartnerApi.list(50), enabled: authed });
        const [newPartnerName, setNewPartnerName] = useState("");
        const [newPartnerEmail, setNewPartnerEmail] = useState("");
        const [newPartnerWebsite, setNewPartnerWebsite] = useState("");
        const createPartner = useMutation({ mutationFn: () => adminPartnerApi.create({ name: newPartnerName, email: newPartnerEmail, website: newPartnerWebsite || undefined }), onSuccess: () => { toast.success("Partner created"); setNewPartnerName(""); setNewPartnerEmail(""); setNewPartnerWebsite(""); queryClient.invalidateQueries({ queryKey: ["admin-partner-list"] }); queryClient.invalidateQueries({ queryKey: ["admin-partner-stats"] }); }, onError: (e: Error) => toast.error(errorMessage(e)) });
        const deactivatePartner = useMutation({ mutationFn: (id: number) => adminPartnerApi.deactivate(id), onSuccess: () => { toast.success("Partner deactivated"); queryClient.invalidateQueries({ queryKey: ["admin-partner-list"] }); } });
        return <div className="mb-8">
          <div className="grid gap-4 sm:grid-cols-4 mb-6">
            <div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">Total Partners</p><p className="mt-2 font-display text-3xl font-bold">{partnerStats.data?.totalPartners ?? 0}</p></div>
            <div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">Active</p><p className="mt-2 font-display text-3xl font-bold">{partnerStats.data?.activePartners ?? 0}</p></div>
            <div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">Total Clicks</p><p className="mt-2 font-display text-3xl font-bold">{partnerStats.data?.totalClicks ?? 0}</p></div>
            <div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">Total Earnings</p><p className="mt-2 font-display text-3xl font-bold">${partnerStats.data?.totalEarnings ?? "0"}</p></div>
          </div>
          <div className="border bg-[hsl(var(--card))] p-5 mb-6">
            <h3 className="mb-3 font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">ADD PARTNER</h3>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input placeholder="Name" value={newPartnerName} onChange={(e) => setNewPartnerName(e.target.value)} className="h-11 flex-1" />
              <Input placeholder="Email" type="email" value={newPartnerEmail} onChange={(e) => setNewPartnerEmail(e.target.value)} className="h-11 flex-1" />
              <Input placeholder="Website" value={newPartnerWebsite} onChange={(e) => setNewPartnerWebsite(e.target.value)} className="h-11 flex-1" />
              <Button onClick={() => createPartner.mutate()} disabled={createPartner.isPending || !newPartnerName || !newPartnerEmail}>{createPartner.isPending ? "..." : "Add"}</Button>
            </div>
          </div>
          <div className="border bg-[hsl(var(--card))] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-[hsl(var(--muted))]"><th className="px-4 py-3 text-left font-mono-sport text-[9px] uppercase">Name</th><th className="px-4 py-3 text-left font-mono-sport text-[9px] uppercase">Code</th><th className="px-4 py-3 text-left font-mono-sport text-[9px] uppercase">Clicks</th><th className="px-4 py-3 text-left font-mono-sport text-[9px] uppercase">Earnings</th><th className="px-4 py-3 text-left font-mono-sport text-[9px] uppercase">Status</th><th className="px-4 py-3 text-left font-mono-sport text-[9px] uppercase">Actions</th></tr></thead>
                <tbody>{(partnerList.data?.items || []).map((p: any) => <tr key={p.id} className="border-b"><td className="px-4 py-3"><div className="font-bold">{p.name}</div><div className="text-[10px] text-[hsl(var(--muted-foreground))]">{p.email}</div></td><td className="px-4 py-3"><code className="text-[10px] bg-[hsl(var(--muted))] px-2 py-0.5">{p.referralCode}</code></td><td className="px-4 py-3 font-bold">{p.totalClicks}</td><td className="px-4 py-3 font-bold">${p.totalEarnings}</td><td className="px-4 py-3"><span className={`text-[9px] font-bold uppercase ${p.status === "active" ? "text-green-600" : "text-red-600"}`}>{p.status}</span></td><td className="px-4 py-3">{p.status === "active" && <button className="border px-2 py-1 text-[10px]" onClick={() => deactivatePartner.mutate(p.id)}>Deactivate</button>}</td></tr>)}</tbody>
              </table>
            </div>
            {(!partnerList.data || partnerList.data.items.length === 0) && <p className="p-5 text-center text-sm text-[hsl(var(--muted-foreground))]">No partners yet.</p>}
          </div>
        </div>;
      })()}

      {tab === "articles" && <>
      <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]"><form onSubmit={submit} className="border bg-[hsl(var(--card))] p-6"><div className="mb-5 flex items-center justify-between"><h2 className="font-display text-2xl font-bold">{editing ? copy.en.update : copy.en.newArticle}</h2>{editing && <button type="button" onClick={() => { setEditing(null); setForm(emptyForm); }}><X /></button>}</div>
        {([["title", "text", t.title], ["source", "text", t.source], ["author", "text", t.author]] as const).map(([key, type, label]) => <label key={key} className="mb-4 block text-xs font-bold">{label}<Input type={type} className="mt-1 h-11" value={String(form[key])} onChange={(event) => updateForm(key, event.target.value)} /></label>)}
        <label className="mb-4 block text-xs font-bold">{t.description}<Textarea className="mt-1 min-h-32" value={form.description} onChange={(event) => updateForm("description", event.target.value)} /></label>
        <label className="mb-4 block text-xs font-bold">{t.articleBody}<RichTextEditor value={(form.body ?? "")} onChange={(v) => updateForm("body", v)} placeholder="Write the article content here. Supports basic formatting." /></label>
        <label className="mb-4 block text-xs font-bold">{t.image}<Input className="mt-1 h-11" value={form.image} onChange={(event) => updateForm("image", event.target.value)} /><span className="mt-2 flex items-center gap-2"><input type="file" accept="image/*" disabled={uploading} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setUploading(true); try { updateForm("image", await uploadArticleImage(file)); toast.success("Image uploaded"); } catch (error) { toast.error(errorMessage(error)); } finally { setUploading(false); } }} />{uploading && <span className="text-xs">{t.uploading}</span>}</span></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">{t.category}<select className="mt-1 h-11 w-full border bg-transparent px-3" value={form.category} onChange={(event) => updateForm("category", event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.en}</option>)}</select></label><label className="text-xs font-bold">{t.language}<select className="mt-1 h-11 w-full border bg-transparent px-3" value={form.language} onChange={(event) => updateForm("language", event.target.value as Lang)}><option value="en">English</option><option value="ar">العربية</option></select></label></div>
        <label className="mt-4 block text-xs font-bold">{t.tags}<Input className="mt-1 h-11" placeholder="transfer, analysis, premier-league" value={(form.tags ?? []).join(", ")} onChange={(event) => updateForm("tags", event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))} /></label>
        <label className="mt-4 block text-xs font-bold">{t.date}<Input type="datetime-local" className="mt-1 h-11" value={form.publicationDate.slice(0, 16)} onChange={(event) => updateForm("publicationDate", new Date(event.target.value).toISOString())} /></label>
        <div className="mt-4 flex flex-wrap gap-5 text-xs font-bold"><label className="flex items-center gap-2"><input type="checkbox" checked={form.published} onChange={(event) => updateForm("published", event.target.checked)} />{t.published}</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.featured} onChange={(event) => updateForm("featured", event.target.checked)} />{t.featuredLabel}</label></div>
        {save.isError && <p className="mt-4 border border-red-300 bg-red-50 p-3 text-xs text-red-700">{errorMessage(save.error)}</p>}<div className="mt-5 flex gap-3"><Button disabled={save.isPending || uploading} type="submit">{save.isPending ? "Saving…" : editing ? copy.en.update : copy.en.save}</Button><Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(emptyForm); }}>{copy.en.cancel}</Button></div></form>
        <section><div className="mb-4 flex flex-wrap gap-3"><Input placeholder="Search newsroom…" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }} className="h-11 flex-1" /><select aria-label={copy.en.sort} className="h-11 border bg-transparent px-3 text-xs" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">{copy.en.newest}</option><option value="oldest">{copy.en.oldest}</option><option value="title">{copy.en.titleSort}</option></select><a href="/" className="flex items-center border px-4 text-xs">Public</a></div><div className="overflow-hidden border bg-[hsl(var(--card))]">{articles.length ? articles.map((article) => <div key={article.id} className="grid gap-3 border-b p-4 md:grid-cols-[80px_1fr_auto] md:items-center"><img loading="lazy" decoding="async" src={article.image} alt={article.title} className="h-16 w-20 object-cover" onError={(event) => { const img = event.currentTarget; if (!img.dataset.errored) { img.dataset.errored = "1"; img.src = "/football-editorial.png"; } }} /><div><div className="flex flex-wrap gap-2 font-mono-sport text-[9px] uppercase"><span>{article.language}</span><span>{article.category}</span>{article.published ? <span className="text-green-600">{copy.en.published}</span> : <span>{copy.en.draft}</span>}{article.featured && <span className="text-[hsl(var(--primary))]">{copy.en.featuredLabel}</span>}</div><h3 className="mt-1 font-display text-xl font-bold">{article.title}</h3><p className="text-xs text-[hsl(var(--muted-foreground))]">{article.source} · {article.author}{article.readingTime && <> · {article.readingTime} {copy.en.readTime}</>}</p>{article.tags.length > 0 && <p className="mt-1 text-xs opacity-60">{article.tags.join(" · ")}</p>}</div><div className="flex flex-wrap gap-1"><button className="border p-2" title={copy.en.edit} onClick={() => startEdit(article)}><Pencil size={14} /></button><button className="border p-2" onClick={() => pub.mutate({ id: article.id, published: !article.published })}>{article.published ? <X size={14} /> : <Check size={14} />}</button><button className="border p-2" onClick={() => feat.mutate({ id: article.id, featured: !article.featured })} title={copy.en.featuredLabel}><Star size={14} className={article.featured ? "fill-current" : ""} /></button><button className="border p-2" onClick={() => { if (window.confirm("Delete this article?")) del.mutate(article.id); }} title={copy.en.delete}><Trash2 size={14} /></button></div></div>) : <p className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">{copy.en.emptyAdmin}</p>}</div>
          <PageNav page={news.data?.page ?? page} totalPages={news.data?.totalPages ?? 0} onChange={setPage} lang="en" />
        </section></div></>}
    </main></div>;
}

function Account() {
  const [registerMode, setRegisterMode] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const me = useQuery({ queryKey: ["account-me"], queryFn: accountApi.me, retry: false });
  const auth = useMutation({
    mutationFn: () => mode === "register" ? accountApi.register(name, email, password) : accountApi.login(email, password),
    onSuccess: (user) => { queryClient.setQueryData(["account-me"], user); toast.success(mode === "register" ? "Account created" : "Signed in"); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const logout = useMutation({ mutationFn: accountApi.logout, onSuccess: () => { queryClient.setQueryData(["account-me"], null); toast.success("Signed out"); } });
  const changePw = useMutation({
    mutationFn: () => accountApi.changePassword(currentPassword, newPassword),
    onSuccess: () => { toast.success("Password changed"); setCurrentPassword(""); setNewPassword(""); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const forgotPw = useMutation({
    mutationFn: () => accountApi.forgotPassword(email),
    onSuccess: () => { toast.success("Reset link sent (check server logs)"); setMode("reset"); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const resetPw = useMutation({
    mutationFn: () => accountApi.resetPassword(resetToken, resetPassword),
    onSuccess: () => { toast.success("Password reset! Please sign in."); setMode("login"); setResetToken(""); setResetPassword(""); },
    onError: (error) => toast.error(errorMessage(error)),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rt = params.get("reset");
    if (rt) { setResetToken(rt); setMode("reset"); }
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((sub) => setPushSubscribed(Boolean(sub))).catch(() => {});
    }
  }, []);

  const togglePush = async () => {
    try {
      if (pushSubscribed) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) { await sub.unsubscribe(); setPushSubscribed(false); toast.success("Notifications disabled"); }
      } else {
        if (Notification.permission !== "granted") {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") { toast.error("Notification permission denied"); return; }
        }
        toast.success("Push notifications enabled");
        setPushSubscribed(true);
      }
    } catch { toast.error("Push notifications are not available"); }
  };

  if (me.data) return <div className="min-h-screen bg-[hsl(var(--background))]" dir="ltr"><Header lang="en" setLang={() => {}} onSearch={() => {}} dark={false} setDark={() => {}} /><main id="main-content" className="mx-auto max-w-xl px-5 py-16">
    <div className="border bg-[hsl(var(--card))] p-8">
      <p className="font-mono-sport text-[10px] uppercase text-[hsl(var(--primary))]">SPORTYRA / ACCOUNT</p>
      <h1 className="mt-3 font-display text-4xl font-bold">{me.data.name}</h1>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{me.data.email}</p>
      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Role: <span className="font-bold uppercase">{me.data.role}</span></p>
      <p className="mt-6 border-t pt-5 text-sm">{copy.en.accountWelcome}</p>
      <div className="mt-6 space-y-6">
        <div className="border-t pt-5">
          <h3 className="font-display text-lg font-bold mb-3"><Key size={16} className="inline mr-2" />{copy.en.changePassword}</h3>
          <label className="mb-3 block text-xs font-bold">{copy.en.currentPassword}<Input type="password" className="mt-1 h-11" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
          <label className="mb-3 block text-xs font-bold">{copy.en.newPassword}<Input type="password" className="mt-1 h-11" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
          <Button onClick={() => changePw.mutate()} disabled={changePw.isPending || !currentPassword || !newPassword}>{changePw.isPending ? "…" : copy.en.changePassword}</Button>
        </div>
        <div className="border-t pt-5">
          <h3 className="font-display text-lg font-bold mb-3"><Bell size={16} className="inline mr-2" />Push Notifications</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-3">Receive browser notifications for new stories.</p>
          <Button variant="outline" onClick={togglePush}>{pushSubscribed ? "Disable notifications" : "Enable notifications"}</Button>
        </div>
      </div>
      <Button className="mt-6" disabled={logout.isPending} onClick={() => logout.mutate()}>{copy.en.logoutAccount}</Button>
      <a className="ml-3 inline-block border px-4 py-2 text-sm" href="/">Back to site</a>
    </div>
  </main></div>;

  if (mode === "forgot") return <div className="min-h-screen bg-[hsl(var(--background))]" dir="ltr"><Header lang="en" setLang={() => {}} onSearch={() => {}} dark={false} setDark={() => {}} /><main id="main-content" className="mx-auto max-w-md px-5 py-16"><div className="border bg-[hsl(var(--card))] p-8"><Logo /><h1 className="mt-8 font-display text-3xl font-bold">{copy.en.forgotPassword}</h1><label className="mt-6 block text-xs font-bold">Email<Input className="mt-1 h-11" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><Button className="mt-5 w-full" disabled={forgotPw.isPending} onClick={() => forgotPw.mutate()}>{forgotPw.isPending ? "…" : "Send reset link"}</Button><button className="mt-5 text-sm underline" onClick={() => setMode("login")}>← Back to sign in</button></div></main></div>;

  if (mode === "reset") return <div className="min-h-screen bg-[hsl(var(--background))]" dir="ltr"><Header lang="en" setLang={() => {}} onSearch={() => {}} dark={false} setDark={() => {}} /><main id="main-content" className="mx-auto max-w-md px-5 py-16"><div className="border bg-[hsl(var(--card))] p-8"><Logo /><h1 className="mt-8 font-display text-3xl font-bold">{copy.en.resetPassword}</h1><label className="mt-6 block text-xs font-bold">{copy.en.resetToken}<Input className="mt-1 h-11" value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder="Paste reset token" /></label><label className="mt-4 block text-xs font-bold">{copy.en.password}<Input type="password" className="mt-1 h-11" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} /></label><Button className="mt-5 w-full" disabled={resetPw.isPending} onClick={() => resetPw.mutate()}>{resetPw.isPending ? "…" : copy.en.submitReset}</Button><button className="mt-5 text-sm underline" onClick={() => setMode("login")}>← Back to sign in</button></div></main></div>;

  return <div className="min-h-screen bg-[hsl(var(--background))]" dir="ltr"><Header lang="en" setLang={() => {}} onSearch={() => {}} dark={false} setDark={() => {}} /><main id="main-content" className="mx-auto max-w-md px-5 py-16"><div className="border bg-[hsl(var(--card))] p-8"><Logo /><h1 className="mt-8 font-display text-4xl font-bold">{mode === "register" ? copy.en.registerAccount : copy.en.loginAccount}</h1>{mode === "register" && <label className="mt-6 block text-xs font-bold">{copy.en.name}<Input className="mt-1 h-11" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}<label className="mt-6 block text-xs font-bold">Email<Input className="mt-1 h-11" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label><label className="mt-4 block text-xs font-bold">{copy.en.password}<Input className="mt-1 h-11" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} /></label><Button className="mt-5 w-full" disabled={auth.isPending} onClick={() => auth.mutate()}>{auth.isPending ? "…" : mode === "register" ? copy.en.register : copy.en.signIn}</Button>{auth.isError && <p className="mt-4 text-sm text-red-600">{errorMessage(auth.error)}</p>}<div className="mt-5 flex flex-col gap-2"><button className="text-sm underline text-left" onClick={() => setMode(mode === "register" ? "login" : "register")}>{mode === "register" ? copy.en.haveAccount : copy.en.noAccount} {mode === "register" ? copy.en.signIn : copy.en.register}</button>{mode === "login" && <button className="text-sm underline text-left" onClick={() => setMode("forgot")}>{copy.en.forgotPassword}</button>}</div><a href="/" className="mt-5 block text-center text-sm">← Back to site</a></div></main></div>;
}

function LiveMatchPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [dark, setDark] = useDarkMode();
  const [filter, setFilter] = useState("all");
  const t = copy[lang];
  useSeo({ title: "Live Match Center — Sportyra News", description: t.liveScores });
  const matches = useQuery({ queryKey: ["matches", filter], queryFn: () => matchesApi.list({ filter: filter === "all" ? undefined : filter, limit: 30 }) });
  const items = matches.data?.items ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const detail = useQuery({ queryKey: ["match", selectedId], queryFn: () => matchesApi.get(selectedId!), enabled: selectedId !== null });
  const selected = detail.data;
  return <div className="min-h-screen bg-[hsl(var(--background))]" dir={lang === "ar" || lang === "ku" ? "rtl" : "ltr"}>
    <Header lang={lang} setLang={setLang} onSearch={() => {}} dark={dark} setDark={setDark} />
    <main id="main-content" className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12">
      <div className="mb-8 border-b-2 border-[hsl(var(--foreground))] pb-4">
        <p className="font-mono-sport text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">Live Scores</p>
        <h1 className="font-display text-4xl font-bold tracking-[-.06em]">{t.matchCenter}</h1>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {[{ id: "all", label: t.allMatches }, { id: "live", label: t.liveNow }, { id: "scheduled", label: t.upcoming }, { id: "finished", label: t.finished }].map((f) => <button key={f.id} onClick={() => { setFilter(f.id); setSelectedId(null); }} className={`whitespace-nowrap border px-4 py-2 text-[11px] font-bold uppercase ${filter === f.id ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white" : ""}`}>{f.label}</button>)}
      </div>
      {selected ? <div className="mb-8 border bg-[hsl(var(--card))] p-6">
        <button onClick={() => setSelectedId(null)} className="mb-4 text-sm underline text-[hsl(var(--primary))]">← Back to all matches</button>
        <div className="mb-4 flex items-center gap-2 text-[10px] uppercase font-mono-sport text-[hsl(var(--muted-foreground))]"><span>{selected.competitionName}</span><span>·</span><span>{new Date(selected.matchDate).toLocaleDateString()}</span></div>
        <div className="grid grid-cols-3 items-center gap-4 text-center">
          <div><div className="font-display text-3xl font-bold">{selected.homeScore ?? 0}</div><div className="mt-1 text-sm font-bold">{selected.homeTeamName}</div></div>
          <div><div className="font-display text-4xl font-bold text-[hsl(var(--primary))]">{selected.status === "finished" ? "FT" : selected.status === "live" ? `${selected.minute ?? 0}'` : "vs"}</div>{selected.status === "live" && <div className="mt-1 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />}</div>
          <div><div className="font-display text-3xl font-bold">{selected.awayScore ?? 0}</div><div className="mt-1 text-sm font-bold">{selected.awayTeamName}</div></div>
        </div>
        {selected.events && selected.events.length > 0 && <div className="mt-6 border-t pt-4">
          <h3 className="mb-3 font-mono-sport text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Events</h3>
          <div className="space-y-2">{selected.events.map((ev) => <div key={ev.id} className="flex items-center gap-3 text-sm">
            <span className="w-8 text-right font-mono-sport text-[10px] text-[hsl(var(--muted-foreground))]">{ev.minute ?? "-"}'</span>
            <span className={`h-3 w-3 rounded-full ${ev.eventType === "goal" ? "bg-green-500" : ev.eventType === "yellow_card" ? "bg-yellow-400" : ev.eventType === "red_card" ? "bg-red-600" : "bg-gray-400"}`} />
            <span className="font-bold">{ev.playerName}</span>
            <span className="text-[hsl(var(--muted-foreground))]">({ev.teamSide})</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">{ev.eventType === "goal" ? "⚽" : ev.eventType === "yellow_card" ? "🟨" : ev.eventType === "red_card" ? "🟥" : "🔄"} {ev.detail ?? ev.eventType}</span>
          </div>)}</div>
        </div>}
        {selected.stats && <div className="mt-6 border-t pt-4">
          <h3 className="mb-3 font-mono-sport text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.matchStats}</h3>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[["Possession", selected.stats.possession], ["Shots", selected.stats.shots], ["Corners", selected.stats.corners], ["Fouls", selected.stats.fouls]].map(([label, val]) => <div key={String(label)} className="text-center"><div className="font-mono-sport text-[10px] uppercase text-[hsl(var(--muted-foreground))]">{String(label)}</div><div className="mt-1 font-display text-lg font-bold">{val ? JSON.stringify(val) : "-"}</div></div>)}</div>
        </div>}
      </div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{matches.isLoading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-40" />) : items.length === 0 ? <div className="col-span-full py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noMatches}</div> : items.map((m) => <button key={m.id} onClick={() => setSelectedId(m.id)} className="border bg-[hsl(var(--card))] p-4 text-left transition hover:shadow-md">
        <div className="mb-2 flex items-center justify-between"><span className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{m.competitionName}</span>{m.status === "live" ? <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-red-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> LIVE {m.minute ? `${m.minute}'` : ""}</span> : <span className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{m.status === "finished" ? "FT" : new Date(m.matchDate).toLocaleDateString()}</span>}</div>
        <div className="grid grid-cols-3 items-center gap-2 text-center"><div className="text-sm font-bold">{m.homeTeamName}</div><div className="font-display text-2xl font-bold">{m.homeScore ?? 0} - {m.awayScore ?? 0}</div><div className="text-sm font-bold">{m.awayTeamName}</div></div>
        {m.status === "live" && <div className="mt-2 h-0.5 w-full animate-pulse bg-red-500" />}
      </button>)}</div>}
    </main>
  </div>;
}

function TransferCenterPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [dark, setDark] = useDarkMode();
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const t = copy[lang];
  useSeo({ title: "Transfer Center — Sportyra News", description: t.transferCenter });
  const transfers = useQuery({ queryKey: ["transfers", statusFilter, searchQuery], queryFn: () => transfersApi.list({ status: statusFilter || undefined, search: searchQuery || undefined, limit: 30 }) });
  const items = transfers.data?.items ?? [];
  const statusColor = (s: string) => s === "confirmed" || s === "completed" ? "text-green-600 border-green-200" : s === "rumour" ? "text-blue-600 border-blue-200" : s === "negotiating" ? "text-amber-600 border-amber-200" : "text-gray-600 border-gray-200";
  return <div className="min-h-screen bg-[hsl(var(--background))]" dir={lang === "ar" || lang === "ku" ? "rtl" : "ltr"}>
    <Header lang={lang} setLang={setLang} onSearch={() => {}} dark={dark} setDark={setDark} />
    <main id="main-content" className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12">
      <div className="mb-8 border-b-2 border-[hsl(var(--foreground))] pb-4">
        <p className="font-mono-sport text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">Transfers</p>
        <h1 className="font-display text-4xl font-bold tracking-[-.06em]">{t.transferCenter}</h1>
      </div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-2">{[{ id: "", label: t.all }, { id: "confirmed", label: t.confirmed }, { id: "completed", label: t.completed }, { id: "negotiating", label: t.negotiating }, { id: "rumour", label: t.rumour }].map((s) => <button key={s.id} onClick={() => setStatusFilter(s.id)} className={`whitespace-nowrap border px-3 py-1.5 text-[10px] font-bold uppercase ${statusFilter === s.id ? "border-[hsl(var(--foreground))] bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : ""}`}>{s.label}</button>)}</div>
        <Input placeholder={`${t.search}...`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-9 w-full sm:w-64" />
      </div>
      {transfers.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-36" />)}</div> : items.length === 0 ? <div className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noTransfers}</div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((tr) => <div key={tr.id} className="border bg-[hsl(var(--card))] p-5 transition hover:shadow-md">
        <div className="mb-3 flex items-center justify-between"><span className={`border px-2 py-0.5 text-[9px] font-bold uppercase ${statusColor(tr.status)}`}>{tr.status}</span>{tr.fee && <span className="font-mono-sport text-[10px] text-[hsl(var(--muted-foreground))]">{tr.fee}</span>}</div>
        <div className="text-center"><div className="text-sm font-bold">{tr.playerName}</div><div className="my-2 flex items-center justify-center gap-2 text-xs"><span>{tr.fromClub}</span><span className="text-[hsl(var(--primary))]">→</span><span className="font-bold">{tr.toClub}</span></div></div>
        <div className="mt-3 flex items-center justify-between text-[9px] text-[hsl(var(--muted-foreground))]"><span>{tr.transferType}</span>{tr.transferDate && <span>{new Date(tr.transferDate).toLocaleDateString()}</span>}</div>
        {tr.isDemo && <div className="mt-2 text-center font-mono-sport text-[8px] uppercase text-[hsl(var(--primary))]">DEMO</div>}
      </div>)}</div>}
    </main>
  </div>;
}

function PlayerProfilesPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [dark, setDark] = useDarkMode();
  const [search, setSearch] = useState("");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const t = copy[lang];
  useSeo({ title: "Player Profiles — Sportyra News", description: t.playerProfiles });
  const players = useQuery({ queryKey: ["players", search], queryFn: () => playersApi.list({ search: search || undefined, limit: 30 }) });
  const items = players.data?.items ?? [];
  const detail = useQuery({ queryKey: ["player", selectedSlug], queryFn: () => playersApi.get(selectedSlug!), enabled: selectedSlug !== null });
  const p = detail.data;
  if (selectedSlug && p) return <div className="min-h-screen bg-[hsl(var(--background))]" dir={lang === "ar" || lang === "ku" ? "rtl" : "ltr"}>
    <Header lang={lang} setLang={setLang} onSearch={() => {}} dark={dark} setDark={setDark} />
    <main id="main-content" className="mx-auto max-w-[1000px] px-5 py-10 lg:px-12">
      <button onClick={() => setSelectedSlug(null)} className="mb-6 text-sm underline text-[hsl(var(--primary))]">← {t.all}</button>
      <div className="grid gap-8 md:grid-cols-[280px_1fr]">
        <div className="border bg-[hsl(var(--card))] p-6 text-center">
          <div className="mx-auto mb-4 h-40 w-40 rounded-full bg-[hsl(var(--muted))] flex items-center justify-center text-4xl font-bold text-[hsl(var(--muted-foreground))]">{p.name.split(" ").map((n) => n[0]).join("")}</div>
          <h1 className="font-display text-2xl font-bold">{p.name}</h1>
          {p.club && <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{p.club}</p>}
          {p.nationality && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{p.nationality}</p>}
          {p.position && <div className="mt-3 inline-block border px-3 py-1 text-[10px] font-bold uppercase">{p.position}</div>}
        </div>
        <div>
          <div className="mb-6 grid grid-cols-3 gap-4 text-center">{[{ v: p.goals, l: t.goals }, { v: p.assists, l: t.assists }, { v: p.appearances, l: t.appearances }].map((s) => <div key={s.l} className="border bg-[hsl(var(--card))] p-4"><div className="font-display text-2xl font-bold">{s.v}</div><div className="mt-1 font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{s.l}</div></div>)}</div>
          {p.biography && <div className="mb-6 border bg-[hsl(var(--card))] p-5"><h3 className="mb-2 font-mono-sport text-[10px] uppercase text-[hsl(var(--muted-foreground))]">{t.biography}</h3><p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">{p.biography}</p></div>}
          {p.trophies && p.trophies.length > 0 && <div className="border bg-[hsl(var(--card))] p-5"><h3 className="mb-2 font-mono-sport text-[10px] uppercase text-[hsl(var(--muted-foreground))]">{t.trophies}</h3><div className="flex flex-wrap gap-2">{p.trophies.map((trophy) => <span key={trophy} className="border border-[hsl(var(--primary)/.2)] px-2 py-0.5 text-xs">{trophy}</span>)}</div></div>}
          {p.isDemo && <div className="mt-4 text-center font-mono-sport text-[9px] uppercase text-[hsl(var(--primary))]">DEMO DATA</div>}
        </div>
      </div>
    </main>
  </div>;
  return <div className="min-h-screen bg-[hsl(var(--background))]" dir={lang === "ar" || lang === "ku" ? "rtl" : "ltr"}>
    <Header lang={lang} setLang={setLang} onSearch={() => {}} dark={dark} setDark={setDark} />
    <main id="main-content" className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12">
      <div className="mb-8 border-b-2 border-[hsl(var(--foreground))] pb-4">
        <p className="font-mono-sport text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">Players</p>
        <h1 className="font-display text-4xl font-bold tracking-[-.06em]">{t.playerProfiles}</h1>
      </div>
      <Input placeholder={`${t.search}...`} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-6 h-10 w-full max-w-md" />
      {players.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-48" />)}</div> : items.length === 0 ? <div className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noPlayers}</div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{items.map((pl) => <button key={pl.id} onClick={() => setSelectedSlug(pl.slug)} className="border bg-[hsl(var(--card))] p-4 text-left transition hover:shadow-md">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-lg font-bold text-[hsl(var(--muted-foreground))]">{pl.name.split(" ").map((n) => n[0]).join("")}</div>
        <h3 className="font-display text-lg font-bold">{pl.name}</h3>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{pl.club ?? "—"}</p>
        <div className="mt-2 flex gap-3 text-[10px] font-mono-sport text-[hsl(var(--muted-foreground))]"><span>{pl.goals} {t.goals}</span><span>{pl.assists} {t.assists}</span></div>
        {pl.isDemo && <div className="mt-1 font-mono-sport text-[8px] uppercase text-[hsl(var(--primary))]">DEMO</div>}
      </button>)}</div>}
    </main>
  </div>;
}

function PredictionsPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [dark, setDark] = useDarkMode();
  const t = copy[lang];
  useSeo({ title: "Predictions & Leaderboard — Sportyra News", description: t.predictions });
  const [tab, setTab] = useState<"matches" | "leaderboard" | "myPredictions">("matches");
  const matches = useQuery({ queryKey: ["matches", "scheduled"], queryFn: () => matchesApi.list({ filter: "scheduled", limit: 20 }) });
  const leaderboard = useQuery({ queryKey: ["leaderboard"], queryFn: () => predictionsApi.leaderboard() });
  const predictions = useQuery({ queryKey: ["myPredictions", 1], queryFn: () => predictionsApi.userPredictions(1) });
  const leaderboardItems = leaderboard.data?.items ?? [];
  const predictionItems = predictions.data?.items ?? [];
  const predictMutation = useMutation({ mutationFn: (vars: { matchId: number; prediction: string }) => predictionsApi.submit(1, vars.matchId, vars.prediction), onSuccess: () => { predictions.refetch(); toast.success(t.predictionSubmitted); }, onError: (e: Error) => { toast.error(e.message.includes("already") ? t.alreadyPredicted : "Error"); } });
  return <div className="min-h-screen bg-[hsl(var(--background))]" dir={lang === "ar" || lang === "ku" ? "rtl" : "ltr"}>
    <Header lang={lang} setLang={setLang} onSearch={() => {}} dark={dark} setDark={setDark} />
    <main id="main-content" className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12">
      <div className="mb-8 border-b-2 border-[hsl(var(--foreground))] pb-4">
        <p className="font-mono-sport text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">Fan Zone</p>
        <h1 className="font-display text-4xl font-bold tracking-[-.06em]">{t.predictions}</h1>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">{([["matches", t.allMatches], ["leaderboard", t.leaderboard], ["myPredictions", t.yourPredictions]] as const).map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap border px-4 py-2 text-[11px] font-bold uppercase ${tab === id ? "border-[hsl(var(--foreground))] bg-[hsl(var(--foreground))] text-[hsl(var(--background))]" : ""}`}>{label}</button>)}</div>
      {tab === "leaderboard" && <div className="border bg-[hsl(var(--card))]"><div className="grid grid-cols-[50px_1fr_80px_80px] gap-4 border-b p-4 font-mono-sport text-[10px] uppercase text-[hsl(var(--muted-foreground))]"><span>#</span><span>User</span><span>{t.points}</span><span>{t.correct}</span></div>{leaderboardItems.length === 0 ? <div className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noPredictions}</div> : leaderboardItems.map((entry) => <div key={entry.id} className={`grid grid-cols-[50px_1fr_80px_80px] gap-4 border-b p-4 text-sm ${entry.position <= 3 ? "bg-[hsl(var(--primary)/.05)]" : ""}`}><span className="font-display text-lg font-bold">{entry.position}</span><span className="font-bold">{entry.username}</span><span>{entry.totalPoints}</span><span>{entry.correctPredictions}/{entry.totalPredictions}</span></div>)}</div>}
      {tab === "matches" && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{matches.isLoading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-40" />) : (matches.data?.items ?? []).length === 0 ? <div className="col-span-full py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noMatches}</div> : (matches.data?.items ?? []).map((m) => <div key={m.id} className="border bg-[hsl(var(--card))] p-5">
        <div className="mb-2 font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{m.competitionName} · {new Date(m.matchDate).toLocaleDateString()}</div>
        <div className="mb-4 grid grid-cols-3 items-center gap-2 text-center"><div className="text-sm font-bold">{m.homeTeamName}</div><div className="font-display text-xl font-bold">vs</div><div className="text-sm font-bold">{m.awayTeamName}</div></div>
        <div className="flex gap-2">{[["home", t.predictHome], ["draw", t.predictDraw], ["away", t.predictAway]].map(([pred, label]) => <button key={pred} onClick={() => predictMutation.mutate({ matchId: m.id, prediction: pred })} className="flex-1 border border-[hsl(var(--foreground)/.15)] py-2 text-[10px] font-bold uppercase transition hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]">{label}</button>)}</div>
      </div>)}</div>}
      {tab === "myPredictions" && <div className="border bg-[hsl(var(--card))]">{predictionItems.length === 0 ? <div className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noPredictions}</div> : predictionItems.map((pred) => <div key={pred.id} className="grid grid-cols-[1fr_80px_80px] gap-4 border-b p-4 text-sm"><span>{pred.prediction} (Match #{pred.matchId})</span><span className={pred.result === "correct" ? "font-bold text-green-600" : pred.result === "wrong" ? "text-red-600" : "text-[hsl(var(--muted-foreground))]"}>{pred.result ?? "pending"}</span><span className="font-bold">{pred.points ?? 0} {t.points}</span></div>)}</div>}
    </main>
  </div>;
}

function SmartTrendingPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [dark, setDark] = useDarkMode();
  const t = copy[lang];
  useSeo({ title: "Trending Now — Sportyra News", description: t.smartTrending });
  const trending = useQuery({ queryKey: ["trending-smart"], queryFn: () => trendingApi.articles(20) });
  const articles = trending.data ?? [];
  return <div className="min-h-screen bg-[hsl(var(--background))]" dir={lang === "ar" || lang === "ku" ? "rtl" : "ltr"}>
    <Header lang={lang} setLang={setLang} onSearch={() => {}} dark={dark} setDark={setDark} />
    <main id="main-content" className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12">
      <div className="mb-8 border-b-2 border-[hsl(var(--foreground))] pb-4">
        <p className="font-mono-sport text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">🔥 {t.smartTrending}</p>
        <h1 className="font-display text-4xl font-bold tracking-[-.06em]">{t.trendingScore}</h1>
      </div>
      {trending.isLoading ? <div className="space-y-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div> : articles.length === 0 ? <div className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noNews}</div> : <div className="space-y-4">{articles.map((article, idx) => <a key={article.id} href={`/article/${article.id}/${article.slug ?? ""}`} className="flex items-start gap-4 border bg-[hsl(var(--card))] p-4 transition hover:shadow-md">
        <div className="flex-shrink-0 font-display text-3xl font-bold text-[hsl(var(--primary)/.3)]">{idx + 1}</div>
        <div className="flex-1"><h3 className="font-display text-lg font-bold leading-tight">{article.title}</h3><p className="mt-1 line-clamp-2 text-sm text-[hsl(var(--muted-foreground))]">{article.description}</p><div className="mt-2 flex items-center gap-3 text-[9px] font-mono-sport uppercase text-[hsl(var(--muted-foreground))]"><span>{article.category}</span><span>·</span><span>{article.author}</span><span>·</span><span>{new Date(article.publicationDate).toLocaleDateString()}</span></div></div>
        <img loading="lazy" src={article.image} alt="" className="hidden h-20 w-28 flex-shrink-0 object-cover sm:block" onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/football-editorial.png"; }} />
      </a>)}</div>}
    </main>
  </div>;
}

function StandingsPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [dark, setDark] = useDarkMode();
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const t = copy[lang];
  useSeo({ title: selectedLeague ? `${selectedLeague} Standings — Sportyra News` : "League Standings — Sportyra News", description: t.standings });
  const leagues = useQuery({ queryKey: ["standings-leagues"], queryFn: () => standingsApi.leagues() });
  const standings = useQuery({ queryKey: ["standings", selectedLeague], queryFn: () => standingsApi.get(selectedLeague!), enabled: selectedLeague !== null });
  const items = standings.data?.items ?? [];
  const formColors: Record<string, string> = { W: "bg-green-500 text-white", D: "bg-yellow-400 text-black", L: "bg-red-500 text-white", N: "bg-gray-300 text-black" };
  const zoneBorder: Record<string, string> = { "champions-league": "border-l-green-500", "europa-league": "border-l-blue-500", "conference-league": "border-l-orange-400", "relegation": "border-l-red-500", "safe": "border-l-transparent" };
  return <div className="min-h-screen bg-[hsl(var(--background))]" dir={lang === "ar" || lang === "ku" ? "rtl" : "ltr"}>
    <Header lang={lang} setLang={setLang} onSearch={() => {}} dark={dark} setDark={setDark} />
    <main id="main-content" className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12">
      <div className="mb-8 border-b-2 border-[hsl(var(--foreground))] pb-4">
        <p className="font-mono-sport text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]"><Trophy size={12} className="inline" /> STANDINGS</p>
        <h1 className="font-display text-4xl font-bold tracking-[-.06em]">{t.standings}</h1>
      </div>

      {!selectedLeague && <>
        <p className="mb-6 text-sm text-[hsl(var(--muted-foreground))]">{t.selectLeague}</p>
        {leagues.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div>
        : !leagues.data?.items || leagues.data.items.length === 0 ? <div className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noStandings}</div>
        : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{leagues.data.items.map((comp) => <button key={comp.league} onClick={() => setSelectedLeague(comp.league)} className="group flex items-center gap-4 border bg-[hsl(var(--card))] p-5 text-left transition hover:shadow-md">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-[hsl(var(--muted))] font-display text-sm font-bold text-[hsl(var(--muted-foreground))]">{comp.league.slice(0, 2)}</div>
            <div>
              <h3 className="font-display text-base font-bold group-hover:text-[hsl(var(--primary))]">{comp.league}</h3>
              {comp.country && <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{comp.country}</p>}
              <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">{comp.teamCount} teams</p>
            </div>
          </button>)}</div>}
      </>}

      {selectedLeague && <>
        <button onClick={() => setSelectedLeague(null)} className="mb-6 text-xs font-bold uppercase text-[hsl(var(--primary))]">← {t.selectLeague}</button>
        {standings.isLoading ? <div className="space-y-2">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
        : items.length === 0 ? <div className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noStandings}</div>
        : <>
          <div className="mb-4 flex items-center gap-3">
            <h2 className="font-display text-2xl font-bold">{standings.data?.league || selectedLeague}</h2>
            {standings.data?.country && <span className="border px-2 py-0.5 text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{standings.data.country}</span>}
          </div>
          <div className="overflow-x-auto border bg-[hsl(var(--card))]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-[hsl(var(--muted))]">
                  <th className="px-3 py-2 text-center font-mono-sport text-[9px] uppercase w-12">{t.pos}</th>
                  <th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase">{t.team}</th>
                  <th className="px-3 py-2 text-center font-mono-sport text-[9px] uppercase hidden sm:table-cell">{t.mp}</th>
                  <th className="px-3 py-2 text-center font-mono-sport text-[9px] uppercase hidden md:table-cell">{t.w}</th>
                  <th className="px-3 py-2 text-center font-mono-sport text-[9px] uppercase hidden md:table-cell">{t.d}</th>
                  <th className="px-3 py-2 text-center font-mono-sport text-[9px] uppercase hidden md:table-cell">{t.l}</th>
                  <th className="px-3 py-2 text-center font-mono-sport text-[9px] uppercase hidden lg:table-cell">{t.gf}</th>
                  <th className="px-3 py-2 text-center font-mono-sport text-[9px] uppercase hidden lg:table-cell">{t.ga}</th>
                  <th className="px-3 py-2 text-center font-mono-sport text-[9px] uppercase hidden lg:table-cell">{t.gd}</th>
                  <th className="px-3 py-2 text-center font-mono-sport text-[9px] uppercase">{t.pts}</th>
                  <th className="px-3 py-2 text-left font-mono-sport text-[9px] uppercase hidden md:table-cell">{t.form}</th>
                </tr>
              </thead>
              <tbody>{items.map((row, i) => <tr key={i} className={`border-b border-l-4 ${zoneBorder[row.zone] || "border-l-transparent"} transition hover:bg-[hsl(var(--muted)/.3)]`}>
                <td className="px-3 py-2.5 text-center font-display font-bold">{row.position ?? "—"}</td>
                <td className="px-3 py-2.5"><a href={`/teams/${row.slug}`} className="flex items-center gap-2 font-bold hover:text-[hsl(var(--primary))]">{row.badge ? <img src={row.badge} alt="" className="h-5 w-5 object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : null}{row.name}</a></td>
                <td className="px-3 py-2.5 text-center hidden sm:table-cell">{row.played ?? "—"}</td>
                <td className="px-3 py-2.5 text-center hidden md:table-cell">{row.won ?? "—"}</td>
                <td className="px-3 py-2.5 text-center hidden md:table-cell">{row.drawn ?? "—"}</td>
                <td className="px-3 py-2.5 text-center hidden md:table-cell">{row.lost ?? "—"}</td>
                <td className="px-3 py-2.5 text-center hidden lg:table-cell">{row.goalsFor ?? "—"}</td>
                <td className="px-3 py-2.5 text-center hidden lg:table-cell">{row.goalsAgainst ?? "—"}</td>
                <td className="px-3 py-2.5 text-center hidden lg:table-cell">{row.goalDifference != null ? (row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference) : "—"}</td>
                <td className="px-3 py-2.5 text-center font-display font-bold">{row.points ?? "—"}</td>
                <td className="px-3 py-2.5 hidden md:table-cell"><div className="flex gap-1">{row.form.slice(-5).map((f, fi) => <span key={fi} className={`flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold ${formColors[f] || "bg-gray-200"}`}>{f}</span>)}</div></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 border-l-4 border-l-green-500" />{t.championsLeagueZone}</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 border-l-4 border-l-blue-500" />{t.europaLeagueZone}</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 border-l-4 border-l-orange-400" />{t.conferenceLeagueZone}</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 border-l-4 border-l-red-500" />{t.relegationZone}</span>
          </div>
        </>}
      </>}
    </main>
  </div>;
}

function TeamsListPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [dark, setDark] = useDarkMode();
  const [search, setSearch] = useState("");
  const t = copy[lang];
  useSeo({ title: "Teams — Sportyra News", description: t.allTeams });
  const teams = useQuery({ queryKey: ["team-pages", search], queryFn: () => teamPagesApi.list({ search: search || undefined }) });
  const items = teams.data?.items ?? [];
  return <div className="min-h-screen bg-[hsl(var(--background))]" dir={lang === "ar" || lang === "ku" ? "rtl" : "ltr"}>
    <Header lang={lang} setLang={setLang} onSearch={() => {}} dark={dark} setDark={setDark} />
    <main id="main-content" className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12">
      <div className="mb-8 border-b-2 border-[hsl(var(--foreground))] pb-4">
        <p className="font-mono-sport text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">Clubs</p>
        <h1 className="font-display text-4xl font-bold tracking-[-.06em]">{t.allTeams}</h1>
      </div>
      <Input placeholder={`${t.search}...`} value={search} onChange={(e) => setSearch(e.target.value)} className="mb-6 h-10 w-full max-w-md" />
      {teams.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-44" />)}</div> : items.length === 0 ? <div className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">{t.noTeams}</div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((team) => <a key={team.id} href={`/teams/${team.slug}`} className="group border bg-[hsl(var(--card))] p-5 transition hover:shadow-md">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-lg font-bold text-[hsl(var(--muted-foreground))]">{team.badge ? <img src={team.badge} alt="" className="h-10 w-10 object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : team.shortName || team.name.slice(0, 3).toUpperCase()}</div>
        <h3 className="font-display text-lg font-bold group-hover:text-[hsl(var(--primary))]">{team.name}</h3>
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{team.league} · {team.country}</p>
        {team.leaguePosition && <div className="mt-2 inline-block border border-[hsl(var(--primary)/.2)] px-2 py-0.5 text-[9px] font-bold uppercase text-[hsl(var(--primary))]">#{team.leaguePosition} {t.leagueTable}</div>}
        {team.isDemo && <div className="mt-1 font-mono-sport text-[8px] uppercase text-[hsl(var(--primary))]">DEMO</div>}
      </a>)}</div>}
    </main>
  </div>;
}

function TeamProfilePage({ slug }: { slug: string }) {
  const [lang, setLang] = useState<Lang>("en");
  const [dark, setDark] = useDarkMode();
  const t = copy[lang];
  const team = useQuery({ queryKey: ["team-page", slug], queryFn: () => teamPagesApi.get(slug) });
  const d = team.data;
  useSeo({ title: d ? `${d.name} — Sportyra News` : "Team — Sportyra News", description: d?.description || d?.name || "" });
  if (team.isLoading) return <div className="min-h-screen bg-[hsl(var(--background))]" dir="ltr"><Header lang={lang} setLang={setLang} onSearch={() => {}} dark={dark} setDark={setDark} /><main className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12"><div className="skeleton h-48 mb-6" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-32" />)}</div></main></div>;
  if (!d) return <NotFound />;
  const formColors: Record<string, string> = { W: "bg-green-500 text-white", D: "bg-yellow-400 text-black", L: "bg-red-500 text-white", N: "bg-gray-300 text-black" };
  return <div className="min-h-screen bg-[hsl(var(--background))]" dir={lang === "ar" || lang === "ku" ? "rtl" : "ltr"}>
    <Header lang={lang} setLang={setLang} onSearch={() => {}} dark={dark} setDark={setDark} />
    <main id="main-content" className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12">
      <div className="mb-8 border-b-2 border-[hsl(var(--foreground))] pb-4">
        <a href="/teams" className="mb-2 inline-block text-xs font-bold uppercase text-[hsl(var(--primary))]">← {t.teams}</a>
        <div className="flex items-center gap-4">
          {d.badge && <img src={d.badge} alt="" className="h-16 w-16 object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
          <div>
            <h1 className="font-display text-3xl font-bold tracking-[-.04em] sm:text-5xl">{d.name}</h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{d.league} · {d.country}</p>
          </div>
        </div>
        {d.isDemo && <div className="mt-2 font-mono-sport text-[9px] uppercase text-[hsl(var(--primary))]">DEMO DATA</div>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {d.description && <div className="border bg-[hsl(var(--card))] p-5"><p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">{d.description}</p></div>}

          {d.form && d.form.length > 0 && <div className="border bg-[hsl(var(--card))] p-5">
            <h3 className="mb-3 font-mono-sport text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.form} (Last {d.form.length})</h3>
            <div className="flex gap-2">{d.form.map((f, i) => <span key={i} className={`flex h-9 w-9 items-center justify-center rounded font-display text-sm font-bold ${formColors[f] || "bg-gray-200"}`}>{f}</span>)}</div>
          </div>}

          {d.recentMatches && d.recentMatches.length > 0 && <div className="border bg-[hsl(var(--card))] p-5">
            <h3 className="mb-3 font-mono-sport text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.recentResults}</h3>
            <div className="space-y-2">{d.recentMatches.map((m) => {
              const isHome = m.homeTeamName.toLowerCase() === d.name.toLowerCase();
              const teamScore = isHome ? m.homeScore : m.awayScore;
              const oppScore = isHome ? m.awayScore : m.homeScore;
              const won = teamScore != null && oppScore != null && teamScore > oppScore;
              const lost = teamScore != null && oppScore != null && teamScore < oppScore;
              const resultColor = m.status === "finished" ? (won ? "border-l-green-500" : lost ? "border-l-red-500" : "border-l-yellow-400") : "";
              return <div key={m.id} className={`flex items-center justify-between border-l-4 ${resultColor} bg-[hsl(var(--muted)/.3)] px-3 py-2 text-sm`}>
                <div className="flex-1"><span className={`font-bold ${isHome ? "" : "text-[hsl(var(--primary))]"}`}>{m.homeTeamName}</span> <span className="text-[hsl(var(--muted-foreground))]">vs</span> <span className={`font-bold ${!isHome ? "" : "text-[hsl(var(--primary))]"}`}>{m.awayTeamName}</span></div>
                <div className="flex items-center gap-3"><span className="font-display text-lg font-bold">{m.homeScore ?? "-"} — {m.awayScore ?? "-"}</span><span className="text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{new Date(m.matchDate).toLocaleDateString()}</span></div>
              </div>;
            })}</div>
          </div>}

          {d.upcomingMatches && d.upcomingMatches.length > 0 && <div className="border bg-[hsl(var(--card))] p-5">
            <h3 className="mb-3 font-mono-sport text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.upcoming}</h3>
            <div className="space-y-2">{d.upcomingMatches.map((m) => {
              const isHome = m.homeTeamName.toLowerCase() === d.name.toLowerCase();
              return <div key={m.id} className="flex items-center justify-between bg-[hsl(var(--muted)/.3)] px-3 py-2 text-sm">
                <div className="flex-1"><span className={`font-bold ${isHome ? "" : "text-[hsl(var(--primary))]"}`}>{m.homeTeamName}</span> <span className="text-[hsl(var(--muted-foreground))]">vs</span> <span className={`font-bold ${!isHome ? "" : "text-[hsl(var(--primary))]"}`}>{m.awayTeamName}</span></div>
                <div className="flex items-center gap-3"><span className="text-[9px] uppercase text-[hsl(var(--muted-foreground))]">{new Date(m.matchDate).toLocaleDateString()}</span>{m.competitionName && <span className="border px-1.5 py-0.5 text-[8px] uppercase">{m.competitionName}</span>}</div>
              </div>;
            })}</div>
          </div>}

          {d.squad && d.squad.length > 0 && <div className="border bg-[hsl(var(--card))] p-5">
            <h3 className="mb-3 font-mono-sport text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.squad} ({d.squad.length})</h3>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-[hsl(var(--muted))]"><th className="px-2 py-2 text-center font-mono-sport text-[9px] uppercase w-8">{t.shirtNo}</th><th className="px-2 py-2 text-left font-mono-sport text-[9px] uppercase">{t.name}</th><th className="px-2 py-2 text-left font-mono-sport text-[9px] uppercase hidden sm:table-cell">{t.position}</th><th className="px-2 py-2 text-left font-mono-sport text-[9px] uppercase hidden md:table-cell">{t.nationality}</th><th className="px-2 py-2 text-center font-mono-sport text-[9px] uppercase">{t.goals}</th><th className="px-2 py-2 text-center font-mono-sport text-[9px] uppercase">{t.assists}</th></tr></thead><tbody>{d.squad.map((p) => <tr key={p.id} className="border-b"><td className="px-2 py-2 text-center font-bold">{p.shirtNumber ?? "—"}</td><td className="px-2 py-2"><a href={`/players`} className="font-bold hover:text-[hsl(var(--primary))]">{p.name}</a></td><td className="px-2 py-2 text-xs hidden sm:table-cell">{p.position || "—"}</td><td className="px-2 py-2 text-xs hidden md:table-cell">{p.nationality || "—"}</td><td className="px-2 py-2 text-center font-bold">{p.goals}</td><td className="px-2 py-2 text-center font-bold">{p.assists}</td></tr>)}</tbody></table></div>
          </div>}

          {d.relatedNews && d.relatedNews.length > 0 && <div className="border bg-[hsl(var(--card))] p-5">
            <h3 className="mb-3 font-mono-sport text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.relatedNews}</h3>
            <div className="grid gap-3 sm:grid-cols-2">{d.relatedNews.map((article) => <a key={article.id} href={`/article/${article.id}/${article.slug ?? ""}`} className="flex gap-3 border border-[hsl(var(--foreground)/.08)] p-3 transition hover:shadow-sm">
              <img loading="lazy" src={article.image} alt="" className="h-16 w-20 flex-shrink-0 object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/football-editorial.png"; }} />
              <div className="flex-1 min-w-0"><h4 className="line-clamp-2 text-sm font-bold leading-tight">{article.title}</h4><p className="mt-1 text-[9px] text-[hsl(var(--muted-foreground))]">{article.author} · {new Date(article.publicationDate).toLocaleDateString()}</p></div>
            </a>)}</div>
          </div>}

          {d.relatedTransfers && d.relatedTransfers.length > 0 && <div className="border bg-[hsl(var(--card))] p-5">
            <h3 className="mb-3 font-mono-sport text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.relatedTransfers}</h3>
            <div className="grid gap-2 sm:grid-cols-2">{d.relatedTransfers.map((tr) => <div key={tr.id} className="flex items-center justify-between border border-[hsl(var(--foreground)/.08)] px-3 py-2 text-sm">
              <div className="min-w-0 flex-1"><span className="font-bold">{tr.playerName}</span><span className="mx-1 text-[hsl(var(--muted-foreground))]">·</span><span className="text-xs text-[hsl(var(--muted-foreground))]">{tr.fromClub} → {tr.toClub}</span></div>
              <div className="flex items-center gap-2"><span className={`text-[8px] font-bold uppercase ${tr.status === "confirmed" || tr.status === "completed" ? "text-green-600" : tr.status === "rumour" ? "text-blue-600" : "text-amber-600"}`}>{tr.status}</span>{tr.fee && <span className="text-[9px] text-[hsl(var(--muted-foreground))]">{tr.fee}</span>}</div>
            </div>)}</div>
          </div>}
        </div>

        <div className="space-y-4">
          <div className="border bg-[hsl(var(--card))] p-5">
            <h3 className="mb-3 font-mono-sport text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{t.leagueTable}</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                [String(d.leaguePosition ?? "—"), t.position],
                [String(d.points ?? "—"), t.points],
                [String(d.played ?? "—"), "P"],
                [String(d.won ?? "—"), "W"],
                [String(d.drawn ?? "—"), "D"],
                [String(d.lost ?? "—"), "L"],
                [String(d.goalsFor ?? "—"), "GF"],
                [String(d.goalsAgainst ?? "—"), "GA"],
              ].map(([val, label]) => <div key={label} className="text-center"><div className="font-display text-xl font-bold">{val}</div><div className="font-mono-sport text-[8px] uppercase text-[hsl(var(--muted-foreground))]">{label}</div></div>)}
            </div>
          </div>
          <div className="border bg-[hsl(var(--card))] p-5 space-y-3">
            <div className="flex items-center justify-between text-sm"><span className="text-[hsl(var(--muted-foreground))]">{t.founded}</span><span className="font-bold">{d.founded || "—"}</span></div>
            <div className="flex items-center justify-between text-sm"><span className="text-[hsl(var(--muted-foreground))]">{t.stadium}</span><span className="font-bold">{d.stadium || "—"}</span></div>
            <div className="flex items-center justify-between text-sm"><span className="text-[hsl(var(--muted-foreground))]">{t.capacity}</span><span className="font-bold">{d.capacity ? d.capacity.toLocaleString() : "—"}</span></div>
            <div className="flex items-center justify-between text-sm"><span className="text-[hsl(var(--muted-foreground))]">{t.country}</span><span className="font-bold">{d.country}</span></div>
            <div className="flex items-center justify-between text-sm"><span className="text-[hsl(var(--muted-foreground))]">{t.league}</span><span className="font-bold">{d.league}</span></div>
          </div>
        </div>
      </div>
    </main>
  </div>;
}

function Footer({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return <footer className="border-t bg-[hsl(var(--secondary))]"><div className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12"><div className="flex flex-col justify-between gap-6 sm:flex-row"><Logo /><div className="text-sm text-[hsl(var(--muted-foreground))]">{t.brandLine}</div></div><div className="mt-8 flex flex-wrap gap-4 text-xs"><a href="/admin">Newsroom</a><a href="#latest">{t.latest}</a><a href="/rss.xml">RSS</a><a href="/sitemap.xml">Sitemap</a><a href="/partners">Partners</a></div></div></footer>;
}

function PartnerDashboardPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [dark, setDark] = useDarkMode();
  const [partnerId, setPartnerId] = useState(() => sessionStorage.getItem("sportyra_partner_id") || "");
  const [linkTargetUrl, setLinkTargetUrl] = useState("/");
  const [linkLabel, setLinkLabel] = useState("");
  const t = copy[lang];

  useEffect(() => { if (partnerId) sessionStorage.setItem("sportyra_partner_id", partnerId); }, [partnerId]);

  const stats = useQuery({ queryKey: ["partner-stats", partnerId], queryFn: () => partnerApi.stats(), enabled: Boolean(partnerId) });
  const clicks = useQuery({ queryKey: ["partner-clicks", partnerId], queryFn: () => partnerApi.clicks(20), enabled: Boolean(partnerId) });
  const earnings = useQuery({ queryKey: ["partner-earnings", partnerId], queryFn: () => partnerApi.earnings(20), enabled: Boolean(partnerId) });
  const linkMutation = useMutation({ mutationFn: () => partnerApi.createReferralLink(linkTargetUrl, linkLabel || undefined), onSuccess: () => { toast.success("Referral link created"); setLinkLabel(""); queryClient.invalidateQueries({ queryKey: ["partner-stats", partnerId] }); }, onError: (e: Error) => toast.error(errorMessage(e)) });

  if (!partnerId) return <div className="min-h-screen bg-[hsl(var(--background))]" dir="ltr">
    <Header lang={lang} setLang={setLang} onSearch={() => {}} dark={dark} setDark={setDark} />
    <main id="main-content" className="mx-auto max-w-md px-5 py-16">
      <div className="border bg-[hsl(var(--card))] p-8">
        <Logo />
        <h1 className="mt-8 font-display text-3xl font-bold">Partner Dashboard</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Enter your partner ID to access your dashboard.</p>
        <Input className="mt-6 h-11" placeholder="Partner ID" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} />
        <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">If you don't have a partner account, contact us to get started.</p>
        <a href="/" className="mt-5 block text-center text-sm">← Back to site</a>
      </div>
    </main>
  </div>;

  const s = stats.data;

  return <div className="min-h-screen bg-[hsl(var(--background))]" dir="ltr">
    <Header lang={lang} setLang={setLang} onSearch={() => {}} dark={dark} setDark={setDark} />
    <main id="main-content" className="mx-auto max-w-[1440px] px-5 py-10 lg:px-12">
      <div className="mb-8 border-b-2 border-[hsl(var(--foreground))] pb-4">
        <p className="font-mono-sport text-[10px] uppercase tracking-[.18em] text-[hsl(var(--primary))]">Partners</p>
        <h1 className="font-display text-4xl font-bold tracking-[-.06em]">Partner Dashboard</h1>
      </div>

      {stats.isLoading ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div> : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">Total Clicks</p><p className="mt-2 font-display text-3xl font-bold">{s?.totalClicks ?? 0}</p></div>
            <div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">Total Earnings</p><p className="mt-2 font-display text-3xl font-bold">${s?.totalEarnings ?? "0"}</p></div>
            <div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">Paid Out</p><p className="mt-2 font-display text-3xl font-bold">${s?.paidEarnings ?? "0"}</p></div>
            <div className="border bg-[hsl(var(--card))] p-5"><p className="font-mono-sport text-[9px] uppercase text-[hsl(var(--muted-foreground))]">This Week</p><p className="mt-2 font-display text-3xl font-bold">{s?.recentClicks ?? 0}</p></div>
          </div>

          <div className="mb-8 border bg-[hsl(var(--card))] p-5">
            <h3 className="mb-3 font-mono-sport text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Your Referral Code</h3>
            <div className="flex items-center gap-3">
              <code className="flex-1 rounded bg-[hsl(var(--muted))] p-3 font-mono-sport text-sm">{s?.referralCode || "Loading..."}</code>
              <button onClick={() => { navigator.clipboard.writeText(s?.referralCode || ""); toast.success("Copied!"); }} className="border px-4 py-2 text-xs font-bold">Copy</button>
            </div>
            <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">Commission Rate: {s?.commissionRate || "10"}% · Status: <span className="font-bold uppercase">{s?.status || "—"}</span></p>
          </div>

          <div className="mb-8 border bg-[hsl(var(--card))] p-5">
            <h3 className="mb-3 font-mono-sport text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Create Referral Link</h3>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input placeholder="Target URL (e.g., /article/1/my-story)" value={linkTargetUrl} onChange={(e) => setLinkTargetUrl(e.target.value)} className="h-11 flex-1" />
              <Input placeholder="Label (optional)" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} className="h-11 w-full sm:w-48" />
              <Button onClick={() => linkMutation.mutate()} disabled={linkMutation.isPending || !linkTargetUrl.trim()}>{linkMutation.isPending ? "..." : "Create Link"}</Button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="border bg-[hsl(var(--card))] p-5">
              <h3 className="mb-3 font-mono-sport text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Recent Clicks ({clicks.data?.total || 0})</h3>
              {clicks.data && clicks.data.items.length > 0 ? clicks.data.items.map((c: any) => <div key={c.id} className="flex items-center justify-between border-b py-2 text-xs">
                <span className="text-[hsl(var(--muted-foreground))]">{c.ipAddress || "Unknown"}</span>
                <span className="text-[hsl(var(--muted-foreground))]">{new Date(c.createdAt).toLocaleString()}</span>
              </div>) : <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">No clicks yet.</p>}
            </div>
            <div className="border bg-[hsl(var(--card))] p-5">
              <h3 className="mb-3 font-mono-sport text-[10px] uppercase text-[hsl(var(--muted-foreground))]">Earnings History</h3>
              {earnings.data && earnings.data.items.length > 0 ? earnings.data.items.map((e: any) => <div key={e.id} className="flex items-center justify-between border-b py-2 text-xs">
                <div><span className="font-bold">${e.amount}</span> <span className="text-[hsl(var(--muted-foreground))]">· {e.type}</span></div>
                <span className="text-[hsl(var(--muted-foreground))]">{new Date(e.createdAt).toLocaleDateString()}</span>
              </div>) : <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">No earnings yet.</p>}
            </div>
          </div>
        </>
      )}
    </main>
  </div>;
}

function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Router() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={Home} />
    <Route path="/live-scores" component={LiveMatchPage} />
    <Route path="/transfers" component={TransferCenterPage} />
    <Route path="/players" component={PlayerProfilesPage} />
    <Route path="/predictions" component={PredictionsPage} />
    <Route path="/trending" component={SmartTrendingPage} />
    <Route path="/teams" component={TeamsListPage} />
    <Route path="/teams/:slug">{(params) => <TeamProfilePage slug={params.slug} />}</Route>
    <Route path="/standings" component={StandingsPage} />
    <Route path="/partners" component={PartnerDashboardPage} />
    <Route path="/admin" component={Admin} />
    <Route path="/account" component={Account} />
    <Route path="/article/:id/:slug">{(params) => <Article id={Number(params.id)} />}</Route>
    <Route path="/article/:id">{(params) => <Article id={Number(params.id)} />}</Route>
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}><Router /></WouterRouter><Toaster position="top-right" /></QueryClientProvider>;
}

export default App;
