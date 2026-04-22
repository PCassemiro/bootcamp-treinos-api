import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  active?: boolean;
}

export interface OutputDto {
  workoutPlans: Array<{
    id: string;
    name: string;
    isActive: boolean;
    workoutDays: Array<{
      id: string;
      name: string;
      weekDay: WeekDay;
      isRest: boolean;
      estimatedDurationInSeconds: number;
      coverImageUrl?: string;
      exercises: Array<{
        id: string;
        name: string;
        order: number;
        workoutDayId: string;
        sets: number;
        reps: number;
        restTimeInSeconds: number;
      }>;
    }>;
  }>;
}

export class ListWorkoutPlans {
  async execute(dto: InputDto): Promise<OutputDto> {
    const plans = await prisma.workoutPlan.findMany({
      where: {
        userId: dto.userId,
        ...(dto.active !== undefined && { isActive: dto.active }),
      },
      include: {
        workoutDays: {
          include: {
            exercises: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      workoutPlans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        isActive: plan.isActive,
        workoutDays: plan.workoutDays.map((day) => ({
          id: day.id,
          name: day.name,
          weekDay: day.weekDay,
          isRest: day.isRestDay,
          estimatedDurationInSeconds: day.estimatedDurationInSeconds,
          coverImageUrl: day.coverImageUrl ?? undefined,
          exercises: day.exercises
            .sort((a, b) => a.order - b.order)
            .map((e) => ({
              id: e.id,
              name: e.name,
              order: e.order,
              workoutDayId: e.workoutDayId,
              sets: e.sets,
              reps: e.reps,
              restTimeInSeconds: e.restTimeInSeconds,
            })),
        })),
      })),
    };
  }
}
