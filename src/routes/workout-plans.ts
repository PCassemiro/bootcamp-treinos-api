import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

import { ForbiddenError, NotFoundError } from "../errors/index.js";
import { auth } from "../lib/auth.js";
import {
  ErrorSchema,
  ListWorkoutPlansQuerySchema,
  ListWorkoutPlansResponseSchema,
  WorkoutPlanByIdResponseSchema,
  WorkoutPlanDayDetailResponseSchema,
} from "../schemas/index.js";
import {
  GetWorkoutPlanById,
  type OutputDto as GetWorkoutPlanByIdOutputDto,
} from "../usecases/get-workout-plan-by-id.js";
import {
  GetWorkoutPlanDayById,
  type OutputDto as GetWorkoutPlanDayByIdOutputDto,
} from "../usecases/get-workout-plan-day-by-id.js";
import {
  ListWorkoutPlans,
  type OutputDto as ListWorkoutPlansOutputDto,
} from "../usecases/list-workout-plans.js";

export const workoutPlansRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/",
    schema: {
      tags: ["Workout Plans"],
      summary: "List workout plans",
      querystring: ListWorkoutPlansQuerySchema,
      response: {
        200: ListWorkoutPlansResponseSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const listWorkoutPlans = new ListWorkoutPlans();
        const result: ListWorkoutPlansOutputDto =
          await listWorkoutPlans.execute({
            userId: session.user.id,
            active: request.query.active,
          });

        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/:workoutPlanId/days/:workoutDayId",
    schema: {
      tags: ["Workout Plans"],
      summary: "Get a workout plan day with exercises and sessions",
      params: z.object({
        workoutPlanId: z.uuid(),
        workoutDayId: z.uuid(),
      }),
      response: {
        200: WorkoutPlanDayDetailResponseSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        403: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const getWorkoutPlanDayById = new GetWorkoutPlanDayById();
        const result: GetWorkoutPlanDayByIdOutputDto =
          await getWorkoutPlanDayById.execute({
            userId: session.user.id,
            workoutPlanId: request.params.workoutPlanId,
            workoutDayId: request.params.workoutDayId,
          });

        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);
        if (error instanceof ForbiddenError) {
          return reply.status(403).send({
            error: error.message,
            code: "FORBIDDEN_ERROR",
          });
        }
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND_ERROR",
          });
        }
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/:id",
    schema: {
      tags: ["Workout Plans"],
      summary: "Get a workout plan by id",
      params: z.object({
        id: z.uuid(),
      }),
      response: {
        200: WorkoutPlanByIdResponseSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        403: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const getWorkoutPlanById = new GetWorkoutPlanById();
        const result: GetWorkoutPlanByIdOutputDto =
          await getWorkoutPlanById.execute({
            userId: session.user.id,
            workoutPlanId: request.params.id,
          });

        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);
        if (error instanceof ForbiddenError) {
          return reply.status(403).send({
            error: error.message,
            code: "FORBIDDEN_ERROR",
          });
        }
        if (error instanceof NotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND_ERROR",
          });
        }
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });
};
