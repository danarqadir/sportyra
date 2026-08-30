import { z } from "zod";

const MAX_STR_50 = 50;
const MAX_STR_100 = 100;
const MAX_STR_200 = 200;
const MAX_STR_500 = 500;
const MAX_STR_1000 = 1000;
const MAX_STR_2000 = 2000;
const MAX_STR_5000 = 5000;

function safeStr(max: number) {
  return z.string().trim().max(max).optional();
}

export const FixtureCreate = z.object({
  competitionId: z.number().int().positive().optional(),
  homeTeamId: z.number().int().positive().optional(),
  awayTeamId: z.number().int().positive().optional(),
  matchDate: z.string().min(1),
  venue: safeStr(MAX_STR_200),
  status: z.enum(["scheduled", "live", "finished", "postponed", "cancelled"]).optional(),
  stage: safeStr(MAX_STR_100),
  round: safeStr(MAX_STR_100),
});

export const FixtureUpdate = z.object({
  competitionId: z.number().int().positive().optional(),
  homeTeamId: z.number().int().positive().optional(),
  awayTeamId: z.number().int().positive().optional(),
  homeScore: z.number().int().min(0).optional(),
  awayScore: z.number().int().min(0).optional(),
  status: z.enum(["scheduled", "live", "finished", "postponed", "cancelled"]).optional(),
  matchDate: z.string().min(1).optional(),
  venue: safeStr(MAX_STR_200),
  stage: safeStr(MAX_STR_100),
  round: safeStr(MAX_STR_100),
});

export const MatchCreate = z.object({
  homeTeamName: z.string().trim().min(1).max(MAX_STR_200),
  awayTeamName: z.string().trim().min(1).max(MAX_STR_200),
  homeTeamLogo: safeStr(MAX_STR_500),
  awayTeamLogo: safeStr(MAX_STR_500),
  matchDate: z.string().min(1),
  status: z.enum(["scheduled", "live", "finished", "postponed", "cancelled"]).optional(),
  venue: safeStr(MAX_STR_200),
  competitionName: safeStr(MAX_STR_200),
  competitionLogo: safeStr(MAX_STR_500),
  homeScore: z.number().int().min(0).optional(),
  awayScore: z.number().int().min(0).optional(),
  minute: z.number().int().min(0).max(120).optional(),
});

export const MatchUpdate = z.object({
  homeScore: z.number().int().min(0).optional(),
  awayScore: z.number().int().min(0).optional(),
  status: z.enum(["scheduled", "live", "finished", "postponed", "cancelled"]).optional(),
  minute: z.number().int().min(0).max(120).optional(),
  venue: safeStr(MAX_STR_200),
  homeTeamLogo: safeStr(MAX_STR_500),
  awayTeamLogo: safeStr(MAX_STR_500),
  competitionName: safeStr(MAX_STR_200),
  competitionLogo: safeStr(MAX_STR_500),
});

export const MatchEventCreate = z.object({
  eventType: z.string().trim().min(1).max(MAX_STR_100),
  minute: z.number().int().min(0).max(120).optional(),
  playerName: safeStr(MAX_STR_200),
  teamSide: z.enum(["home", "away"]).optional(),
  detail: safeStr(MAX_STR_500),
});

export const PlayerCreate = z.object({
  name: z.string().trim().min(1).max(MAX_STR_200),
  slug: z.string().trim().min(1).max(MAX_STR_200),
  nationality: safeStr(MAX_STR_100),
  dateOfBirth: z.string().optional(),
  position: safeStr(MAX_STR_100),
  club: safeStr(MAX_STR_200),
  shirtNumber: z.number().int().min(1).max(99).optional(),
  photoUrl: safeStr(MAX_STR_500),
  biography: safeStr(MAX_STR_5000),
  goals: z.number().int().min(0).optional(),
  assists: z.number().int().min(0).optional(),
  appearances: z.number().int().min(0).optional(),
  trophies: z.array(z.string().max(MAX_STR_200)).max(50).optional(),
});

export const PlayerUpdate = z.object({
  name: safeStr(MAX_STR_200),
  nationality: safeStr(MAX_STR_100),
  dateOfBirth: z.string().optional(),
  position: safeStr(MAX_STR_100),
  club: safeStr(MAX_STR_200),
  shirtNumber: z.number().int().min(1).max(99).optional(),
  photoUrl: safeStr(MAX_STR_500),
  biography: safeStr(MAX_STR_5000),
  goals: z.number().int().min(0).optional(),
  assists: z.number().int().min(0).optional(),
  appearances: z.number().int().min(0).optional(),
  trophies: z.array(z.string().max(MAX_STR_200)).max(50).optional(),
});

export const TransferCreate = z.object({
  playerName: z.string().trim().min(1).max(MAX_STR_200),
  playerId: z.number().int().positive().optional(),
  fromClub: z.string().trim().min(1).max(MAX_STR_200),
  toClub: z.string().trim().min(1).max(MAX_STR_200),
  fee: safeStr(MAX_STR_100),
  status: z.enum(["rumour", "confirmed", "completed", "cancelled"]).optional(),
  transferType: z.enum(["permanent", "loan", "free"]).optional(),
  transferDate: z.string().optional(),
  source: safeStr(MAX_STR_500),
  confidence: z.number().int().min(0).max(100).optional(),
});

export const TransferUpdate = z.object({
  playerName: safeStr(MAX_STR_200),
  fromClub: safeStr(MAX_STR_200),
  toClub: safeStr(MAX_STR_200),
  fee: safeStr(MAX_STR_100),
  status: z.enum(["rumour", "confirmed", "completed", "cancelled"]).optional(),
  transferType: z.enum(["permanent", "loan", "free"]).optional(),
  transferDate: z.string().optional(),
  source: safeStr(MAX_STR_500),
  confidence: z.number().int().min(0).max(100).optional(),
});

export const CompetitionCreate = z.object({
  name: z.string().trim().min(1).max(MAX_STR_200),
  slug: z.string().trim().min(1).max(MAX_STR_200),
  country: safeStr(MAX_STR_100),
  sport: safeStr(MAX_STR_100),
  logoUrl: safeStr(MAX_STR_500),
});

export const TeamCreate = z.object({
  name: z.string().trim().min(1).max(MAX_STR_200),
  slug: z.string().trim().min(1).max(MAX_STR_200),
  shortName: safeStr(MAX_STR_50),
  logoUrl: safeStr(MAX_STR_500),
  sport: safeStr(MAX_STR_100),
});

export const AdminPartnerCreate = z.object({
  name: z.string().trim().min(1).max(MAX_STR_200),
  email: z.string().trim().email().max(MAX_STR_200),
  website: safeStr(MAX_STR_500),
  description: safeStr(MAX_STR_2000),
  avatar: safeStr(MAX_STR_500),
  commissionRate: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  status: z.enum(["pending", "approved", "rejected", "suspended", "active"]).optional(),
});
