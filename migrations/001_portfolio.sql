-- Apply as a separate migration owner; runtime receives DML only.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  disabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users(lower(email));
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_owner ON sessions(owner_id,expires_at);
CREATE TABLE IF NOT EXISTS rates (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL
);

        CREATE TABLE IF NOT EXISTS profile (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            id INTEGER NOT NULL CHECK (id = 1), PRIMARY KEY(owner_id,id),
            data TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS series (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'context_ready',
            context TEXT NOT NULL,
            created_at DOUBLE PRECISION NOT NULL
        );

        
        
        
        
        
        
        CREATE TABLE IF NOT EXISTS campaign_settings (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            series_id TEXT PRIMARY KEY,
            data TEXT NOT NULL DEFAULT '{}',
            updated_at DOUBLE PRECISION
        );

        
        
        
        
        
        
        CREATE TABLE IF NOT EXISTS run_checkpoints (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            thread_id TEXT NOT NULL,
            stage TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at DOUBLE PRECISION NOT NULL,
            PRIMARY KEY (thread_id, stage)
        );

        
        
        
        
        CREATE TABLE IF NOT EXISTS canon_sheets (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            id TEXT NOT NULL,
            kind TEXT NOT NULL,
            label TEXT NOT NULL,
            data TEXT NOT NULL,
            first_campaign_id TEXT,
            created_at DOUBLE PRECISION NOT NULL,
            updated_at DOUBLE PRECISION NOT NULL,
            PRIMARY KEY(owner_id,id)
        );

        CREATE TABLE IF NOT EXISTS series_plan (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            series_id TEXT PRIMARY KEY,
            version INTEGER NOT NULL DEFAULT 1,
            plan TEXT,
            feedback TEXT,
            options TEXT,
            updated_at DOUBLE PRECISION
        );

        CREATE TABLE IF NOT EXISTS concept_state (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            series_id TEXT NOT NULL,
            concept_id TEXT NOT NULL,
            status TEXT NOT NULL,
            ccs INTEGER,
            order_idx INTEGER NOT NULL,
            regen_count INTEGER NOT NULL DEFAULT 0,
            approved INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (series_id, concept_id)
        );

        CREATE TABLE IF NOT EXISTS pipeline_runs (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            id TEXT PRIMARY KEY,
            series_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            status TEXT NOT NULL,
            error TEXT,
            created_at DOUBLE PRECISION NOT NULL,
            finished_at DOUBLE PRECISION
        );

        CREATE TABLE IF NOT EXISTS performance_log (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            id TEXT PRIMARY KEY,
            series_id TEXT,
            concept_id TEXT,
            platform TEXT,
            metrics TEXT NOT NULL,
            pasted_at DOUBLE PRECISION NOT NULL
        );

        CREATE TABLE IF NOT EXISTS uploads (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            kind TEXT NOT NULL,
            path TEXT NOT NULL,
            content_type TEXT,
            series_id TEXT,
            created_at DOUBLE PRECISION NOT NULL
        );

        
        
        CREATE TABLE IF NOT EXISTS threads (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            id TEXT PRIMARY KEY,
            series_id TEXT NOT NULL,
            ordinal INTEGER NOT NULL,
            kind TEXT NOT NULL DEFAULT 'planning',
            stage TEXT NOT NULL DEFAULT 'inspiration',
            chosen_formats TEXT,
            created_at DOUBLE PRECISION NOT NULL,
            UNIQUE (series_id, ordinal)
        );

        CREATE TABLE IF NOT EXISTS thread_messages (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            seq INTEGER NOT NULL,
            role TEXT NOT NULL,             
            envelope TEXT NOT NULL,         
            created_at DOUBLE PRECISION NOT NULL,
            UNIQUE (thread_id, seq)
        );

        
        CREATE TABLE IF NOT EXISTS artifact_activity (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            artifact_id TEXT NOT NULL,
            event TEXT NOT NULL,            
            detail TEXT,
            created_at DOUBLE PRECISION NOT NULL
        );

        
        CREATE TABLE IF NOT EXISTS post_cards (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            id TEXT PRIMARY KEY,
            series_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            concept_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'ready',
            data TEXT NOT NULL,
            posted_at DOUBLE PRECISION,
            created_at DOUBLE PRECISION NOT NULL
        );

        
        
        
        CREATE TABLE IF NOT EXISTS ad_cards (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            id TEXT PRIMARY KEY,
            campaign_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            option_id TEXT NOT NULL,
            variant_group_id TEXT,
            variant_id TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            data TEXT NOT NULL,
            created_at DOUBLE PRECISION NOT NULL
        );

        
        CREATE TABLE IF NOT EXISTS assets (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            id TEXT PRIMARY KEY,
            thread_id TEXT,
            slot TEXT,
            kind TEXT NOT NULL,
            path TEXT NOT NULL,
            params TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'ready',
            cost DOUBLE PRECISION NOT NULL DEFAULT 0,
            created_at DOUBLE PRECISION NOT NULL
        );

        CREATE TABLE IF NOT EXISTS generation_log (
 owner_id UUID NOT NULL DEFAULT nullif(current_setting('app.owner_id',true),'')::uuid REFERENCES users(id),
            id TEXT PRIMARY KEY,
            thread_id TEXT,
            asset_id TEXT,
            event TEXT NOT NULL,            
            prompt TEXT,
            model TEXT,
            seed TEXT,
            cost DOUBLE PRECISION DEFAULT 0,
            created_at DOUBLE PRECISION NOT NULL
        );
        
ALTER TABLE series ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'live' CHECK(mode IN ('live','cached'));
ALTER TABLE concept_state ADD COLUMN IF NOT EXISTS coverage INTEGER;
ALTER TABLE concept_state ADD COLUMN IF NOT EXISTS production_status TEXT DEFAULT 'planned';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS storage_ref TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS storage_ref TEXT;

ALTER TABLE profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON profile;
CREATE POLICY owner_scope ON profile USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS profile_owner ON profile(owner_id);

ALTER TABLE series ENABLE ROW LEVEL SECURITY;
ALTER TABLE series FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON series;
CREATE POLICY owner_scope ON series USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS series_owner ON series(owner_id);

ALTER TABLE campaign_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON campaign_settings;
CREATE POLICY owner_scope ON campaign_settings USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS campaign_settings_owner ON campaign_settings(owner_id);

ALTER TABLE run_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_checkpoints FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON run_checkpoints;
CREATE POLICY owner_scope ON run_checkpoints USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS run_checkpoints_owner ON run_checkpoints(owner_id);

ALTER TABLE canon_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE canon_sheets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON canon_sheets;
CREATE POLICY owner_scope ON canon_sheets USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS canon_sheets_owner ON canon_sheets(owner_id);

ALTER TABLE series_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE series_plan FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON series_plan;
CREATE POLICY owner_scope ON series_plan USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS series_plan_owner ON series_plan(owner_id);

ALTER TABLE concept_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_state FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON concept_state;
CREATE POLICY owner_scope ON concept_state USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS concept_state_owner ON concept_state(owner_id);

ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON pipeline_runs;
CREATE POLICY owner_scope ON pipeline_runs USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS pipeline_runs_owner ON pipeline_runs(owner_id);

ALTER TABLE performance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON performance_log;
CREATE POLICY owner_scope ON performance_log USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS performance_log_owner ON performance_log(owner_id);

ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON uploads;
CREATE POLICY owner_scope ON uploads USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS uploads_owner ON uploads(owner_id);

ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON threads;
CREATE POLICY owner_scope ON threads USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS threads_owner ON threads(owner_id);

ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON thread_messages;
CREATE POLICY owner_scope ON thread_messages USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS thread_messages_owner ON thread_messages(owner_id);

ALTER TABLE artifact_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_activity FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON artifact_activity;
CREATE POLICY owner_scope ON artifact_activity USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS artifact_activity_owner ON artifact_activity(owner_id);

ALTER TABLE post_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_cards FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON post_cards;
CREATE POLICY owner_scope ON post_cards USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS post_cards_owner ON post_cards(owner_id);

ALTER TABLE ad_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_cards FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON ad_cards;
CREATE POLICY owner_scope ON ad_cards USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS ad_cards_owner ON ad_cards(owner_id);

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON assets;
CREATE POLICY owner_scope ON assets USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS assets_owner ON assets(owner_id);

ALTER TABLE generation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_scope ON generation_log;
CREATE POLICY owner_scope ON generation_log USING (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK (owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE INDEX IF NOT EXISTS generation_log_owner ON generation_log(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS series_owner_id_unique ON series(owner_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS threads_owner_id_unique ON threads(owner_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS assets_owner_id_unique ON assets(owner_id,id);
ALTER TABLE campaign_settings ADD CONSTRAINT campaign_settings_series_id_owner_fk FOREIGN KEY(owner_id,series_id) REFERENCES series(owner_id,id);
ALTER TABLE series_plan ADD CONSTRAINT series_plan_series_id_owner_fk FOREIGN KEY(owner_id,series_id) REFERENCES series(owner_id,id);
ALTER TABLE concept_state ADD CONSTRAINT concept_state_series_id_owner_fk FOREIGN KEY(owner_id,series_id) REFERENCES series(owner_id,id);
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_series_id_owner_fk FOREIGN KEY(owner_id,series_id) REFERENCES series(owner_id,id);
ALTER TABLE performance_log ADD CONSTRAINT performance_log_series_id_owner_fk FOREIGN KEY(owner_id,series_id) REFERENCES series(owner_id,id);
ALTER TABLE uploads ADD CONSTRAINT uploads_series_id_owner_fk FOREIGN KEY(owner_id,series_id) REFERENCES series(owner_id,id);
ALTER TABLE threads ADD CONSTRAINT threads_series_id_owner_fk FOREIGN KEY(owner_id,series_id) REFERENCES series(owner_id,id);
ALTER TABLE run_checkpoints ADD CONSTRAINT run_checkpoints_thread_id_owner_fk FOREIGN KEY(owner_id,thread_id) REFERENCES threads(owner_id,id);
ALTER TABLE thread_messages ADD CONSTRAINT thread_messages_thread_id_owner_fk FOREIGN KEY(owner_id,thread_id) REFERENCES threads(owner_id,id);
ALTER TABLE artifact_activity ADD CONSTRAINT artifact_activity_thread_id_owner_fk FOREIGN KEY(owner_id,thread_id) REFERENCES threads(owner_id,id);
ALTER TABLE post_cards ADD CONSTRAINT post_cards_series_id_owner_fk FOREIGN KEY(owner_id,series_id) REFERENCES series(owner_id,id);
ALTER TABLE post_cards ADD CONSTRAINT post_cards_thread_id_owner_fk FOREIGN KEY(owner_id,thread_id) REFERENCES threads(owner_id,id);
ALTER TABLE ad_cards ADD CONSTRAINT ad_cards_campaign_id_owner_fk FOREIGN KEY(owner_id,campaign_id) REFERENCES series(owner_id,id);
ALTER TABLE ad_cards ADD CONSTRAINT ad_cards_thread_id_owner_fk FOREIGN KEY(owner_id,thread_id) REFERENCES threads(owner_id,id);
ALTER TABLE assets ADD CONSTRAINT assets_thread_id_owner_fk FOREIGN KEY(owner_id,thread_id) REFERENCES threads(owner_id,id);

CREATE TABLE usage (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES users(id), campaign_id TEXT, thread_id TEXT,
 kind TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL, reserved_usd NUMERIC NOT NULL CHECK(reserved_usd>=0),
 actual_usd NUMERIC CHECK(actual_usd>=0),status TEXT NOT NULL CHECK(status IN ('reserved','dispatched','complete','uncertain','usage_unavailable','released')),
 input_tokens BIGINT,output_tokens BIGINT,cached_input_tokens BIGINT,reasoning_output_tokens BIGINT,
 request_sha256 TEXT,provider_job_id TEXT,consumed_credits NUMERIC,reason TEXT,metadata TEXT NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX usage_owner ON usage(owner_id,created_at);
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_scope ON usage USING(owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK(owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE TABLE shared_budget(id INTEGER PRIMARY KEY CHECK(id=1),committed_usd NUMERIC NOT NULL CHECK(committed_usd>=0),active INTEGER NOT NULL CHECK(active>=0),media_calls INTEGER NOT NULL CHECK(media_calls>=0));
INSERT INTO shared_budget VALUES(1,0,0,0);
CREATE TABLE bridge_nonces(id UUID PRIMARY KEY,owner_id UUID NOT NULL REFERENCES users(id),expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE storage_reservations(id UUID PRIMARY KEY,owner_id UUID NOT NULL REFERENCES users(id),bytes BIGINT NOT NULL CHECK(bytes>=0),status TEXT NOT NULL CHECK(status IN ('pending','complete','failed')),storage_ref TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE shared_storage(id INTEGER PRIMARY KEY CHECK(id=1),bytes BIGINT NOT NULL CHECK(bytes>=0));
INSERT INTO shared_storage VALUES(1,0);
ALTER TABLE storage_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_scope ON storage_reservations USING(owner_id=nullif(current_setting('app.owner_id',true),'')::uuid) WITH CHECK(owner_id=nullif(current_setting('app.owner_id',true),'')::uuid);
CREATE TABLE state_quota(owner_id UUID PRIMARY KEY,bytes BIGINT NOT NULL DEFAULT 0,rows BIGINT NOT NULL DEFAULT 0);
INSERT INTO state_quota VALUES('00000000-0000-0000-0000-000000000000',0,0);
CREATE FUNCTION enforce_state_quota() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor UUID; delta_bytes BIGINT; delta_rows BIGINT; own state_quota; total state_quota;
BEGIN
 actor := CASE WHEN TG_OP='DELETE' THEN OLD.owner_id ELSE NEW.owner_id END;
 IF actor IS NULL OR actor::text IS DISTINCT FROM nullif(current_setting('app.owner_id',true),'') THEN RAISE EXCEPTION 'Owner required'; END IF;
 IF TG_OP='UPDATE' AND OLD.owner_id<>NEW.owner_id THEN RAISE EXCEPTION 'Owner cannot change'; END IF;
 delta_bytes := CASE WHEN TG_OP='DELETE' THEN -pg_column_size(OLD) WHEN TG_OP='INSERT' THEN pg_column_size(NEW) ELSE pg_column_size(NEW)-pg_column_size(OLD) END;
 delta_rows := CASE WHEN TG_OP='DELETE' THEN -1 WHEN TG_OP='INSERT' THEN 1 ELSE 0 END;
 SELECT * INTO total FROM state_quota WHERE owner_id='00000000-0000-0000-0000-000000000000' FOR UPDATE;
 INSERT INTO state_quota(owner_id) VALUES(actor) ON CONFLICT DO NOTHING;
 SELECT * INTO own FROM state_quota WHERE owner_id=actor FOR UPDATE;
 IF delta_bytes>0 AND (own.bytes+delta_bytes>33554432 OR total.bytes+delta_bytes>268435456) OR delta_rows>0 AND (own.rows+delta_rows>5000 OR total.rows+delta_rows>40000) THEN RAISE EXCEPTION 'Workspace capacity reached'; END IF;
 UPDATE state_quota SET bytes=bytes+delta_bytes,rows=rows+delta_rows WHERE owner_id IN(actor,'00000000-0000-0000-0000-000000000000');
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION enforce_state_quota() FROM PUBLIC;
CREATE TRIGGER profile_quota BEFORE INSERT OR UPDATE OR DELETE ON profile FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER series_quota BEFORE INSERT OR UPDATE OR DELETE ON series FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER campaign_settings_quota BEFORE INSERT OR UPDATE OR DELETE ON campaign_settings FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER run_checkpoints_quota BEFORE INSERT OR UPDATE OR DELETE ON run_checkpoints FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER canon_sheets_quota BEFORE INSERT OR UPDATE OR DELETE ON canon_sheets FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER series_plan_quota BEFORE INSERT OR UPDATE OR DELETE ON series_plan FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER concept_state_quota BEFORE INSERT OR UPDATE OR DELETE ON concept_state FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER pipeline_runs_quota BEFORE INSERT OR UPDATE OR DELETE ON pipeline_runs FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER performance_log_quota BEFORE INSERT OR UPDATE OR DELETE ON performance_log FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER uploads_quota BEFORE INSERT OR UPDATE OR DELETE ON uploads FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER threads_quota BEFORE INSERT OR UPDATE OR DELETE ON threads FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER thread_messages_quota BEFORE INSERT OR UPDATE OR DELETE ON thread_messages FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER artifact_activity_quota BEFORE INSERT OR UPDATE OR DELETE ON artifact_activity FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER post_cards_quota BEFORE INSERT OR UPDATE OR DELETE ON post_cards FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER ad_cards_quota BEFORE INSERT OR UPDATE OR DELETE ON ad_cards FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER assets_quota BEFORE INSERT OR UPDATE OR DELETE ON assets FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TRIGGER generation_log_quota BEFORE INSERT OR UPDATE OR DELETE ON generation_log FOR EACH ROW EXECUTE FUNCTION enforce_state_quota();
CREATE TABLE schema_version(version INTEGER PRIMARY KEY,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
INSERT INTO schema_version(version) VALUES(1);
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
