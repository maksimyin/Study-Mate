-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Sequences ─────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS progress_events_id_seq;

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents
(
  id          bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name        text NOT NULL,
  file_path   text NOT NULL,
  subject     text NOT NULL,
  pages       integer NOT NULL DEFAULT 0,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'ready'::text,
  ingested    boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS chunks
(
  id          bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  doc_id      bigint NOT NULL,
  subject     text NOT NULL,
  filename    text NOT NULL,
  page        integer NOT NULL,
  chunk_index integer NOT NULL,
  char_offset integer NOT NULL,
  content     text NOT NULL,
  embedding   vector
);

CREATE TABLE IF NOT EXISTS messages
(
  id         bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  subject    text NOT NULL,
  role       text NOT NULL,
  content    text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  subtopic   text
);

CREATE TABLE IF NOT EXISTS progress_events
(
  id               bigint NOT NULL DEFAULT nextval('progress_events_id_seq'::regclass),
  message_id       bigint,
  subject          text NOT NULL,
  subtopic         text NOT NULL,
  concept          text NOT NULL,
  question_type    text NOT NULL,
  cognitive_level  text,
  confidence_signal text NOT NULL,
  created_at       timestamp with time zone DEFAULT now()
);



-- ── Primary Keys ──────────────────────────────────────────────────────────────

ALTER TABLE documents       ADD CONSTRAINT documents_pkey       PRIMARY KEY (id);
ALTER TABLE chunks          ADD CONSTRAINT chunks_pkey          PRIMARY KEY (id);
ALTER TABLE messages        ADD CONSTRAINT messages_pkey        PRIMARY KEY (id);
ALTER TABLE progress_events ADD CONSTRAINT progress_events_pkey PRIMARY KEY (id);

-- ── Foreign Keys ──────────────────────────────────────────────────────────────

ALTER TABLE chunks ADD CONSTRAINT chunks_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES documents(id);

-- ── Check Constraints ─────────────────────────────────────────────────────────

ALTER TABLE documents ADD CONSTRAINT documents_status_check
  CHECK (status = ANY (ARRAY['ready'::text, 'processing'::text, 'failed'::text]));

ALTER TABLE messages ADD CONSTRAINT messages_role_check
  CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text]));

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX chunks_embedding_hnsw_idx       ON public.chunks          USING hnsw  (embedding vector_cosine_ops);
CREATE INDEX chunks_topic_idx                ON public.chunks          USING btree (subject);
CREATE INDEX documents_topic_idx             ON public.documents       USING btree (subject);
CREATE INDEX messages_topic_created_idx      ON public.messages        USING btree (subject, created_at);
CREATE INDEX progress_events_created_at_idx  ON public.progress_events USING btree (created_at);
CREATE INDEX progress_events_subject_idx     ON public.progress_events USING btree (subject);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_events ENABLE ROW LEVEL SECURITY;
