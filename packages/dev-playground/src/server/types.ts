import { type FastifyReply, type FastifyRequest } from 'fastify'

export interface FastifyContext {
  req: FastifyRequest
  reply: FastifyReply
}
