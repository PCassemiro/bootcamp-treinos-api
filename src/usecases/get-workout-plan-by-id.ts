import { ForbiddenError, NotFoundError } from "../errors/index.js";
import { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

const WEEK_ORDER: WeekDay[] = [
  WeekDay.SUNDAY,
  WeekDay.MONDAY,
  WeekDay.TUESDAY,
  WeekDay.WEDNESDAY,
  WeekDay.THURSDAY,
  WeekDay.FRIDAY,
  WeekDay.SATURDAY,
];

interface InputDto {
  userId: string;
  workoutPlanId: string;
}

export interface OutputDto {
  id: string;
  name: string;
  workoutDays: Array<{
    id: string;
    weekDay: WeekDay;
    name: string;
    isRest: boolean;
    coverImageUrl?: string;
    estimatedDurationInSeconds: number;
    exercisesCount: number;
  }>;
}

export class GetWorkoutPlanById {
  async execute(dto: InputDto): Promise<OutputDto> {
    const plan = await prisma.workoutPlan.findUnique({
      where: { id: dto.workoutPlanId },
      include: {
        workoutDays: {
          include: {
            _count: {
              select: { exercises: true },
            },
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundError("Workout plan not found");
    }

    if (plan.userId !== dto.userId) {
      throw new ForbiddenError("User is not the owner of this workout plan");
    }

    const sortedDays = [...plan.workoutDays].sort(
      (a, b) =>
        WEEK_ORDER.indexOf(a.weekDay) - WEEK_ORDER.indexOf(b.weekDay),
    );

    return {
      id: plan.id,
      name: plan.name,
      workoutDays: sortedDays.map((day) => ({
        id: day.id,
        weekDay: day.weekDay,
        name: day.name,
        isRest: day.isRestDay,
        coverImageUrl: day.coverImageUrl ?? undefined,
        estimatedDurationInSeconds: day.estimatedDurationInSeconds,
        exercisesCount: day._count.exercises,
      })),
    };
  }
}
