import { tracks, userLessons, lessons } from '@edisco/database/schema';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const tracksRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;

      // Grouping lessons by track to get counts
      const tracksList = await app.db
        .select({
          id: tracks.id,
          title: tracks.title,
          category: tracks.category,
          lessonCount: sql<number>`count(${userLessons.id})::int`,
          completedCount: sql<number>`sum(case when ${userLessons.status} = 'COMPLETED' then 1 else 0 end)::int`,
        })
        .from(tracks)
        .leftJoin(
          userLessons,
          and(
            eq(tracks.id, userLessons.trackId),
            eq(userLessons.userId, userId),
          ),
        )
        .where(eq(tracks.userId, userId))
        .groupBy(tracks.id);

      return reply.code(200).send({ tracks: tracksList });
    },
  );

  app.get<{ Params: { trackId: string } }>(
    '/:trackId',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      const { trackId } = request.params;

      if (!z.uuid().safeParse(trackId).success) {
        return reply
          .code(400)
          .send({ error: 'VALIDATION_ERROR', message: 'Invalid track ID' });
      }

      const track = await app.db.query.tracks.findFirst({
        where: and(eq(tracks.id, trackId), eq(tracks.userId, userId)),
      });

      if (!track) {
        return reply
          .code(404)
          .send({ error: 'NOT_FOUND', message: 'Track not found' });
      }

      const trackLessons = await app.db
        .select({
          userLessonId: userLessons.id,
          order: userLessons.orderInTrack,
          title: lessons.title,
          status: userLessons.status,
        })
        .from(userLessons)
        .innerJoin(lessons, eq(userLessons.lessonId, lessons.id))
        .where(
          and(eq(userLessons.trackId, trackId), eq(userLessons.userId, userId)),
        )
        .orderBy(userLessons.orderInTrack);

      return reply.code(200).send({
        id: track.id,
        title: track.title,
        lessons: trackLessons.map((ul) => ({
          userLessonId: ul.userLessonId,
          order: ul.order,
          title: ul.title,
          status: ul.status,
        })),
      });
    },
  );
};

export default tracksRoutes;
