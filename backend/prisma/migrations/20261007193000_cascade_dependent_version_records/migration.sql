-- Analysis runs and summaries are scoped to the immutable document versions
-- they consume. Remove those dependent records only when the assessment's
-- document versions are removed as part of assessment deletion.
ALTER TABLE "AnalysisRun"
  DROP CONSTRAINT "AnalysisRun_guidelineVersionId_fkey",
  ADD CONSTRAINT "AnalysisRun_guidelineVersionId_fkey"
    FOREIGN KEY ("guidelineVersionId") REFERENCES "DocumentVersion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalysisRun"
  DROP CONSTRAINT "AnalysisRun_applicationVersionId_fkey",
  ADD CONSTRAINT "AnalysisRun_applicationVersionId_fkey"
    FOREIGN KEY ("applicationVersionId") REFERENCES "DocumentVersion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReviewSummary"
  DROP CONSTRAINT "ReviewSummary_guidelineVersionId_fkey",
  ADD CONSTRAINT "ReviewSummary_guidelineVersionId_fkey"
    FOREIGN KEY ("guidelineVersionId") REFERENCES "DocumentVersion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReviewSummary"
  DROP CONSTRAINT "ReviewSummary_applicationVersionId_fkey",
  ADD CONSTRAINT "ReviewSummary_applicationVersionId_fkey"
    FOREIGN KEY ("applicationVersionId") REFERENCES "DocumentVersion"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
