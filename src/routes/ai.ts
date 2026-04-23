import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  UIMessage,
} from "ai";
import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

import { WeekDay } from "../generated/prisma/enums.js";
import { auth } from "../lib/auth.js";
import { CreateWorkoutPlan } from "../usecases/create-workout-plan.js";
import { GetUserTrainData } from "../usecases/get-user-train-data.js";
import { ListWorkoutPlans } from "../usecases/list-workout-plans.js";
import { UpsertUserTrainData } from "../usecases/upsert-user-train-data.js";

const SYSTEM_PROMPT = `Você é um personal trainer virtual especialista em montagem de planos de treino de musculação. Seu tom é amigável, motivador e usa linguagem simples — sem jargões técnicos. Seu público são pessoas leigas em musculação.

Respostas sempre curtas e objetivas.

## Fluxo inicial (OBRIGATÓRIO)

SEMPRE chame a tool getUserTrainData ANTES de qualquer interação com o usuário.

- Se retornou null (usuário sem dados cadastrados): peça em uma ÚNICA mensagem o nome, peso (em kg), altura (em cm), idade e percentual de gordura corporal. Perguntas simples e diretas. Após receber as respostas, salve com a tool updateUserTrainData. IMPORTANTE: converta o peso de kg para gramas antes de salvar (ex: 80 kg = 80000 gramas).
- Se retornou dados (usuário já cadastrado): cumprimente pelo nome.

## Criar plano de treino

Quando o usuário quiser um plano de treino:
1. Pergunte (poucas perguntas, simples e diretas): objetivo, quantos dias por semana pode treinar e se tem alguma restrição física ou lesão.
2. Monte o plano e chame a tool createWorkoutPlan.

O plano DEVE ter exatamente 7 dias (MONDAY a SUNDAY). Dias sem treino devem ter isRest: true, exercises: [] e estimatedDurationInSeconds: 0.

### Divisões de treino (splits)

Escolha a divisão adequada com base nos dias disponíveis:
- 2-3 dias/semana: Full Body ou ABC (A: Peito+Tríceps, B: Costas+Bíceps, C: Pernas+Ombros)
- 4 dias/semana: Upper/Lower (recomendado, cada grupo 2x/semana) ou ABCD (A: Peito+Tríceps, B: Costas+Bíceps, C: Pernas, D: Ombros+Abdômen)
- 5 dias/semana: PPLUL — Push/Pull/Legs + Upper/Lower (superior 3x, inferior 2x/semana)
- 6 dias/semana: PPL 2x — Push/Pull/Legs repetido

### Princípios de montagem

- Músculos sinérgicos juntos (peito+tríceps, costas+bíceps)
- Exercícios compostos primeiro, isoladores depois
- 4 a 8 exercícios por sessão
- 3-4 séries por exercício. 8-12 reps (hipertrofia), 4-6 reps (força)
- Descanso entre séries: 60-90s (hipertrofia), 2-3min (compostos pesados)
- Evitar treinar o mesmo grupo muscular em dias consecutivos
- Nomes descritivos para cada dia (ex: "Superior A - Peito e Costas", "Descanso")

### Imagens de capa (coverImageUrl)

SEMPRE forneça um coverImageUrl para cada dia de treino. Escolha com base no foco muscular:

Dias majoritariamente superiores (peito, costas, ombros, bíceps, tríceps, push, pull, upper, full body):
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCO3y8pQ6GBg8iqe9pP2JrHjwd1nfKtVSQskI0v
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCOW3fJmqZe4yoUcwvRPQa8kmFprzNiC30hqftL

Dias majoritariamente inferiores (pernas, glúteos, quadríceps, posterior, panturrilha, legs, lower):
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCOgCHaUgNGronCvXmSzAMs1N3KgLdE5yHT6Ykj
- https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCO85RVu3morROwZk5NPhs1jzH7X8TyEvLUCGxY

Alterne entre as duas opções de cada categoria para variar. Dias de descanso usam imagem de superior.`;

