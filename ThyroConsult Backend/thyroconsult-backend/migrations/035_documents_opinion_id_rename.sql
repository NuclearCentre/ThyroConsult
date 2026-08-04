-- 035_documents_opinion_id_rename.sql
--
-- patientController.js's getDocuments (SELECT + JOIN) and the document
-- upload INSERT all reference d.opinion_id — consistently, in three
-- separate places — matching the platform's standing "online opinion,
-- never consultation" naming rule. But the documents table itself still
-- has the old column name consultation_id; the rename was never actually
-- run. This finishes it. Zero code changes needed — the code already
-- assumes the new name.

ALTER TABLE documents RENAME COLUMN consultation_id TO opinion_id;

GRANT ALL PRIVILEGES ON TABLE documents TO thyroconsult_user;
