import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { NotFoundError } from "../errors/index.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

dayjs.extend(utc);

const STREAK_LOOKBACK_DAYS = 800;

function jsUtcDayToWeekDay(jsDay: number): WeekDay {
  const map: WeekDay[] = [
    WeekDay.SUNDAY,
    WeekDay.MONDAY,
    WeekDay.TUESDAY,
    WeekDay.WEDNESDAY,
    WeekDay.THURSDAY,
    WeekDay.FRIDAY,
    WeekDay.SATURDAY,
  ];
  return map[jsDay]!;
}

function formatUtcDateKey(d: Date): string {
  return dayjs.utc(d).format("YYYY-MM-DD");
}

interface InputDto {
  userId: string;
  from: string;
  to: string;
}

export interface OutputDto {
  workoutStreak: number;
  consistencyByDay: Record<
    string,
    {
      workoutDayCompleted: boolean;
      workoutDayStarted: boolean;
    }
  >;
  completedWorkoutsCount: number;
  conclusionRate: number;
  totalTimeInSeconds: number;
}

export class GetStats {
  async execute(dto: InputDto): Promise<OutputDto> {
    const from = dayjs.utc(dto.from, "YYYY-MM-DD", true).startOf("day");
    const to = dayjs.utc(dto.to, "YYYY-MM-DD", true).endOf("day");

    const plan = await prisma.workoutPlan.findFirst({
      where: {
        userId: dto.userId,
        isActive: true,
      },
      include: {
        workoutDays: {
          select: { id: true, weekDay: true },
        },
      },
    });

    if (!plan) {
      throw new NotFoundError("No active workout plan found");
    }

    const streakWindowStart = dayjs
      .utc(dto.to, "YYYY-MM-DD", true)
      .subtract(STREAK_LOOKBACK_DAYS, "day")
      .startOf("day");

    const sessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: { workoutPlanId: plan.id },
        startAt: {
          gte: streakWindowStart.toDate(),
          lte: to.toDate(),
        },
      },
      select: {
        startAt: true,
        completedAt: true,
        workoutDayId: true,
      },
    });

    const fromDate = from.toDate();
    const toDate = to.toDate();
    const rangeSessions = sessions.filter(
      (s) => s.startAt >= fromDate && s.startAt <= toDate,
    );

    const consistencyByDay: OutputDto["consistencyByDay"] = {};

    for (const session of rangeSessions) {
      const key = formatUtcDateKey(session.startAt);
      if (!consistencyByDay[key]) {
        consistencyByDay[key] = {
          workoutDayCompleted: false,
          workoutDayStarted: false,
        };
      }
      const entry = consistencyByDay[key];
      entry.workoutDayStarted = true;
      if (session.completedAt) {
        entry.workoutDayCompleted = true;
      }
    }

    const completedWorkoutsCount = rangeSessions.filter(
      (s) => s.completedAt !== null,
    ).length;

    const totalSessions = rangeSessions.length;
    const conclusionRate =
      totalSessions > 0 ? completedWorkoutsCount / totalSessions : 0;

    let totalTimeInSeconds = 0;
    for (const session of rangeSessions) {
      if (session.completedAt) {
        totalTimeInSeconds += Math.floor(
          (session.completedAt.getTime() - session.startAt.getTime()) / 1000,
        );
      }
    }

    const refDate = dayjs.utc(dto.to, "YYYY-MM-DD", true);
    const workoutStreak = this.computeWorkoutStreak({
      planWorkoutDays: plan.workoutDays,
      sessions,
      referenceDate: refDate,
    });

    return {
      workoutStreak,
      consistencyByDay,
      completedWorkoutsCount,
      conclusionRate,
      totalTimeInSeconds,
    };
  }

  private computeWorkoutStreak(input: {
    planWorkoutDays: Array<{ id: string; weekDay: WeekDay }>;
    sessions: Array<{
      startAt: Date;
      completedAt: Date | null;
      workoutDayId: string;
    }>;
    referenceDate: Dayjs;
  }): number {
    const streak = 0;
    let d = input.referenceDate.utc().startOf("day");
    const minDate = input.referenceDate
      .utc()
      .subtract(STREAK_LOOKBACK_DAYS, "day")
      .startOf("day");

    while (!d.isBefore(minDate)) {
      const weekDay = jsUtcDayToWeekDay(d.day());
      const workoutDay = input.planWorkoutDays.find(
        (wd) => wd.weekDay === weekDay,
      );

      if (!workoutDay) {
        d = d.subtract(1, "day");
        continue;
      }

      const dateKey = d.format("YYYY-MM-DD");
      const completedOnDay = input.sessions.some(
        (s) =>
          s.workoutDayId === workoutDay.id &&
          formatUtcDateKey(s.startAt) === dateKey &&
          s.completedAt !== null,
      );

      if (completedOnDay) {
        d = d.subtract(1, "day");
      } else {
        break;
      }
    }

    return streak;
  }
}
