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
  date: string;
}

export interface OutputDto {
  activeWorkoutPlanId: string;
  todayWorkoutDay: {
    workoutPlanId: string;
    id: string;
    name: string;
    isRest: boolean;
    weekDay: WeekDay;
    estimatedDurationInSeconds: number;
    coverImageUrl?: string;
    exercisesCount: number;
  };
  workoutStreak: number;
  consistencyByDay: Record<
    string,
    {
      workoutDayCompleted: boolean;
      workoutDayStarted: boolean;
    }
  >;
}

export class GetHomeData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const ref = dayjs.utc(dto.date, "YYYY-MM-DD", true);

    const plan = await prisma.workoutPlan.findFirst({
      where: {
        userId: dto.userId,
        isActive: true,
      },
      include: {
        workoutDays: {
          include: {
            exercises: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundError("No active workout plan found");
    }

    const weekStart = ref.subtract(ref.day(), "day").startOf("day");
    const weekEnd = weekStart.add(6, "day").endOf("day");

    const weekDayForRef = jsUtcDayToWeekDay(ref.day());
    const todayWorkoutDayEntity = plan.workoutDays.find(
      (d) => d.weekDay === weekDayForRef,
    );

    if (!todayWorkoutDayEntity) {
      throw new NotFoundError("No workout day for this date in the active plan");
    }

    const streakWindowStart = ref
      .subtract(STREAK_LOOKBACK_DAYS, "day")
      .startOf("day");

    const sessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: { workoutPlanId: plan.id },
        startAt: {
          gte: streakWindowStart.toDate(),
          lte: weekEnd.toDate(),
        },
      },
      select: {
        startAt: true,
        completedAt: true,
        workoutDayId: true,
      },
    });

    const weekStartDate = weekStart.toDate();
    const weekEndDate = weekEnd.toDate();

    const weekSessions = sessions.filter(
      (s) => s.startAt >= weekStartDate && s.startAt <= weekEndDate,
    );

    const consistencyByDay: OutputDto["consistencyByDay"] = {};
    for (let i = 0; i < 7; i++) {
      const key = weekStart.add(i, "day").format("YYYY-MM-DD");
      consistencyByDay[key] = {
        workoutDayCompleted: false,
        workoutDayStarted: false,
      };
    }

    for (const session of weekSessions) {
      const key = formatUtcDateKey(session.startAt);
      const entry = consistencyByDay[key];
      if (!entry) {
        continue;
      }
      entry.workoutDayStarted = true;
      if (session.completedAt) {
        entry.workoutDayCompleted = true;
      }
    }

    const workoutStreak = this.computeWorkoutStreak({
      planWorkoutDays: plan.workoutDays,
      sessions,
      referenceDate: ref,
    });

    return {
      activeWorkoutPlanId: plan.id,
      todayWorkoutDay: {
        workoutPlanId: plan.id,
        id: todayWorkoutDayEntity.id,
        name: todayWorkoutDayEntity.name,
        isRest: todayWorkoutDayEntity.isRestDay,
        weekDay: todayWorkoutDayEntity.weekDay,
        estimatedDurationInSeconds:
          todayWorkoutDayEntity.estimatedDurationInSeconds,
        coverImageUrl: todayWorkoutDayEntity.coverImageUrl ?? undefined,
        exercisesCount: todayWorkoutDayEntity.exercises.length,
      },
      workoutStreak,
      consistencyByDay,
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
    let streak = 0;
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
        streak += 1;
        d = d.subtract(1, "day");
      } else {
        break;
      }
    }

    return streak;
  }
}
