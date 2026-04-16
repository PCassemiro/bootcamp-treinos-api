import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  workoutPlanId: string;
  workoutDayId: string;
  sessionId: string;
  completedAt: string;
}

export interface OutputDto {
  id: string;
  completedAt: string;
  startedAt: string;
}

export class UpdateWorkoutSession {
  async execute(dto: InputDto): Promise<OutputDto> {
    const workoutPlan = await prisma.workoutPlan.findUnique({
      where: { id: dto.workoutPlanId },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!workoutPlan) {
      throw new NotFoundError("Workout plan not found");
    }

    if (workoutPlan.userId !== dto.userId) {
      throw new ForbiddenError("User is not the owner of this workout plan");
    }

    const workoutDay = await prisma.workoutDay.findUnique({
      where: { id: dto.workoutDayId },
      select: {
        id: true,
        workoutPlanId: true,
      },
    });

    if (!workoutDay || workoutDay.workoutPlanId !== dto.workoutPlanId) {
      throw new NotFoundError("Workout day not found");
    }

    const existing = await prisma.workoutSession.findUnique({
      where: { id: dto.sessionId },
      select: {
        id: true,
        workoutDayId: true,
        startAt: true,
        completedAt: true,
      },
    });

    if (!existing || existing.workoutDayId !== dto.workoutDayId) {
      throw new NotFoundError("Workout session not found");
    }

    const completedAtDate = new Date(dto.completedAt);
    if (completedAtDate.getTime() < existing.startAt.getTime()) {
      throw new ConflictError("completedAt must be on or after startedAt");
    }

    const updated = await prisma.workoutSession.update({
      where: { id: dto.sessionId },
      data: {
        completedAt: completedAtDate,
      },
      select: {
        id: true,
        startAt: true,
      },
    });

    return {
      id: updated.id,
      startedAt: updated.startAt.toISOString(),
      completedAt: completedAtDate.toISOString(),
    };
  }
}
