import { weeklyLeagueEntries, users } from '@edisco/database/schema';
import { eq, desc } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

const leagueRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/weekly',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;

      const now = new Date();
      const getMonday = (d: Date): string => {
        const date = new Date(
          Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
        );
        const day = date.getUTCDay();
        const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
        return new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff),
        )
          .toISOString()
          .substring(0, 10);
      };

      const weekStartDate = getMonday(now);

      const leaderboardData = await app.db
        .select({
          userId: weeklyLeagueEntries.userId,
          name: users.name,
          xp: weeklyLeagueEntries.xpThisWeek,
        })
        .from(weeklyLeagueEntries)
        .innerJoin(users, eq(weeklyLeagueEntries.userId, users.id))
        .where(eq(weeklyLeagueEntries.weekStartDate, weekStartDate))
        .orderBy(desc(weeklyLeagueEntries.xpThisWeek));

      let myRank = null;
      let myXp = 0;

      const leaderboard = leaderboardData.map((entry, index) => {
        const rank = index + 1;
        if (entry.userId === userId) {
          myRank = rank;
          myXp = entry.xp;
        }
        return {
          rank,
          userId: entry.userId,
          name: entry.name,
          xp: entry.xp,
        };
      });

      return reply.code(200).send({
        weekStartDate,
        myRank,
        myXp,
        leaderboard,
      });
    },
  );
};

export default leagueRoutes;
