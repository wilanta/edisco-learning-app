import { category, pace, type partType } from '@edisco/database/schema';
import { z } from 'zod';

type Category = (typeof category.enumValues)[number];
type PartType = (typeof partType.enumValues)[number];
export const categoryTypes: Record<Category, PartType[]> = {
  PROGRAMMING: [
    'CODE_PREDICT',
    'FILL_IN_BLANK',
    'MULTIPLE_CHOICE',
    'SHORT_ANSWER',
    'MATCHING',
  ],
  LANGUAGE: ['TRANSLATE', 'FILL_IN_BLANK', 'MULTIPLE_CHOICE', 'MATCHING'],
  MATH: ['SHORT_ANSWER', 'MULTIPLE_CHOICE', 'TRUE_FALSE'],
  SCIENCE: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'MATCHING'],
  ENGINEERING: ['SHORT_ANSWER', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'MATCHING'],
  GENERAL: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'],
};
const text = z.string().trim().min(1).max(8000);
export const generationInput = z.strictObject({
  topic: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject controls while allowing tab/newline in topic text.
    .regex(/^[^\x00-\x08\x0b\x0c\x0e-\x1f\x7f]*$/),
  category: z.enum(category.enumValues),
  pace: z.enum(pace.enumValues),
  previousLessons: z
    .array(z.strictObject({ title: text, description: text }))
    .max(5),
});
export type GenerationInput = z.infer<typeof generationInput>;
const common = { question: text, explanation: text };
function part<T extends PartType, S extends z.ZodRawShape>(type: T, shape: S) {
  return z.strictObject({
    order: z.number().int().min(1).max(5),
    type: z.literal(type),
    promptContent: z.strictObject({ ...common, ...shape }),
  });
}
// Version 1 private storage contract: answers remain in the worker/database.
export const lessonSchema = z.strictObject({
  title: text.max(200),
  description: text.max(2000),
  parts: z
    .array(
      z.union([
        part('MULTIPLE_CHOICE', {
          options: z.array(text).min(2).max(8),
          correctAnswer: text,
        }),
        part('FILL_IN_BLANK', {
          blanks: z
            .array(
              z.strictObject({
                id: z
                  .string()
                  .regex(/^[a-zA-Z0-9_]+$/)
                  .max(40),
                correctAnswer: text,
              }),
            )
            .min(1)
            .max(10),
        }),
        part('MATCHING', {
          leftOptions: z.array(text).min(2).max(10),
          rightOptions: z.array(text).min(2).max(10),
          correctAnswer: z
            .array(z.strictObject({ left: text, right: text }))
            .min(2)
            .max(10),
        }),
        part('TRUE_FALSE', { correctAnswer: z.boolean() }),
        part('CODE_PREDICT', { correctAnswer: text }),
        part('TRANSLATE', { correctAnswer: text }),
        part('SHORT_ANSWER', { correctAnswer: text }),
      ]),
    )
    .length(5),
});
export type GeneratedLesson = z.infer<typeof lessonSchema>;
function sameUniqueValues(a: string[], b: string[]) {
  return (
    a.length === b.length &&
    new Set(a).size === a.length &&
    new Set(b).size === b.length &&
    a.every((v) => b.includes(v))
  );
}
export function validateLesson(
  value: unknown,
  category: Category,
): GeneratedLesson {
  const lesson = lessonSchema.parse(value);
  if (new Set(lesson.parts.map((p) => p.type)).size < 2)
    throw new Error('Lesson requires varied part types');
  for (const [index, p] of lesson.parts.entries()) {
    if (p.order !== index + 1 || !categoryTypes[category].includes(p.type))
      throw new Error('Invalid lesson template');
    const c = p.promptContent;
    if (p.type === 'MULTIPLE_CHOICE') {
      const c = p.promptContent;
      if (
        new Set(c.options).size !== c.options.length ||
        !c.options.includes(c.correctAnswer)
      )
        throw new Error('Invalid choice answer');
    } else if (p.type === 'FILL_IN_BLANK') {
      const ids = p.promptContent.blanks.map((b) => b.id);
      const markers = [...c.question.matchAll(/\[\[([a-zA-Z0-9_]+)\]\]/g)].map(
        (m) => m[1] as string,
      );
      if (!sameUniqueValues(ids, markers))
        throw new Error('Invalid blank answers');
    } else if (p.type === 'MATCHING') {
      const c = p.promptContent;
      if (
        !sameUniqueValues(
          c.leftOptions,
          c.correctAnswer.map((a) => a.left),
        ) ||
        !sameUniqueValues(
          c.rightOptions,
          c.correctAnswer.map((a) => a.right),
        )
      )
        throw new Error('Invalid matching answers');
    }
  }
  return lesson;
}
