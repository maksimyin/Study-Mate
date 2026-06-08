CREATE TABLE document_subtopics (
  id SERIAL PRIMARY KEY,
  doc_id BIGINT REFERENCES documents(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON document_subtopics(subject);
