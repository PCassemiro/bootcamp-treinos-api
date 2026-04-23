import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import z from "zod";

import { WeekDay } from "../generated/prisma/enums.js";

dayjs.extend(utc);

export const ErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
});

export const UpdateWorkoutSessionBodySchema = z.object({
  completedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "Must be a valid ISO 8601 datetime string",
  }),
});

export const UpdateWorkoutSessionResponseSchema = z.object({
  id: z.uuid(),
  completedAt: z.string(),
  startedAt: z.string(),
});

export const HomeDateParamsSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => dayjs.utc(s, "YYYY-MM-DD", true).isValid(), {
      message: "Invalid date",
    }),
});

export const HomeConsistencyDaySchema = z.object({
  workoutDayCompleted: z.boolean(),
  workoutDayStarted: z.boolean(),
});

export const HomeResponseSchema = z.object({
  activeWorkoutPlanId: z.uuid(),
  todayWorkoutDay: z.object({
    workoutPlanId: z.uuid(),
    id: z.uuid(),
    name: z.string(),
    isRest: z.boolean(),
    weekDay: z.enum(WeekDay),
    estimatedDurationInSeconds: z.number().int(),
    coverImageUrl: z.string().url().optional(),
    exercisesCount: z.number().int(),
  }),
  workoutStreak: z.number().int(),
  consistencyByDay: z.record(z.iso.date(), HomeConsistencyDaySchema),
});

export const WorkoutPlanByIdDaySchema = z.object({
  id: z.uuid(),
  weekDay: z.enum(WeekDay),
  name: z.string(),
  isRest: z.boolean(),
  coverImageUrl: z.string().url().optional(),
  estimatedDurationInSeconds: z.number().int(),
  exercisesCount: z.number().int(),
});

export const WorkoutPlanByIdResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  workoutDays: z.array(WorkoutPlanByIdDaySchema),
});

const yyyyMmDd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Expected YYYY-MM-DD" });

export const WorkoutExerciseDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  order: z.number().int(),
  workoutDayId: z.uuid(),
  sets: z.number().int(),
  reps: z.number().int(),
  restTimeInSeconds: z.number().int(),
});

export const WorkoutPlanDaySessionSchema = z.object({
  id: z.uuid(),
  workoutDayId: z.uuid(),
  startedAt: yyyyMmDd.optional(),
  completedAt: yyyyMmDd.optional(),
});

export const WorkoutPlanDayDetailResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  isRest: z.boolean(),
  coverImageUrl: z.string().url().optional(),
  estimatedDurationInSeconds: z.number().int(),
  weekDay: z.enum(WeekDay),
  exercises: z.array(WorkoutExerciseDetailSchema),
  sessions: z.array(WorkoutPlanDaySessionSchema),
});

export const StatsQuerySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
});

export const StatsConsistencyDaySchema = z.object({
  workoutDayCompleted: z.boolean(),
  workoutDayStarted: z.boolean(),
});

export const StatsResponseSchema = z.object({
  workoutStreak: z.number().int(),
  consistencyByDay: z.record(z.iso.date(), StatsConsistencyDaySchema),
  completedWorkoutsCount: z.number().int(),
  conclusionRate: z.number(),
  totalTimeInSeconds: z.number().int(),
});

export const ListWorkoutPlansQuerySchema = z.object({
  active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

export const ListWorkoutPlansResponseSchema = z.object({
  workoutPlans: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      isActive: z.boolean(),
      workoutDays: z.array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          weekDay: z.enum(WeekDay),
          isRest: z.boolean(),
          estimatedDurationInSeconds: z.number().int(),
          coverImageUrl: z.string().url().optional(),
          exercises: z.array(WorkoutExerciseDetailSchema),
        }),
      ),
    }),
  ),
});

export const UserTrainDataResponseSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  weightInGrams: z.number().int(),
  heightInCentimeters: z.number().int(),
  age: z.number().int(),
  bodyFatPercentage: z.number().min(1).max(100),
});

export const WorkoutPlanSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1),
  workoutDays: z.array(
    z.object({
      name: z.string().trim().min(1),
      weekDay: z.enum(WeekDay),
      isRest: z.boolean().default(false),
      estimatedDurationInSeconds: z.number().min(1),
      coverImageUrl: z
        .string()
        .url()
        .optional()
        .describe("URL da imagem de capa do dia de treino"),
      exercises: z.array(
        z.object({
          order: z.number().min(0),
          name: z.string().trim().min(1),

          sets: z.number().min(1),
          reps: z.number().min(1),
          restTimeInSeconds: z.number().min(1),
        }),
      ),
    }),
  ),
});
