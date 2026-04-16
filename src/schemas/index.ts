import z from "zod";

import { WeekDay } from "../generated/prisma/enums.js";

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