export const aiRoutes = async (app: FastifyInstance) => {
  app
    .withTypeProvider<ZodTypeProvider>()
    .post("", async function (request, reply) {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      if (!session) {
        return reply.status(401).send({
          error: "Unauthorized",
          code: "UNAUTHORIZED",
        });
      }

      const userId = session.user.id;
      const { messages } = request.body as { messages: UIMessage[] };

      const result = streamText({
        model: google("gemini-2.5-flash"),
        system: SYSTEM_PROMPT,
        tools: {
          getUserTrainData: tool({
            description:
              "Busca os dados de treino do usuário autenticado (peso, altura, idade, gordura corporal). Retorna null se não existirem.",
            inputSchema: z.object({}),
            execute: async () => {
              const getUserTrainData = new GetUserTrainData();
              return getUserTrainData.execute({ userId });
            },
          }),
          updateUserTrainData: tool({
            description:
              "Cria ou atualiza os dados de treino do usuário autenticado.",
            inputSchema: z.object({
              weightInGrams: z
                .number()
                .int()
                .describe("Peso em gramas (ex: 80000 para 80kg)"),
              heightInCentimeters: z
                .number()
                .int()
                .describe("Altura em centímetros"),
              age: z.number().int().describe("Idade em anos"),
              bodyFatPercentage: z
                .number()
                .int()
                .min(0)
                .max(100)
                .describe(
                  "Percentual de gordura corporal, inteiro de 0 a 100 (100 representa 100%)",
                ),
            }),
            execute: async (params) => {
              const upsertUserTrainData = new UpsertUserTrainData();
              return upsertUserTrainData.execute({ userId, ...params });
            },
          }),
          getWorkoutPlans: tool({
            description:
              "Lista todos os planos de treino do usuário autenticado.",
            inputSchema: z.object({}),
            execute: async () => {
              const listWorkoutPlans = new ListWorkoutPlans();
              return listWorkoutPlans.execute({ userId });
            },
          }),
          createWorkoutPlan: tool({
            description:
              "Cria um novo plano de treino completo para o usuário. Deve conter exatamente 7 dias (MONDAY a SUNDAY).",
            inputSchema: z.object({
              name: z.string().describe("Nome do plano de treino"),
              workoutDays: z
                .array(
                  z.object({
                    name: z
                      .string()
                      .describe("Nome do dia (ex: Peito e Tríceps, Descanso)"),
                    weekDay: z.enum(WeekDay).describe("Dia da semana"),
                    isRest: z
                      .boolean()
                      .describe(
                        "Se é dia de descanso (true) ou treino (false)",
                      ),
                    estimatedDurationInSeconds: z
                      .number()
                      .describe(
                        "Duração estimada em segundos (0 para dias de descanso)",
                      ),
                    coverImageUrl: z
                      .string()
                      .url()
                      .describe("URL da imagem de capa do dia de treino"),
                    exercises: z
                      .array(
                        z.object({
                          order: z
                            .number()
                            .describe("Ordem do exercício no dia"),
                          name: z.string().describe("Nome do exercício"),
                          sets: z.number().describe("Número de séries"),
                          reps: z.number().describe("Número de repetições"),
                          restTimeInSeconds: z
                            .number()
                            .describe(
                              "Tempo de descanso entre séries em segundos",
                            ),
                        }),
                      )
                      .describe(
                        "Lista de exercícios (vazia para dias de descanso)",
                      ),
                  }),
                )
                .describe(
                  "Array com exatamente 7 dias de treino (MONDAY a SUNDAY)",
                ),
            }),
            execute: async (input) => {
              const createWorkoutPlan = new CreateWorkoutPlan();
              return createWorkoutPlan.execute({
                userId,
                name: input.name,
                workoutDays: input.workoutDays,
              });
            },
          }),
        },
        stopWhen: stepCountIs(5),
        messages: await convertToModelMessages(messages),
      });

      const response = result.toUIMessageStreamResponse();
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(response.body);
    });
};
