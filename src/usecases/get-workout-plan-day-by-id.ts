import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { ForbiddenError, NotFoundError } from "../errors/index.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

dayjs.extend(utc);

function formatUtcDateKey(d: Date): string {
  return dayjs.utc(d).format("YYYY-MM-DD");
}

interface InputDto {
  userId: string;
  workoutPlanId: string;
  workoutDayId: string;
}

export interface OutputDto {
  id: string;
  name: string;
  isRest: boolean;
  coverImageUrl?: string;
  estimatedDurationInSeconds: number;
  weekDay: WeekDay;
  exercises: Array<{
    id: string;
    name: string;
    order: number;
    workoutDayId: string;
    sets: number;
    reps: number;
    restTimeInSeconds: number;
  }>;
  sessions: Array<{
    id: string;
    workoutDayId: string;
    startedAt?: string;
    completedAt?: string;
  }>;
}

export class GetWorkoutPlanDayById {
  async execute(dto: InputDto): Promise<OutputDto> {
    const plan = await prisma.workoutPlan.findUnique({
      where: { id: dto.workoutPlanId },
      select: { id: true, userId: true },
    });

    if (!plan) {
      throw new NotFoundError("Workout plan not found");
    }

    if (plan.userId !== dto.userId) {
      throw new ForbiddenError("User is not the owner of this workout plan");
    }

    const day = await prisma.workoutDay.findFirst({
      where: {
        id: dto.workoutDayId,
        workoutPlanId: dto.workoutPlanId,
      },
      include: {
        exercises: true,
        sessions: true,
      },
    });

    if (!day) {
      throw new NotFoundError("Workout day not found");
    }

    const exercises = [...day.exercises]
      .sort((a, b) => a.order - b.order)
      .map((e) => ({
        id: e.id,
        name: e.name,
        order: e.order,
        workoutDayId: e.workoutDayId,
        sets: e.sets,
        reps: e.reps,
        restTimeInSeconds: e.restTimeInSeconds,
      }));

    const sessions = [...day.sessions]
      .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())
      .map((s) => ({
        id: s.id,
        workoutDayId: s.workoutDayId,
        startedAt: formatUtcDateKey(s.startAt),
        completedAt: s.completedAt
          ? formatUtcDateKey(s.completedAt)
          : undefined,
      }));

    return {
      id: day.id,
      name: day.name,
      isRest: day.isRestDay,
      coverImageUrl: day.coverImageUrl ?? undefined,
      estimatedDurationInSeconds: day.estimatedDurationInSeconds,
      weekDay: day.weekDay,
      exercises,
      sessions,
    };
  }
}
