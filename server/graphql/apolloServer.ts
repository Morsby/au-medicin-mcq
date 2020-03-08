import { ApolloServer } from 'apollo-server-express';
import { resolvers, typeDefs } from 'graphql/types';
import jsonWebToken from 'jsonwebtoken';
import User from 'models/user';
import Express from 'express';
import { createCommentsLoader } from './dataloaders/commentLoaders';
import {
  createUserAnswersLoader,
  createUserAnswersByQuestionIdLoader
} from './dataloaders/answerLoaders';
import { createExamSetsLoader } from './dataloaders/examSetLoaders';
import { createLikesLoader } from './dataloaders/likeLoaders';
import {
  createSpecialtyLoader,
  createSpecialtyVoteLoader,
  createTagLoader,
  createTagVotesLoader
} from './dataloaders/metadataLoaders';
import { createQuestionLoader } from './dataloaders/questionLoaders';
import { createSemesterLoader } from './dataloaders/semesterLoaders';
import { createUserLoader, createBookmarkLoader } from './dataloaders/userLoaders';
const secret = process.env.SECRET || '';

const decodeUser = (jwt: string) => {
  if (!jwt) return null;
  try {
    return jsonWebToken.verify(jwt, secret);
  } catch (error) {
    return null;
  }
};

export const generateContext = (req: Express.Request, res: Express.Response) => ({
  userAnswersLoader: createUserAnswersLoader(),
  userAnswersByQuestionIdLoader: createUserAnswersByQuestionIdLoader(),
  examSetsLoader: createExamSetsLoader(),
  likesLoader: createLikesLoader(),
  specialtyLoader: createSpecialtyLoader(),
  specialtyVoteLoader: createSpecialtyVoteLoader(),
  tagLoader: createTagLoader(),
  tagVotesLoader: createTagVotesLoader(),
  questionLoader: createQuestionLoader(),
  semesterLoader: createSemesterLoader(),
  userLoader: createUserLoader(),
  bookmarkLoader: createBookmarkLoader(),
  commentsLoader: createCommentsLoader(),
  user: decodeUser(req.cookies.user) as User,
  res,
  req
});

export type Context = ReturnType<typeof generateContext>;

export default new ApolloServer({
  resolvers,
  typeDefs,
  context: ({ req, res }) => generateContext(req, res),
  tracing: process.env.NODE_ENV !== 'production'
});
