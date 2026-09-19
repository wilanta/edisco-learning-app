-- A progress row's part must belong to its assigned lesson. The specified
-- columns cannot express this with a foreign key alone; no extra column is added.
-- Parent locks keep a concurrent re-link from invalidating this check.
CREATE FUNCTION check_progress_lesson() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  assignment_lesson uuid;
  part_lesson uuid;
BEGIN
  SELECT lesson_id INTO assignment_lesson FROM user_lessons
    WHERE id = NEW.user_lesson_id FOR SHARE;
  SELECT lesson_id INTO part_lesson FROM parts
    WHERE id = NEW.part_id FOR SHARE;
  IF assignment_lesson IS DISTINCT FROM part_lesson THEN
    RAISE EXCEPTION 'Progress part must belong to the assigned lesson'
      USING ERRCODE = '23503', CONSTRAINT = 'progress_lesson_match';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER progress_lesson_match
BEFORE INSERT OR UPDATE OF user_lesson_id, part_id ON user_part_progress
FOR EACH ROW EXECUTE FUNCTION check_progress_lesson();
--> statement-breakpoint
CREATE FUNCTION check_progress_parent_lesson() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'parts' THEN
    IF EXISTS (
      SELECT 1 FROM user_part_progress p
      JOIN user_lessons ul ON ul.id = p.user_lesson_id
      WHERE p.part_id = OLD.id AND ul.lesson_id <> NEW.lesson_id
    ) THEN
      RAISE EXCEPTION 'Part change would invalidate existing progress'
        USING ERRCODE = '23503', CONSTRAINT = 'progress_lesson_match';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM user_part_progress p
      JOIN parts ON parts.id = p.part_id
      WHERE p.user_lesson_id = OLD.id AND parts.lesson_id <> NEW.lesson_id
    ) THEN
      RAISE EXCEPTION 'Assignment change would invalidate existing progress'
        USING ERRCODE = '23503', CONSTRAINT = 'progress_lesson_match';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER parts_progress_lesson_match
BEFORE UPDATE OF lesson_id ON parts
FOR EACH ROW WHEN (OLD.lesson_id IS DISTINCT FROM NEW.lesson_id)
EXECUTE FUNCTION check_progress_parent_lesson();
--> statement-breakpoint
CREATE TRIGGER assignments_progress_lesson_match
BEFORE UPDATE OF lesson_id ON user_lessons
FOR EACH ROW WHEN (OLD.lesson_id IS DISTINCT FROM NEW.lesson_id)
EXECUTE FUNCTION check_progress_parent_lesson();
