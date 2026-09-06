-- Safe adoption migration. The baseline already contains these constraints for
-- fresh databases; conditional statements also make this migration usable after
-- the existing populated database has been baselined.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_referred_by_partner_id_partners_id_fk' AND conrelid = 'users'::regclass) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_partner_id_partners_id_fk" FOREIGN KEY ("referred_by_partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'news_partner_id_partners_id_fk' AND conrelid = 'news'::regclass) THEN
    ALTER TABLE "news" ADD CONSTRAINT "news_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'news_reviewed_by_users_id_fk' AND conrelid = 'news'::regclass) THEN
    ALTER TABLE "news" ADD CONSTRAINT "news_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_user_id_users_id_fk' AND conrelid = 'user_sessions'::regclass) THEN
    ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_resets_user_id_users_id_fk' AND conrelid = 'password_resets'::regclass) THEN
    ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_user_id_users_id_fk' AND conrelid = 'push_subscriptions'::regclass) THEN
    ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_parent_id_comments_id_fk' AND conrelid = 'comments'::regclass) THEN
    ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'imported_articles_news_id_news_id_fk' AND conrelid = 'imported_articles'::regclass) THEN
    ALTER TABLE "imported_articles" ADD CONSTRAINT "imported_articles_news_id_news_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'players_club_id_teams_id_fk' AND conrelid = 'players'::regclass) THEN
    ALTER TABLE "players" ADD CONSTRAINT "players_club_id_teams_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'team_pages_team_id_teams_id_fk' AND conrelid = 'team_pages'::regclass) THEN
    ALTER TABLE "team_pages" ADD CONSTRAINT "team_pages_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_events_match_id_matches_id_fk' AND conrelid = 'match_events'::regclass) THEN
    ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_lineups_match_id_matches_id_fk' AND conrelid = 'match_lineups'::regclass) THEN
    ALTER TABLE "match_lineups" ADD CONSTRAINT "match_lineups_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_statistics_match_id_matches_id_fk' AND conrelid = 'match_statistics'::regclass) THEN
    ALTER TABLE "match_statistics" ADD CONSTRAINT "match_statistics_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_competition_id_competitions_id_fk' AND conrelid = 'matches'::regclass) THEN
    ALTER TABLE "matches" ADD CONSTRAINT "matches_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_home_team_id_teams_id_fk' AND conrelid = 'matches'::regclass) THEN
    ALTER TABLE "matches" ADD CONSTRAINT "matches_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_away_team_id_teams_id_fk' AND conrelid = 'matches'::regclass) THEN
    ALTER TABLE "matches" ADD CONSTRAINT "matches_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'predictions_user_id_users_id_fk' AND conrelid = 'predictions'::regclass) THEN
    ALTER TABLE "predictions" ADD CONSTRAINT "predictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'predictions_match_id_matches_id_fk' AND conrelid = 'predictions'::regclass) THEN
    ALTER TABLE "predictions" ADD CONSTRAINT "predictions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partners_user_id_users_id_fk' AND conrelid = 'partners'::regclass) THEN
    ALTER TABLE "partners" ADD CONSTRAINT "partners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partners_approved_by_users_id_fk' AND conrelid = 'partners'::regclass) THEN
    ALTER TABLE "partners" ADD CONSTRAINT "partners_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partners_rejected_by_users_id_fk' AND conrelid = 'partners'::regclass) THEN
    ALTER TABLE "partners" ADD CONSTRAINT "partners_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partners_suspended_by_users_id_fk' AND conrelid = 'partners'::regclass) THEN
    ALTER TABLE "partners" ADD CONSTRAINT "partners_suspended_by_users_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_links_partner_id_partners_id_fk' AND conrelid = 'referral_links'::regclass) THEN
    ALTER TABLE "referral_links" ADD CONSTRAINT "referral_links_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_events_partner_id_partners_id_fk' AND conrelid = 'referral_events'::regclass) THEN
    ALTER TABLE "referral_events" ADD CONSTRAINT "referral_events_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_events_link_id_referral_links_id_fk' AND conrelid = 'referral_events'::regclass) THEN
    ALTER TABLE "referral_events" ADD CONSTRAINT "referral_events_link_id_referral_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."referral_links"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_clicks_partner_id_partners_id_fk' AND conrelid = 'referral_clicks'::regclass) THEN
    ALTER TABLE "referral_clicks" ADD CONSTRAINT "referral_clicks_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referral_clicks_link_id_referral_links_id_fk' AND conrelid = 'referral_clicks'::regclass) THEN
    ALTER TABLE "referral_clicks" ADD CONSTRAINT "referral_clicks_link_id_referral_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."referral_links"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payouts_partner_id_partners_id_fk' AND conrelid = 'payouts'::regclass) THEN
    ALTER TABLE "payouts" ADD CONSTRAINT "payouts_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creator_earnings_ledger_partner_id_partners_id_fk' AND conrelid = 'creator_earnings_ledger'::regclass) THEN
    ALTER TABLE "creator_earnings_ledger" ADD CONSTRAINT "creator_earnings_ledger_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ad_placements_campaign_id_campaigns_id_fk' AND conrelid = 'ad_placements'::regclass) THEN
    ALTER TABLE "ad_placements" ADD CONSTRAINT "ad_placements_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_created_by_users_id_fk' AND conrelid = 'campaigns'::regclass) THEN
    ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_labels_campaign_id_campaigns_id_fk' AND conrelid = 'content_labels'::regclass) THEN
    ALTER TABLE "content_labels" ADD CONSTRAINT "content_labels_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_labels_created_by_users_id_fk' AND conrelid = 'content_labels'::regclass) THEN
    ALTER TABLE "content_labels" ADD CONSTRAINT "content_labels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ad_events_partner_id_partners_id_fk' AND conrelid = 'ad_events'::regclass) THEN
    ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ad_events_campaign_id_campaigns_id_fk' AND conrelid = 'ad_events'::regclass) THEN
    ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ad_events_article_id_news_id_fk' AND conrelid = 'ad_events'::regclass) THEN
    ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_article_id_news_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."news"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monetization_events_article_id_news_id_fk' AND conrelid = 'monetization_events'::regclass) THEN
    ALTER TABLE "monetization_events" ADD CONSTRAINT "monetization_events_article_id_news_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."news"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monetization_events_ad_id_ad_placements_id_fk' AND conrelid = 'monetization_events'::regclass) THEN
    ALTER TABLE "monetization_events" ADD CONSTRAINT "monetization_events_ad_id_ad_placements_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ad_placements"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monetization_events_partner_id_partners_id_fk' AND conrelid = 'monetization_events'::regclass) THEN
    ALTER TABLE "monetization_events" ADD CONSTRAINT "monetization_events_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monetization_events_campaign_id_campaigns_id_fk' AND conrelid = 'monetization_events'::regclass) THEN
    ALTER TABLE "monetization_events" ADD CONSTRAINT "monetization_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fixtures_home_team_idx" ON "fixtures" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fixtures_away_team_idx" ON "fixtures" USING btree ("away_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moderation_target_idx" ON "moderation_reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_competition_idx" ON "matches" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_home_team_idx" ON "matches" USING btree ("home_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_away_team_idx" ON "matches" USING btree ("away_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "news_reviewed_by_idx" ON "news" USING btree ("reviewed_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_referred_by_partner_idx" ON "users" USING btree ("referred_by_partner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_club_id_idx" ON "players" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_pages_team_id_idx" ON "team_pages" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "imported_articles_news_id_idx" ON "imported_articles" USING btree ("news_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payouts_idempotency_key_unique" ON "payouts" USING btree ("idempotency_key");
