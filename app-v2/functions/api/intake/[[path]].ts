// GET /api/intake/* — see server/intake.ts.
import { handleIntake, type IntakeEnv } from '../../../server/intake';

interface EventContext {
  request: Request;
  env: IntakeEnv;
}

export const onRequest = (context: EventContext): Promise<Response> => handleIntake(context.request, context.env);
